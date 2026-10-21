import { defineConfig } from "@playwright/test";

// Node 20.6+ native env loader — no dotenv dependency needed. Missing
// .env is fine: helpers/config.ts's defaults cover local dev.
try {
  process.loadEnvFile();
} catch {
  // no .env present — fall back to helpers/config.ts defaults
}

export default defineConfig({
  testDir: "./tests",
  // Lighthouse scores are sensitive to CPU contention — two audits
  // running at once would skew both. Always serial.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: "list",
  webServer: [
    {
      command:
        "pnpm --filter brasaland-web build && pnpm --filter brasaland-web start -p 3000",
      url: "http://localhost:3000",
      // Always false: this suite audits a specific production build, and
      // silently attaching to whatever already answers on this port (e.g.
      // a `docker compose` stack, or a stray `next dev`) produces audits
      // of the wrong app with no indication anything's off — fail loudly
      // on a port conflict (EADDRINUSE) instead.
      reuseExistingServer: false,
      timeout: 180_000,
      cwd: "../../",
    },
    {
      command:
        "pnpm --filter brasaland-backoffice build && pnpm --filter brasaland-backoffice start -p 3001",
      url: "http://localhost:3001",
      reuseExistingServer: false,
      timeout: 180_000,
      cwd: "../../",
      env: {
        // Route handlers (app/api/proxy/**) read these server-side, at
        // request time — not baked in at build. Both apps run on the
        // bare host for this tool (no Docker), so "localhost" is
        // correct here, unlike the docker-compose setup where it has to
        // be the "backend" service name instead.
        NEXT_PUBLIC_API_URL: "http://localhost:8000/api/v1",
        BACKEND_INTERNAL_URL: "http://localhost:8000/api/v1",
      },
    },
  ],
});
