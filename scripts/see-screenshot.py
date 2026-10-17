#!/usr/bin/env python3
"""
ZAYROVI — « voir » une capture d'écran sans vision (outil interne).

L'agent qui lit ce dépôt ne reçoit pas les images : ce script transforme une
capture en TEXTE exploitable — c'est tout l'objet du fichier.

Deux sorties complémentaires :
  1. TEXTE  : OCR (RapidOCR / PP-OCR, modèles fournis par le paquet pip — aucun
              téléchargement réseau) avec la position de chaque ligne, ce qui
              donne les libellés, prix, titres de sections et leur ORDRE.
  2. FORME  : la même image rendue en caractères (carte de luminosité) et en
              carte de couleurs (B=noir, W=blanc, g/G=gris, V=violet, R=rouge,
              E=vert, B=bleu, C=autre couleur) → la mise en page, les cartes,
              les bandes et les fonds gris devinent lisibles.

Usage :
  python3 scripts/see-screenshot.py capture.png [capture2.jpg ...]
  python3 scripts/see-screenshot.py capture.png --cols 150 --no-ocr
  python3 scripts/see-screenshot.py capture.png --color      # carte de couleurs

Dépendances (installées une fois, hors dépôt) :
  pip3 install --break-system-packages rapidocr-onnxruntime opencv-python-headless pillow
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

RAMP = " .:-=+*#%@"  # du plus clair au plus sombre


def luminance_map(image, cols: int) -> str:
    """Rendu ASCII de la luminosité : la STRUCTURE de l'écran (cartes, bandes)."""
    from PIL import Image

    gray = image.convert("L")
    w, h = gray.size
    cell = max(1, w / cols)
    rows = max(1, int(h / (cell * 2)))  # une cellule de texte ≈ 2× plus haute que large
    small = gray.resize((cols, rows))
    pixels = small.load()
    lines = []
    for y in range(rows):
        line = []
        for x in range(cols):
            value = pixels[x, y] / 255.0
            # Inversé : le papier (clair) reste vide, l'encre et les fonds sombres se voient.
            index = int((1.0 - value) * (len(RAMP) - 1))
            line.append(RAMP[index])
        lines.append("".join(line))
    return "\n".join(lines)


def color_map(image, cols: int) -> str:
    """Carte des COULEURS : repérer d'un coup d'œil les fonds gris et les à-plats."""
    from PIL import Image

    small = image.convert("RGB")
    w, h = small.size
    cell = max(1, w / cols)
    rows = max(1, int(h / (cell * 2)))
    small = small.resize((cols, rows))
    pixels = small.load()
    lines = []
    for y in range(rows):
        line = []
        for x in range(cols):
            r, g, b = [channel / 255.0 for channel in pixels[x, y]]
            maximum, minimum = max(r, g, b), min(r, g, b)
            saturation = 0 if maximum == 0 else (maximum - minimum) / maximum
            value = maximum
            if saturation > 0.28 and value > 0.18:
                # Teinte dominante : violet / rouge-orangé / vert / bleu / autre.
                if r >= g and b >= g and b > r * 0.55:
                    line.append("V")
                elif r > g and r > b:
                    line.append("R" if value > 0.5 else "r")
                elif g > r and g > b:
                    line.append("E")
                elif b > r and b > g:
                    line.append("L")
                else:
                    line.append("C")
            elif value > 0.88:
                line.append("W")   # blanc
            elif value > 0.62:
                line.append("g")   # gris clair
            elif value > 0.35:
                line.append("G")   # gris
            else:
                line.append("B")   # noir / très sombre
        lines.append("".join(line))
    return "\n".join(lines)


def ocr_lines(path: Path) -> list[tuple[int, int, str]]:
    """Texte lu dans l'image, avec sa position (y%, x%) — l'ordre des champs."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as error:  # OCR indisponible : on rend quand même la forme.
        print(f"  [OCR indisponible: {error}]")
        return []
    engine = RapidOCR()
    result, _ = engine(str(path))
    if not result:
        return []
    from PIL import Image

    width, height = Image.open(path).size
    rows: list[tuple[int, int, str]] = []
    for box, text, score in result:
        if not text or not text.strip() or (score is not None and score < 0.5):
            continue
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        rows.append((
            int(min(ys) / height * 100),
            int(min(xs) / width * 100),
            text.strip(),
        ))
    rows.sort(key=lambda row: (row[0], row[1]))
    return rows


def crop(image, band: str | None):
    """Découpe verticale en pourcentage (ex. `--crop 0,12` = les 12 % du haut)."""
    if not band:
        return image
    try:
        top, bottom = [float(part) for part in band.split(",")]
    except ValueError:
        return image
    width, height = image.size
    y0 = max(0, int(height * top / 100))
    y1 = min(height, int(height * bottom / 100))
    return image.crop((0, y0, width, y1))


def main() -> int:
    parser = argparse.ArgumentParser(description="Rend une capture d'écran lisible en texte.")
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--cols", type=int, default=110, help="largeur du rendu en caractères")
    parser.add_argument("--crop", default=None, help="bande verticale en pourcentage : '0,12'")
    parser.add_argument("--no-ocr", action="store_true", help="ignorer l'OCR (plus rapide)")
    parser.add_argument("--no-map", action="store_true", help="ignorer la carte de luminosité")
    parser.add_argument("--color", action="store_true", help="ajouter la carte de couleurs")
    args = parser.parse_args()

    from PIL import Image

    for path in args.images:
        if not path.exists():
            print(f"=== {path} : INTROUVABLE ===")
            continue
        image = Image.open(path)
        image = crop(image, args.crop)
        print(f"\n===== {path.name} ({image.size[0]}×{image.size[1]}) =====")
        if not args.no_map:
            print("--- FORME (luminosité : clair=vide, sombre=plein) ---")
            print(luminance_map(image, args.cols))
        if args.color:
            print("--- COULEURS (W blanc, g/G gris, B noir, V violet, R rouge, E vert, L bleu) ---")
            print(color_map(image, args.cols))
        if not args.no_ocr:
            print("--- TEXTE (y% haut → bas, x% gauche → droite) ---")
            rows = ocr_lines(path)
            if not rows:
                print("  (aucun texte lu)")
            for top, left, text in rows:
                print(f"  y{top:>3}%  x{left:>3}%  {text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
