/**
 * Cross-platform launcher for the Sach-AI inference service.
 *
 * `npm --prefix ml-service run dev` (used by the root `dev:all` / `dev:ml`
 * scripts) executes this file with Node, which is guaranteed to be present.
 * It picks the project virtualenv's Python when it exists (.venv first, the
 * legacy venv/ second) and falls back to PATH python, so the service starts
 * the same way on Windows, macOS and Linux.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const bin = isWin ? "Scripts/python.exe" : "bin/python";

const candidates = [
  path.join(dir, ".venv", bin),
  path.join(dir, "venv", bin),
  isWin ? "python" : "python3",
];

const python = candidates.find((p) => (path.isAbsolute(p) ? existsSync(p) : true));
const proc = spawn(python, ["app.py"], { cwd: dir, stdio: "inherit", windowsHide: true });

proc.on("exit", (code) => process.exit(code ?? 1));
