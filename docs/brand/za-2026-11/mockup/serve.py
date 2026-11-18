"""Serve the choices mockup (repo root as web root, so it can use the real fonts and nav glyphs).
Run from anywhere: python3 docs/brand/za-2026-11/mockup/serve.py  → http://0.0.0.0:8090/"""
import functools, http.server, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
PAGE = '/docs/brand/za-2026-11/mockup/'


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.send_response(302); self.send_header('Location', PAGE); self.end_headers(); return
        super().do_GET()


http.server.ThreadingHTTPServer(('0.0.0.0', 8090), functools.partial(Handler, directory=str(ROOT))).serve_forever()
