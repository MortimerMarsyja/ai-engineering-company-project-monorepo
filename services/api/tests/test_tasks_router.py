"""HTTP-contract tests for the background-task endpoints:

- POST /incidents/analyze — validation, 202 + task_id, broker-publish
  failure handling.
- GET  /tasks/{task_id}   — state mapping, success result, safe failure
  output, ownership/authorization, unknown-id handling.

Runs against the SQLite `sql_engine` fixture (users/task_submissions),
with the Celery task object itself replaced by a fake (no real
broker/worker involved) — these are the "unit tests covering mocks" the
task description explicitly allows for the HTTP contract layer; the real
broker/worker/Redis/Flower integration was verified manually (see the PR
description), and the task's own retry/backoff/dead-letter logic is
covered for real in test_celery_incidents_task.py.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert

from app.core.security import create_access_token
from app.main import app
from app.models.task_tracking_storage import task_submissions_table

pytestmark = pytest.mark.usefixtures("sql_engine")

VALID_CSV = (
    b"location_id,category,description,reporter_id,status,date,satisfaction_score,customer_id\n"
    b"COL-01,SUPPLY,A perfectly valid synthetic incident row,MGR-01,OPEN,2026-11-18,,\n"
)


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_user(role: str, user_id: int) -> str:
    from sqlalchemy import insert as sa_insert

    from app.models.user_storage import users_table
    from app.services.users import engine as users_engine

    with users_engine.connect() as conn:
        conn.execute(
            sa_insert(users_table).values(
                id=user_id,
                email=f"{role}{user_id}@test.com",
                hashed_password="x",
                is_active=True,
                role=role,
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
        )
        conn.commit()
    return create_access_token(subject=str(user_id), role=role)


def _seed_submission(task_id: str, task_name: str, submitted_by: int | None) -> None:
    from app.services.task_tracking import engine as tracking_engine

    with tracking_engine.connect() as conn:
        conn.execute(
            insert(task_submissions_table).values(
                task_id=task_id,
                task_name=task_name,
                submitted_by=submitted_by,
                created_at=datetime.now(timezone.utc),
                persisted_at=None,
            )
        )
        conn.commit()


class _FakeAsyncResult:
    def __init__(self, task_id: str, delay: bool = False):
        self.id = task_id


class _FakeTask:
    """Stands in for app.tasks.incidents.process_incidents_csv — exposes
    just the surface the router actually uses (.name, .apply_async)."""

    name = "app.tasks.incidents.process_incidents_csv"

    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail
        self.calls: list[dict] = []

    def apply_async(self, args=None, task_id=None, **kwargs):
        self.calls.append({"args": args, "task_id": task_id})
        if self.should_fail:
            raise ConnectionError("simulated broker publish failure")
        return _FakeAsyncResult(task_id)


async def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestSubmissionEndpoint:
    @pytest.mark.asyncio
    async def test_enqueues_and_returns_202_with_task_id(self, monkeypatch):
        fake_task = _FakeTask()
        monkeypatch.setattr("app.routers.incidents.process_incidents_csv", fake_task)
        token = _seed_user("user", 1)

        async with await _client() as client:
            resp = await client.post(
                "/api/v1/incidents/analyze",
                headers=_headers(token),
                files={"file": ("incidents.csv", io.BytesIO(VALID_CSV), "text/csv")},
            )

        assert resp.status_code == 202
        body = resp.json()
        assert "task_id" in body and body["task_id"]
        assert len(fake_task.calls) == 1
        assert fake_task.calls[0]["task_id"] == body["task_id"]
        # rows (plain, JSON-serializable data) and the submitter's id —
        # never a Request/UploadFile/session object.
        assert fake_task.calls[0]["args"][1] == 1

    @pytest.mark.asyncio
    async def test_rejects_empty_file_before_enqueueing(self, monkeypatch):
        fake_task = _FakeTask()
        monkeypatch.setattr("app.routers.incidents.process_incidents_csv", fake_task)
        token = _seed_user("user", 2)

        async with await _client() as client:
            resp = await client.post(
                "/api/v1/incidents/analyze",
                headers=_headers(token),
                files={"file": ("incidents.csv", io.BytesIO(b""), "text/csv")},
            )

        assert resp.status_code == 400
        assert fake_task.calls == [], "nothing should be enqueued for a rejected request"

    @pytest.mark.asyncio
    async def test_broker_publish_failure_does_not_return_202(self, monkeypatch):
        fake_task = _FakeTask(should_fail=True)
        monkeypatch.setattr("app.routers.incidents.process_incidents_csv", fake_task)
        token = _seed_user("user", 3)

        async with await _client() as client:
            resp = await client.post(
                "/api/v1/incidents/analyze",
                headers=_headers(token),
                files={"file": ("incidents.csv", io.BytesIO(VALID_CSV), "text/csv")},
            )

        assert resp.status_code != 202
        assert resp.status_code == 503

        # The submission row created just before the failed publish
        # attempt must be cleaned up — a GET /tasks/{id} for it must
        # report "not found", never a misleadingly-pending task.
        from app.services import task_tracking

        task_id = fake_task.calls[0]["task_id"]
        assert task_tracking.get_submission(task_id) is None


class TestStatusEndpoint:
    @pytest.mark.asyncio
    async def test_unknown_task_id_returns_404(self):
        token = _seed_user("user", 4)
        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/never-submitted", headers=_headers(token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_requires_authentication(self):
        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/some-id")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_non_owner_non_staff_is_forbidden(self, monkeypatch):
        owner_token = _seed_user("user", 5)
        other_token = _seed_user("user", 6)
        _seed_submission("task-a", "some.task", submitted_by=5)

        monkeypatch.setattr(
            "app.routers.tasks.celery_app.AsyncResult",
            lambda task_id: type("R", (), {"state": "PENDING", "result": None})(),
        )

        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/task-a", headers=_headers(other_token))
        assert resp.status_code == 403

        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/task-a", headers=_headers(owner_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_staff_can_view_a_task_they_do_not_own(self, monkeypatch):
        _seed_user("user", 7)
        staff_token = _seed_user("manager", 8)
        _seed_submission("task-b", "some.task", submitted_by=7)

        monkeypatch.setattr(
            "app.routers.tasks.celery_app.AsyncResult",
            lambda task_id: type("R", (), {"state": "PENDING", "result": None})(),
        )

        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/task-b", headers=_headers(staff_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "celery_state,expected_status",
        [
            ("PENDING", "pending"),
            ("STARTED", "started"),
            ("SUCCESS", "success"),
            ("FAILURE", "failure"),
            ("RETRY", "retry"),
        ],
    )
    async def test_state_mapping_to_lowercase(self, monkeypatch, celery_state, expected_status):
        token = _seed_user("user", 100)
        _seed_submission(f"task-state-{celery_state}", "some.task", submitted_by=100)

        monkeypatch.setattr(
            "app.routers.tasks.celery_app.AsyncResult",
            lambda task_id: type("R", (), {"state": celery_state, "result": None})(),
        )

        async with await _client() as client:
            resp = await client.get(f"/api/v1/tasks/task-state-{celery_state}", headers=_headers(token))

        assert resp.status_code == 200
        assert resp.json()["status"] == expected_status

    @pytest.mark.asyncio
    async def test_success_returns_the_json_serializable_result(self, monkeypatch):
        token = _seed_user("user", 101)
        _seed_submission("task-success", "some.task", submitted_by=101)

        summary = {"total_rows": 3, "persisted_count": 2}
        monkeypatch.setattr(
            "app.routers.tasks.celery_app.AsyncResult",
            lambda task_id: type("R", (), {"state": "SUCCESS", "result": summary})(),
        )

        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/task-success", headers=_headers(token))

        body = resp.json()
        assert body["status"] == "success"
        assert body["result"] == summary

    @pytest.mark.asyncio
    async def test_failure_returns_safe_error_not_the_raw_exception(self, monkeypatch):
        token = _seed_user("user", 102)
        _seed_submission("task-failure", "some.task", submitted_by=102)

        # Mocked read, not a real record_dead_letter() write: that
        # function uses a Postgres-only ON CONFLICT construct (see
        # app/services/task_tracking.py), which this SQLite-backed
        # HTTP-contract test suite deliberately doesn't exercise — its
        # real behavior is covered against the real database in
        # test_task_tracking.py.
        monkeypatch.setattr(
            "app.routers.tasks.task_tracking.get_dead_letter",
            lambda task_id: {"error_message": "Connection to database failed"},
        )

        raw_exc = RuntimeError("super secret internal traceback stuff, host=10.0.0.5")
        monkeypatch.setattr(
            "app.routers.tasks.celery_app.AsyncResult",
            lambda task_id: type("R", (), {"state": "FAILURE", "result": raw_exc})(),
        )

        async with await _client() as client:
            resp = await client.get("/api/v1/tasks/task-failure", headers=_headers(token))

        body = resp.json()
        assert body["status"] == "failure"
        # The safe, persisted dead-letter message — never the raw
        # exception's str()/repr(), which could leak internals.
        assert body["result"] == {"error": "Connection to database failed"}
        assert "10.0.0.5" not in str(body)
        assert "traceback" not in str(body).lower()
