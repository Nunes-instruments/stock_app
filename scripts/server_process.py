from __future__ import annotations

import os
import signal
from pathlib import Path

from waitress import serve

from flask_app import app
from runtime_paths import DATA_DIR

HOST = os.environ.get("NUNES_STOCK_HOST", "0.0.0.0")
PORT = int(os.environ.get("NUNES_STOCK_PORT", "5000"))
THREADS = int(os.environ.get("NUNES_STOCK_THREADS", "8"))
PID_FILE = DATA_DIR / "server.pid"


def main() -> None:
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    try:
        serve(app, host=HOST, port=PORT, threads=THREADS)
    finally:
        try:
            if PID_FILE.exists() and PID_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
                PID_FILE.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    main()
