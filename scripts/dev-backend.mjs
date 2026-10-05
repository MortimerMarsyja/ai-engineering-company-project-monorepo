import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDirectory = fileURLToPath(new URL("../services/api/", import.meta.url));
const python = fileURLToPath(new URL(
  process.platform === "win32"
    ? "../services/api/.venv/Scripts/python.exe"
    : "../services/api/.venv/bin/python",
  import.meta.url,
));
const environment = { ...process.env };

// Some development tools export DEBUG=release; let the API's .env supply its boolean.
if (environment.DEBUG && !/^(0|1|true|false|yes|no|on|off|y|n|t|f)$/i.test(environment.DEBUG)) {
  delete environment.DEBUG;
}

const useVirtualEnvironment = existsSync(python);
const child = spawn(
  useVirtualEnvironment ? python : "uv",
  [
    ...(useVirtualEnvironment ? ["-m"] : ["run"]),
    "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000",
  ],
  { cwd: apiDirectory, env: environment, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Unable to start the API: ${error.message}. Install uv or create services/api/.venv with the API dependencies.`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
