"""Benchmark backend endpoint latency — the diagnostic tool for cache evaluation.

Measures response times of FastAPI endpoints directly (no Next.js proxy in
the loop), to compare "before" vs "after" once caching is implemented for
the endpoints recommended in docs/cache-evaluation.md.

Usage (via uv or a plain venv):
    python benchmark_endpoints.py --label before
    python benchmark_endpoints.py --label after
    python benchmark_endpoints.py --compare before after

Environment variables:
    BENCH_BASE_URL   Backend base URL (default: http://localhost:8000)
    BENCH_EMAIL      Login email for authenticated requests (default: seed admin)
    BENCH_PASSWORD   Login password (default: seed admin password)
    BENCH_REQUESTS   Repetitions per endpoint, warm-up excluded (default: 20)
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import httpx

RESULTS_DIR = Path(__file__).resolve().parent / "benchmarks" / "results"

DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_EMAIL = "admin@brasaland.com"
DEFAULT_PASSWORD = "Admin123!"
DEFAULT_REQUESTS = 20
WARMUP_REQUESTS = 2


@dataclass
class EndpointSpec:
    name: str
    method: str
    path: str
    requires_auth: bool = True
    # Endpoints kept as a "control group": known NOT to be cache candidates
    # (e.g. incident status), so a before/after comparison can confirm any
    # speedup actually comes from caching and not from environment noise.
    control: bool = False


# Endpoints to benchmark: cache candidates identified in
# docs/cache-evaluation.md, plus a couple of "no cacheable" endpoints as a
# control group.
ENDPOINTS: list[EndpointSpec] = [
    EndpointSpec("incidents.metrics", "GET", "/incidents/metrics"),
    EndpointSpec("inventory.products", "GET", "/inventory/products"),
    EndpointSpec("inventory.orders", "GET", "/inventory/orders"),
    EndpointSpec("suppliers.list", "GET", "/suppliers"),
    EndpointSpec("incidents.list", "GET", "/incidents", control=True),
    # "{incident_id}" is resolved at runtime from the first incident returned
    # by GET /incidents — incident ids are UUIDs, not sequential integers.
    EndpointSpec("incidents.detail", "GET", "/incidents/{incident_id}", control=True),
]


@dataclass
class EndpointResult:
    name: str
    method: str
    path: str
    samples_ms: list[float] = field(default_factory=list)
    error: str | None = None

    def stats(self) -> dict:
        if not self.samples_ms:
            return {"error": self.error or "no samples"}
        sorted_samples = sorted(self.samples_ms)
        return {
            "min_ms": round(sorted_samples[0], 2),
            "avg_ms": round(statistics.mean(sorted_samples), 2),
            "p50_ms": round(statistics.median(sorted_samples), 2),
            "p95_ms": round(_percentile(sorted_samples, 95), 2),
            "max_ms": round(sorted_samples[-1], 2),
            "samples": len(sorted_samples),
        }


def _percentile(sorted_values: list[float], pct: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    k = (len(sorted_values) - 1) * (pct / 100)
    lower, upper = int(k), min(int(k) + 1, len(sorted_values) - 1)
    if lower == upper:
        return sorted_values[lower]
    return sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * (k - lower)


def login(client: httpx.Client, email: str, password: str) -> str:
    """Authenticate and return a bearer token (ApiResponse[LoginData] shape)."""
    response = client.post("/auth/login", json={"email": email, "password": password})
    response.raise_for_status()
    body = response.json()
    return body["data"]["access_token"]


def resolve_placeholders(client: httpx.Client, headers: dict, path: str) -> str | None:
    """Substitute runtime placeholders (e.g. "{incident_id}") in an endpoint
    path. Returns None if a placeholder can't be resolved (e.g. no incidents
    exist yet), so the caller can skip that endpoint instead of failing.
    """
    if "{incident_id}" in path:
        response = client.get("/incidents", params={"limit": 1}, headers=headers)
        if response.status_code >= 400 or not response.json().get("data"):
            return None
        incident_id = response.json()["data"][0]["id"]
        path = path.replace("{incident_id}", incident_id)
    return path


def run_benchmark(
    base_url: str,
    email: str,
    password: str,
    repetitions: int,
) -> list[EndpointResult]:
    results: list[EndpointResult] = []

    with httpx.Client(base_url=f"{base_url}/api/v1", timeout=30.0) as client:
        token = None
        try:
            token = login(client, email, password)
        except httpx.HTTPError as exc:
            print(f"⚠️  Login failed ({exc}); authenticated endpoints will be skipped.", file=sys.stderr)

        for spec in ENDPOINTS:
            result = EndpointResult(name=spec.name, method=spec.method, path=spec.path)

            if spec.requires_auth and token is None:
                result.error = "skipped: no auth token"
                results.append(result)
                continue

            headers = {"Authorization": f"Bearer {token}"} if spec.requires_auth else {}

            try:
                path = resolve_placeholders(client, headers, spec.path)
                if path is None:
                    result.error = "skipped: could not resolve path placeholder (no data?)"
                    results.append(result)
                    continue

                for _ in range(WARMUP_REQUESTS):
                    client.request(spec.method, path, headers=headers)

                for _ in range(repetitions):
                    start = time.perf_counter()
                    response = client.request(spec.method, path, headers=headers)
                    elapsed_ms = (time.perf_counter() - start) * 1000
                    if response.status_code >= 400:
                        result.error = f"HTTP {response.status_code}: {response.text[:200]}"
                        break
                    result.samples_ms.append(elapsed_ms)
            except httpx.HTTPError as exc:
                result.error = str(exc)

            results.append(result)

    return results


def save_results(label: str, results: list[EndpointResult]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = RESULTS_DIR / f"{label}_{timestamp}.json"

    payload = {
        "label": label,
        "timestamp": timestamp,
        "endpoints": [
            {
                "name": r.name,
                "method": r.method,
                "path": r.path,
                **r.stats(),
            }
            for r in results
        ],
    }

    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return out_path


def print_report(results: list[EndpointResult]) -> None:
    print()
    header = f"{'Endpoint':<24} {'min':>8} {'avg':>8} {'p50':>8} {'p95':>8} {'max':>8}  (ms)"
    print(header)
    print("-" * len(header))
    for r in results:
        stats = r.stats()
        if "error" in stats:
            print(f"{r.name:<24} ERROR: {stats['error']}")
            continue
        print(
            f"{r.name:<24} {stats['min_ms']:>8} {stats['avg_ms']:>8} "
            f"{stats['p50_ms']:>8} {stats['p95_ms']:>8} {stats['max_ms']:>8}"
        )
    print()


def _latest_run_for_label(label: str) -> dict:
    candidates = sorted(RESULTS_DIR.glob(f"{label}_*.json"))
    if not candidates:
        print(f"❌ No saved runs found for label '{label}' in {RESULTS_DIR}", file=sys.stderr)
        sys.exit(1)
    return json.loads(candidates[-1].read_text(encoding="utf-8"))


def compare(label_a: str, label_b: str) -> None:
    run_a = _latest_run_for_label(label_a)
    run_b = _latest_run_for_label(label_b)

    by_name_b = {e["name"]: e for e in run_b["endpoints"]}

    header = f"{'Endpoint':<24} {label_a + ' avg':>14} {label_b + ' avg':>14} {'change':>10}"
    print()
    print(header)
    print("-" * len(header))

    for endpoint_a in run_a["endpoints"]:
        name = endpoint_a["name"]
        endpoint_b = by_name_b.get(name)
        avg_a = endpoint_a.get("avg_ms")
        avg_b = endpoint_b.get("avg_ms") if endpoint_b else None

        if avg_a is None or avg_b is None:
            print(f"{name:<24} {'n/a':>14} {'n/a':>14} {'n/a':>10}")
            continue

        change_pct = ((avg_b - avg_a) / avg_a) * 100 if avg_a else 0.0
        arrow = "↓" if change_pct < 0 else ("↑" if change_pct > 0 else "=")
        print(f"{name:<24} {avg_a:>11.2f}ms {avg_b:>11.2f}ms {arrow}{abs(change_pct):>8.1f}%")

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--label", help="Run the benchmark and save results under this label")
    group.add_argument(
        "--compare",
        nargs=2,
        metavar=("LABEL_A", "LABEL_B"),
        help="Compare the latest saved runs for two labels (no new requests made)",
    )
    parser.add_argument(
        "--requests",
        type=int,
        default=int(os.environ.get("BENCH_REQUESTS", DEFAULT_REQUESTS)),
        help=f"Repetitions per endpoint (default: {DEFAULT_REQUESTS})",
    )
    args = parser.parse_args()

    if args.compare:
        compare(*args.compare)
        return

    base_url = os.environ.get("BENCH_BASE_URL", DEFAULT_BASE_URL)
    email = os.environ.get("BENCH_EMAIL", DEFAULT_EMAIL)
    password = os.environ.get("BENCH_PASSWORD", DEFAULT_PASSWORD)

    print(f"🔎 Benchmarking {base_url} (label='{args.label}', {args.requests} requests/endpoint)…")
    results = run_benchmark(base_url, email, password, args.requests)
    print_report(results)

    out_path = save_results(args.label, results)
    print(f"💾 Saved to {out_path.relative_to(Path(__file__).resolve().parent)}")


if __name__ == "__main__":
    main()
