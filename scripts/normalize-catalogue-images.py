#!/usr/bin/env python3
"""
Photos du catalogue officiel → format unique de l'application (13/11/2026).

Pourquoi : les photos des marques arrivent avec des fonds différents (blanc pur,
gris clair, gris moyen, photos d'ambiance) et des formats différents (carré,
paysage…). Dans un cadre 2:3, cela donne des bandes visibles autour de la photo
ou des produits rognés. Les références (Zalando, Veepee) montrent au contraire
TOUTES les photos produit sur un même fond gris très clair, produit entier.

Règle :
  • « packshot » (bords uniformes) : le fond est ramené au blanc (gain par canal
    calculé sur la couleur des bords), puis la photo est posée en mode
    « produit » (multiplication) sur une toile 2:3 de la couleur commune
    CANVAS : le blanc devient exactement CANVAS, le produit reste net. Produit
    centré, entier, avec une marge régulière.
  • « ambiance » (bords variés : mannequin en situation, décor) : recadrage 2:3
    centré, la photo remplit le cadre.

Usage : python3 scripts/normalize-catalogue-images.py <dossier_source> <dossier_cible>
"""
import statistics
import sys
from pathlib import Path

from PIL import Image, ImageChops

CANVAS = (0xF3, 0xF3, 0xF3)      # = PUBLICATION_PALETTE.neutral (fond des cadres)
OUT_W, OUT_H = 1000, 1500         # 2:3, comme la carte produit et les cadres Publication
MARGIN = 0.10                     # marge autour d'un packshot (fraction de la largeur)
UNIFORM_TOLERANCE = 18            # écart de luminance toléré sur un bord « uniforme »
UNIFORM_SHARE = 0.92              # part des pixels du bord qui doivent être uniformes
# Fonds gris non uniformes (studio en dégradé) : un rectangle plus clair apparaîtrait.
FORCE_PHOTO = {'levis-501-original-1', 'zara-pleated-mini-dress-1'}
FORCE_PACKSHOT = set()


def border_pixels(im):
    w, h = im.size
    px = im.load()
    step = max(1, min(w, h) // 200)
    pts = [px[x, 0] for x in range(0, w, step)] + [px[x, h - 1] for x in range(0, w, step)]
    pts += [px[0, y] for y in range(0, h, step)] + [px[w - 1, y] for y in range(0, h, step)]
    return pts


def classify(im, stem):
    if stem in FORCE_PHOTO:
        return 'photo', None
    pts = border_pixels(im)
    edge = tuple(int(statistics.median(p[i] for p in pts)) for i in range(3))
    lum = sum(edge) / 3
    close = sum(1 for p in pts if abs(sum(p) / 3 - lum) <= UNIFORM_TOLERANCE)
    if stem in FORCE_PACKSHOT or (close / len(pts) >= UNIFORM_SHARE and lum >= 180):
        return 'packshot', edge
    return 'photo', None


def packshot(im, edge):
    # 1. fond → blanc : gain par canal (le produit s'éclaircit d'autant, c'est minime
    #    pour les fonds blancs/gris clairs ; borné pour les gris moyens).
    gains = [min(1.35, 255.0 / max(1, c)) for c in edge]
    r, g, b = im.split()
    r = r.point(lambda v, k=gains[0]: min(255, int(v * k + 0.5)))
    g = g.point(lambda v, k=gains[1]: min(255, int(v * k + 0.5)))
    b = b.point(lambda v, k=gains[2]: min(255, int(v * k + 0.5)))
    im = Image.merge('RGB', (r, g, b))
    # 2. recadrage serré sur le produit (tout ce qui n'est pas quasi blanc)
    diff = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L')
    box = diff.point(lambda v: 255 if v > 14 else 0).getbbox() or (0, 0, *im.size)
    im = im.crop(box)
    # 3. produit entier dans la zone utile, centré
    avail_w = OUT_W * (1 - 2 * MARGIN)
    avail_h = OUT_H * (1 - 2 * MARGIN)
    scale = min(avail_w / im.width, avail_h / im.height)
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    white = Image.new('RGB', (OUT_W, OUT_H), (255, 255, 255))
    white.paste(im, ((OUT_W - im.width) // 2, (OUT_H - im.height) // 2))
    # 4. multiplication sur la toile commune : le blanc devient CANVAS
    return ImageChops.multiply(white, Image.new('RGB', (OUT_W, OUT_H), CANVAS))


def photo(im):
    target = OUT_W / OUT_H
    if im.width / im.height > target:
        w = int(im.height * target)
        left = (im.width - w) // 2
        im = im.crop((left, 0, left + w, im.height))
    else:
        h = int(im.width / target)
        top = max(0, (im.height - h) // 3)   # léger biais vers le haut (visages, encolures)
        im = im.crop((0, top, im.width, top + h))
    return im.resize((OUT_W, OUT_H), Image.LANCZOS)


def main(src, dst):
    dst.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob('*.jpg')):
        im = Image.open(path).convert('RGB')
        kind, edge = classify(im, path.stem)
        out = packshot(im, edge) if kind == 'packshot' else photo(im)
        out.save(dst / path.name, quality=84, optimize=True, progressive=True)
        print(f'{path.name:40s} {kind:8s} {edge or ""}')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
