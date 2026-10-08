"""Create and verify a portable ZIP without installed dependencies or caches."""

import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    "node_modules", ".venv", "venv", "__pycache__", "dist", "coverage",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".cache",
}
SKIP_PATHS = {".ml-repo", "transfer", "server/temp", "ml-service/temp",
              "ml-service/cevit/efficient_net/logs"}


def project_files(source_only):
    for directory, dirs, files in os.walk(ROOT, followlinks=False):
        parent = Path(directory)
        dirs[:] = sorted(
            name for name in dirs
            if name not in SKIP_DIRS
            and (parent / name).relative_to(ROOT).as_posix() not in SKIP_PATHS
            and not (parent / name).is_symlink()
            and not (source_only and name == ".git")
            and not (source_only and (parent / name).relative_to(ROOT).as_posix()
                     in {"ml-service/models", "server/data"})
        )
        for name in sorted(files):
            path = parent / name
            if path.is_symlink() or path.suffix.lower() in {".log", ".pyc", ".pyo", ".tsbuildinfo"}:
                continue
            if name in {"Thumbs.db", ".DS_Store"}:
                continue
            if source_only and (name == ".env" or name.startswith(".env.")) and name != ".env.example":
                continue
            # Include a consistent SQLite backup instead of its live journal files.
            if path.relative_to(ROOT).as_posix() in {
                "server/data/sach.db", "server/data/sach.db-wal", "server/data/sach.db-shm",
            }:
                continue
            yield path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-only", action="store_true",
                        help="Also omit models, personal settings, saved accounts/reports, and Git history.")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    suffix = "source" if args.source_only else "transfer"
    output = (args.output or ROOT / "transfer" / f"Sach-AI-{suffix}.zip").resolve()
    if output.exists():
        parser.error(f"Output already exists; choose another filename: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    files = [path for path in project_files(args.source_only) if path.resolve() != output]
    count = len(files)
    source_bytes = sum(path.stat().st_size for path in files)
    instructions = """SACH-AI TRANSFER COPY

Extract this ZIP onto a computer, then open Sach-AI/README.md for setup.
Install Node.js 22.13+ and Python 3.11-3.13, then run from the project folder:

    npm.cmd ci
    npm.cmd --prefix server ci
    python -m venv ml-service/.venv
    ml-service\\.venv\\Scripts\\python.exe -m pip install -r ml-service/requirements.txt
    npm.cmd run dev:all

Installed libraries, builds, caches, logs, temporary uploads, and the local
upstream reference checkout were omitted to make copying faster.
A phone can store this ZIP; running the application requires a computer.
"""
    if args.source_only:
        instructions += """
This SOURCE copy also omits models, local settings, saved accounts/reports,
and Git history. Follow README.md to create server/.env and obtain models.
"""
    else:
        instructions += """
This PERSONAL TRANSFER copy includes all local model files, local settings,
Git history, and a consistent snapshot of the accounts/report database.
Treat it as a personal backup because it contains your local settings/data.
"""
    print(f"Packing {count} files ({source_bytes / 1024**2:.1f} MiB before compression)", flush=True)
    with tempfile.TemporaryDirectory(prefix="sach-pack-", dir=output.parent) as scratch:
        database = ROOT / "server/data/sach.db"
        snapshot = Path(scratch) / "sach.db"
        if database.exists() and not args.source_only:
            with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as source:
                with closing(sqlite3.connect(snapshot)) as target:
                    source.backup(target)
                    if target.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                        raise RuntimeError("Database snapshot did not pass its integrity check")
        try:
            with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED,
                                 compresslevel=1, allowZip64=True) as archive:
                for path in files:
                    archive.write(path, "Sach-AI/" + path.relative_to(ROOT).as_posix())
                if snapshot.exists():
                    archive.write(snapshot, "Sach-AI/server/data/sach.db")
                    count += 1
                archive.writestr("Sach-AI/TRANSFER-INSTRUCTIONS.txt", instructions)
                count += 1
            print("Checking the ZIP contents...", flush=True)
            with zipfile.ZipFile(output) as archive:
                bad_file = archive.testzip()
                if bad_file:
                    raise RuntimeError(f"ZIP integrity check failed: {bad_file}")
            print(f"Verified {count} files; ZIP size: {output.stat().st_size / 1024**2:.1f} MiB", flush=True)
            print(output, flush=True)
        except BaseException:
            # Remove only the incomplete output created by this run.
            output.unlink(missing_ok=True)
            raise


if __name__ == "__main__":
    main()
