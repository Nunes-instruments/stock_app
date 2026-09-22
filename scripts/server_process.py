from __future__ import annotations

import os
import sys
import traceback
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

_data_override = os.environ.get("NUNES_STOCK_DATA_DIR", "").strip()
if _data_override:
    LOG_DIR = Path(_data_override)
elif os.name == "nt":
    LOG_DIR = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "NunesStock" / "data"
else:
    LOG_DIR = APP_DIR / "data"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "server.log"


def _log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


try:
    from waitress import serve
    from flask_app import app
    from runtime_paths import DATA_DIR
except Exception:
    _log("SERVER IMPORT FAILED\n" + traceback.format_exc())
    raise

HOST = os.environ.get("NUNES_STOCK_HOST", "0.0.0.0")
PORT = int(os.environ.get("NUNES_STOCK_PORT", "5055"))
THREADS = int(os.environ.get("NUNES_STOCK_THREADS", "8"))
PID_FILE = DATA_DIR / "server.pid"


def main() -> None:
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    _log(f"Starting NUNES Stock Server on {HOST}:{PORT} with {THREADS} threads")
    try:
        serve(app, host=HOST, port=PORT, threads=THREADS)
    except Exception:
        _log("SERVER RUNTIME FAILED\n" + traceback.format_exc())
        raise
    finally:
        try:
            if PID_FILE.exists() and PID_FILE.read_text(encoding="utf-8").strip() == str(os.getpid()):
                PID_FILE.unlink()
        except OSError:
            pass


if __name__ == "__main__":
    main()
