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

const useVirtualEnvironment = existsSync(python);
const child = spawn(
  useVirtualEnvironment ? python : "uv",
  [
    ...(useVirtualEnvironment ? ["-m"] : ["run"]),
    "pytest", "--cov=app", "--cov-report=term-missing",
    ...process.argv.slice(2),
  ],
  { cwd: apiDirectory, env: process.env, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Unable to run backend tests: ${error.message}. Install uv or create services/api/.venv with the API's [test] dependencies.`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
