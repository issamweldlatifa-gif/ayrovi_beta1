#!/usr/bin/env python3
"""
Sert le dépôt en local et ouvre directement le laboratoire AYWEBs.

    python3 explorations/aywebs-mockup/serve.py [port]

Pourquoi un script et pas `python3 -m http.server` : la maquette référence les
vraies photos et les vraies polices de l'app (`../apps/mobile/assets/...`), donc
la racine à servir doit être la racine du dépôt — et `http.server` afficherait un
index de répertoire au lieu de la maquette. Ici `/` redirige vers le fichier.

Aucun secret, aucune dépendance : bibliothèque standard uniquement.
"""
import functools
import http.server
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LAB = "/explorations/AYWEBS_HOME_LAB.html"
PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", 8080))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):  # noqa: N802 (nom imposé par la bibliothèque)
        if self.path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", LAB)
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        # Une maquette se modifie souvent : pas de cache pendant la revue.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), functools.partial(Handler))
    print(f"AYWEBs mockup → http://localhost:{PORT}{LAB}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
