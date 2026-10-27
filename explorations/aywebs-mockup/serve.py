#!/usr/bin/env python3
"""
Sert le dépôt en local et ouvre directement le laboratoire AYWEBs.

    python3 explorations/aywebs-mockup/serve.py [port]

Adresses :
    /             → laboratoire A/B/C/D (fichier unique, autonome)
    /officiel     → laboratoire « officiel » : 3 variantes + écran Boutiques
    /source       → source du labo A/B/C/D (chemins relatifs, pour itérer)
    /source-off   → source du labo officiel

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
OFFICIEL = "/explorations/AYWEBS_OFFICIEL_LAB.html"
SOURCE = "/explorations/aywebs-mockup/lab.source.html"
SOURCE_OFF = "/explorations/aywebs-mockup/officiel.source.html"
PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PORT", 8080))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):  # noqa: N802 (nom imposé par la bibliothèque)
        if self.path in ("/officiel", "/officiel/"):
            self.send_response(302)
            self.send_header("Location", OFFICIEL)
            self.end_headers()
            return
        if self.path in ("/source-off", "/source-off/"):
            self.send_response(302)
            self.send_header("Location", SOURCE_OFF)
            self.end_headers()
            return
        if self.path in ("/source", "/source/"):
            self.send_response(302)
            self.send_header("Location", SOURCE)
            self.end_headers()
            return
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
    print(f"AYWEBs mockups → http://localhost:{PORT}/officiel", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
