#!/usr/bin/env python3
"""
Unified entrypoint for the bank-statement tool Docker container.

Modes:
  python serve.py parse <password> [--out /data/data.json]
      → decrypt + parse all PDFs in /data/statements/, write JSON to /data/

  python serve.py serve [--port 8080]
      → serve the web UI on 0.0.0.0:<port>
        GET /         → index.html
        GET /alasql.min.js
        GET /data.json → /data/data.json (the parsed transactions)

  python serve.py run <password> [--port 8080]
      → parse first, then immediately start serving (most convenient)
"""

import sys
import os
import json
import argparse
import subprocess
import threading
import time
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Paths ──
APP_DIR  = Path(__file__).parent          # /app
WWW_DIR  = APP_DIR / "www"                # /app/www  (index.html, alasql.min.js)
DATA_DIR = Path("/data")                  # mounted volume
STMTS    = DATA_DIR / "statements"        # mounted PDF folder
OUT_JSON = DATA_DIR / "data.json"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript",
    ".json": "application/json",
    ".css":  "text/css",
    ".ico":  "image/x-icon",
}


# ── HTTP handler ──
class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Quieter logs — only show path + status
        print(f"  {self.command} {self.path} → {args[1]}")

    def do_GET(self):
        path = self.path.split("?")[0]

        # /data.json → serve the parsed JSON from the volume
        if path == "/data.json":
            self._serve_file(OUT_JSON)
            return

        # / → index.html
        if path in ("/", "/index.html"):
            self._serve_file(WWW_DIR / "index.html")
            return

        # Static assets under /app/www
        target = WWW_DIR / path.lstrip("/")
        if target.exists() and target.is_file():
            self._serve_file(target)
            return

        self._404()

    def _serve_file(self, path: Path):
        path = Path(path)
        if not path.exists():
            self._404(f"File not found: {path.name}")
            return
        ext  = path.suffix.lower()
        mime = MIME.get(ext, "application/octet-stream")
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _404(self, msg="Not found"):
        body = msg.encode()
        self.send_response(404)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def do_parse(password, out_path=None):
    out_path = Path(out_path) if out_path else OUT_JSON

    if not STMTS.exists() or not any(STMTS.glob("*.pdf")) and not any(STMTS.glob("*.PDF")):
        print(f"\n⚠  No PDF files found in {STMTS}")
        print("   Mount your statements folder with:")
        print("   -v /your/local/statements:/data/statements\n")
        sys.exit(1)

    # Delegate to parse.py which lives alongside this file
    parse_script = APP_DIR / "parse.py"
    cmd = [sys.executable, str(parse_script), str(STMTS), password,
           "--out", str(out_path), "--pretty"]
    result = subprocess.run(cmd)
    sys.exit(result.returncode)


def do_serve(port=8080):
    print(f"\n{'─'*50}")
    print(f"  Bank Statement Query Tool")
    print(f"  http://localhost:{port}")
    if OUT_JSON.exists():
        size = OUT_JSON.stat().st_size
        try:
            rows = len(json.loads(OUT_JSON.read_text()))
            print(f"  data.json: {rows} transactions ({size:,} bytes)")
        except Exception:
            print(f"  data.json: {size:,} bytes (load manually in UI)")
    else:
        print(f"  data.json: not found — run parse first, or load manually in UI")
    print(f"{'─'*50}\n")

    server = HTTPServer(("0.0.0.0", port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


def do_run(password, port=8080):
    """Parse then serve."""
    out_path = OUT_JSON

    parse_script = APP_DIR / "parse.py"
    cmd = [sys.executable, str(parse_script), str(STMTS), password,
           "--out", str(out_path), "--pretty"]

    print("\n── Step 1/2: Parsing PDFs ──")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)

    print("\n── Step 2/2: Starting web server ──")
    do_serve(port)


# ── CLI ──
def main():
    parser = argparse.ArgumentParser(prog="serve.py")
    sub = parser.add_subparsers(dest="mode")

    # parse
    p_parse = sub.add_parser("parse", help="Parse PDFs, write data.json")
    p_parse.add_argument("password", help="Shared PDF password")
    p_parse.add_argument("--out", help="Output path (default: /data/data.json)")

    # serve
    p_serve = sub.add_parser("serve", help="Serve the web UI")
    p_serve.add_argument("--port", type=int, default=8080)

    # run (parse + serve)
    p_run = sub.add_parser("run", help="Parse PDFs then serve (recommended)")
    p_run.add_argument("password", help="Shared PDF password")
    p_run.add_argument("--port", type=int, default=8080)

    args = parser.parse_args()

    if args.mode == "parse":
        do_parse(args.password, args.out)
    elif args.mode == "serve":
        do_serve(args.port)
    elif args.mode == "run":
        do_run(args.password, args.port)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
