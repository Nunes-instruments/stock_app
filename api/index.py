import os
import sys
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Set serverless environment flags
os.environ.setdefault("VERCEL", "1")
os.environ.setdefault("NUNES_STOCK_DATA_DIR", "/tmp/nunes_stock_data")

from flask_app import app


class VercelMiddleware:
    """WSGI middleware to properly route rewritten Vercel requests to Flask."""
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        matched = environ.get("HTTP_X_MATCHED_PATH", "")
        if matched and not matched.startswith("/api/index"):
            environ["PATH_INFO"] = matched
        else:
            path = environ.get("PATH_INFO", "")
            if path in ("/api/index", "/api/index.py", "/api"):
                environ["PATH_INFO"] = "/"
            elif path.startswith("/api/index/"):
                environ["PATH_INFO"] = path[len("/api/index"):]
            elif path.startswith("/api/index.py/"):
                environ["PATH_INFO"] = path[len("/api/index.py"):]
        return self.wsgi_app(environ, start_response)


app.wsgi_app = VercelMiddleware(app.wsgi_app)
