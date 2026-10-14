import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Set serverless environment flags
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("NUNES_STOCK_DATA_DIR", "/tmp/nunes_stock_data")

from flask_app import app


class VercelMiddleware:
    """WSGI middleware to accurately route requests rewritten by Vercel to Flask."""
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        query_string = environ.get("QUERY_STRING", "")
        if "__path" in query_string:
            parsed = parse_qs(query_string, keep_blank_values=True)
            if "__path" in parsed:
                raw_path = parsed.pop("__path")[0]
                decoded_path = unquote(raw_path)
                if not decoded_path.startswith("/"):
                    decoded_path = "/" + decoded_path
                environ["PATH_INFO"] = decoded_path
                environ["QUERY_STRING"] = urlencode(parsed, doseq=True)
        elif environ.get("PATH_INFO") in ("/api/index", "/api/index.py", "/api"):
            environ["PATH_INFO"] = "/"

        return self.wsgi_app(environ, start_response)


app.wsgi_app = VercelMiddleware(app.wsgi_app)
