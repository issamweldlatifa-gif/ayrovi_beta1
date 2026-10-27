#!/usr/bin/env python3
"""
AYWEBs — maquette rendue en code, avec les fondations OFFICIELLES.

    python3 explorations/aywebs-mockup/render_officiel.py

Pourquoi un rendu en code et plus une image générée : une image générée
invente ses tailles, ses interlignes et ses icônes. Ici, tout vient du dépôt :

  polices     apps/mobile/assets/fonts/ZalandoSans-{Regular,SemiBold,Bold}.ttf
  couleurs    brand.json  #571EF6 · #0A0A0A · #333 · #666 · #E5E5E5 · #FFF · #F2F2F2
  CTA achat   tokens.mobile.ts  COMMERCE.action  #FFD60A
  types       tokens.generated  display 40 · title 28 · lead 18 · body 16 · label 14 · caption 12
  espacement  identity + SPACE_EXTENDED  4 · 8 · 12 · 16 · 24 · 32
  rayons      RADIUS  4 · 8 · 12 · 16 · 24 · 999
  icônes      trait 1,9 px, jeu de tracés de l'app (panier, cœur, loupe, chevron…)
  logo        assets/aywebs/aywebs-wordmark.png, trimé, reteinté au violet officiel

Trois écrans, comme demandé : catégories → sponsorisé → boutiques.
"""
from __future__ import annotations

import math
import os
import sys
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(ROOT, "apps", "mobile", "assets")
FONTS = os.path.join(ASSETS, "fonts")
MOCK = os.path.join(ROOT, "explorations", "aywebs-mockup")
OUT = os.path.join(MOCK, "img")

# ─── Jetons officiels ────────────────────────────────────────────────────────
VIOLET = (0x57, 0x1E, 0xF6)
VIOLET_PRESS = (0x49, 0x1A, 0xCC)
VIOLET_7 = (0xF1, 0xEC, 0xFE)      # recommendation : violet 7 % sur blanc
VIOLET_16 = (0xE4, 0xDB, 0xFD)     # info.soft : violet 16 %
INK = (0x0A, 0x0A, 0x0A)
INK_2 = (0x33, 0x33, 0x33)
MUTED = (0x66, 0x66, 0x66)
LINE = (0xE5, 0xE5, 0xE5)
SURFACE = (0xFF, 0xFF, 0xFF)
SHIMMER = (0xF2, 0xF2, 0xF2)
COMMERCE = (0xFF, 0xD6, 0x0A)      # CTA d'achat AYWEBs

S = {1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64}
R = {"xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 24, "full": 999}

# Écran 390 de large (référence des tests UI du dépôt) ; hauteur LIBRE, pour
# laisser les trois sections respirer sur une page longue plutôt que de les
# comprimer dans un seul écran.
W = 390 * 2                      # rendu ×2 pour la netteté
SCALE = 2

FONT_FILES = {
    ("regular", "latin"): "ZalandoSans-Regular.ttf",
    ("semibold", "latin"): "ZalandoSans-SemiBold.ttf",
    ("bold", "latin"): "ZalandoSans-Bold.ttf",
}
_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Police officielle, taille en points réels (×2 pour le rendu)."""
    key = (weight, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(
            os.path.join(FONTS, FONT_FILES[(weight, "latin")]), size * SCALE
        )
    return _font_cache[key]


def px(value: float) -> int:
    return int(round(value * SCALE))


# ─── Aides de dessin ─────────────────────────────────────────────────────────
def text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], value: str,
         size: int, weight: str = "regular", color: tuple = INK,
         anchor: str = "la") -> None:
    draw.text((px(xy[0]), px(xy[1])), value, font=font(weight, size), fill=color, anchor=anchor)


def text_width(value: str, size: int, weight: str) -> float:
    return font(weight, size).getlength(value) / SCALE


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(
        [px(box[0]), px(box[1]), px(box[2]), px(box[3])],
        radius=px(radius), fill=fill, outline=outline, width=px(width),
    )


def soft_shadow(canvas: Image.Image, box, radius, spread=3.0, alpha=18) -> None:
    """Ombre très légère (elevation bas de l'identité : 0 1px 2px)."""
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(
        [px(box[0] - 1), px(box[1]), px(box[2] + 1), px(box[3] + spread)],
        radius=px(radius), fill=(10, 10, 10, alpha),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(px(spread)))
    canvas.alpha_composite(layer)


def paste_cover(canvas: Image.Image, path: str, box, radius: int, border: int = 0) -> None:
    """Colle une image en « cover » dans un cadre arrondi."""
    x0, y0, x1, y1 = [px(v) for v in box]
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    image = Image.open(path).convert("RGB")
    ratio = max(w / image.width, h / image.height)
    image = image.resize((max(1, int(image.width * ratio)), max(1, int(image.height * ratio))), Image.LANCZOS)
    left = (image.width - w) // 2
    top = (image.height - h) // 2
    image = image.crop((left, top, left + w, top + h))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=px(radius), fill=255)
    canvas.paste(image, (x0, y0), mask)
    if border:
        d = ImageDraw.Draw(canvas)
        d.rounded_rectangle([x0, y0, x1, y1], radius=px(radius), outline=LINE, width=px(border))


def paste_contain(canvas: Image.Image, path: str, box, pad: float = 0) -> None:
    x0, y0, x1, y1 = [px(v) for v in box]
    w, h = max(1, x1 - x0 - 2 * px(pad)), max(1, y1 - y0 - 2 * px(pad))
    image = Image.open(path).convert("RGBA")
    ratio = min(w / image.width, h / image.height)
    image = image.resize((max(1, int(image.width * ratio)), max(1, int(image.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(image, (x0 + px(pad) + (w - image.width) // 2, y0 + px(pad) + (h - image.height) // 2))


# ─── Icônes (trait 1,9 · même vocabulaire que l'app) ─────────────────────────
def stroke(draw, points: Sequence[tuple[float, float]], color=INK, width=1.9, close=False):
    pts = [(px(x), px(y)) for x, y in points]
    if close:
        pts.append(pts[0])
    draw.line(pts, fill=color, width=px(width), joint="curve")
    radius = px(width) / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)


def icon_cart(draw, cx, cy, color=INK, size=24):
    u = size / 24
    stroke(draw, [(cx - 10 * u, cy - 7 * u), (cx - 7.7 * u, cy - 7 * u), (cx - 5.4 * u, cy + 4 * u),
                  (cx + 4.8 * u, cy + 4 * u), (cx + 7.1 * u, cy - 4 * u), (cx - 7 * u, cy - 4 * u)],
           color, 1.9 * u)
    for dx in (-5.6, 1.9):
        draw.ellipse([px(cx + dx * u - 1.3 * u), px(cy + 8 * u - 1.3 * u),
                      px(cx + dx * u + 1.3 * u), px(cy + 8 * u + 1.3 * u)], outline=color, width=px(1.9 * u))


def icon_heart(draw, cx, cy, color=INK, size=24, filled=False):
    u = size / 24
    points = []
    for i in range(121):
        t = 2 * math.pi * i / 120
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        points.append((cx + x * u * 0.55, cy - y * u * 0.55 + 1 * u))
    pts = [(px(x), px(y)) for x, y in points]
    if filled:
        draw.polygon(pts, fill=color)
    else:
        draw.line(pts + [pts[0]], fill=color, width=px(1.9 * u), joint="curve")


def icon_search(draw, cx, cy, color=INK, size=24):
    u = size / 24
    r = 6.6 * u
    draw.ellipse([px(cx - r), px(cy - r - 1.2 * u), px(cx + r), px(cy + r - 1.2 * u)], outline=color, width=px(1.9 * u))
    stroke(draw, [(cx + 4.9 * u, cy + 4.9 * u), (cx + 9 * u, cy + 9 * u)], color, 1.9 * u)


def icon_chevron(draw, cx, cy, color=INK, size=24, direction="right"):
    u = size / 24
    sign = 1 if direction == "right" else -1
    stroke(draw, [(cx - 3 * u * sign, cy - 7 * u), (cx + 4 * u * sign, cy), (cx - 3 * u * sign, cy + 7 * u)],
           color, 1.9 * u)


def icon_menu(draw, cx, cy, color=INK, size=24):
    u = size / 24
    for dy in (-5.5, 0, 5.5):
        stroke(draw, [(cx - 8 * u, cy + dy * u), (cx + 8 * u, cy + dy * u)], color, 1.9 * u)


def icon_globe(draw, cx, cy, color=INK, size=24):
    u = size / 24
    r = 8.4 * u
    draw.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], outline=color, width=px(1.9 * u))
    draw.ellipse([px(cx - r * 0.42), px(cy - r), px(cx + r * 0.42), px(cy + r)], outline=color, width=px(1.7 * u))
    stroke(draw, [(cx - r, cy), (cx + r, cy)], color, 1.7 * u)


def icon_user(draw, cx, cy, color=INK, size=24):
    u = size / 24
    r = 3.6 * u
    draw.ellipse([px(cx - r), px(cy - 3.6 * u + 8.4 * u - 8.4 * u), px(cx + r), px(cy + 2 * r - 3.6 * u)],
                 outline=color, width=px(1.9 * u))
    draw.arc([px(cx - 6.6 * u), px(cy + 1.4 * u), px(cx + 6.6 * u), px(cy + 14.6 * u)],
             200, 340, fill=color, width=px(1.9 * u))


def icon_grid(draw, cx, cy, color=INK, size=24):
    u = size / 24
    for dx in (-4.75, 4.75):
        for dy in (-4.75, 4.75):
            rounded(draw, (cx + dx * u - 3.25 * u, cy + dy * u - 3.25 * u,
                           cx + dx * u + 3.25 * u, cy + dy * u + 3.25 * u), 1.6 * u, outline=color, width=1.9 * u)


def icon_clock(draw, cx, cy, color=INK, size=24):
    u = size / 24
    r = 8.4 * u
    draw.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], outline=color, width=px(1.9 * u))
    stroke(draw, [(cx, cy - 4.6 * u), (cx, cy), (cx + 3 * u, cy + 2 * u)], color, 1.9 * u)


def badge(draw, cx, cy, value: str, color=VIOLET):
    r = 9.5
    draw.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=color, outline=SURFACE, width=px(1.5))
    text(draw, (cx, cy + 0.4), value, 10, "bold", SURFACE, anchor="mm")


# ─── Photos de catégories (assets officiels de l'app) ────────────────────────
CATEGORY_PHOTO = {
    "electronics": "category-electronics.jpg",
    "fashion": "category-fashion.jpg",
    "home": "category-home.jpg",
    "shoes": "category-shoes.jpg",
    "beauty": "category-beauty.jpg",
    "kitchen": "category-audio.jpg",   # aucune photo « cuisine » fournie : visuel audio
}


def status_bar(d: ImageDraw.ImageDraw) -> None:
    """Barre d'état : heure à gauche, signal + wifi + batterie à droite."""
    text(d, (24, 12), "10:05", 12, "bold", INK)
    base_y = 24
    right = W / SCALE - 18
    for index, height in enumerate((3, 5, 7, 9)):
        x = right - 46 + index * 4
        rounded(d, (x, base_y - height, x + 2.6, base_y), 1, fill=INK)
    # wifi (trois arcs)
    cx, cy = right - 22, base_y - 1
    for radius, thickness in ((9, 1.9), (6, 1.9), (3, 1.9)):
        d.arc([px(cx - radius), px(cy - radius * 0.9), px(cx + radius), px(cy + radius * 1.1)],
              225, 315, fill=INK, width=px(thickness))
    # batterie
    rounded(d, (right - 11, base_y - 9, right, base_y), 2.5, outline=INK, width=1.1)
    rounded(d, (right - 9, base_y - 7, right - 3.4, base_y - 2), 1, fill=INK)


def icon_info(d: ImageDraw.ImageDraw, cx: float, cy: float, color=MUTED, size: int = 14) -> None:
    """Petit ⓘ dessiné : la police officielle n'a pas ce glyphe."""
    r = size / 2
    d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], outline=color, width=px(1.3))
    d.line([px(cx), px(cy - 1.4), px(cx), px(cy - 1.2)], fill=color, width=px(1.5))
    d.line([px(cx), px(cy + 0.6), px(cx), px(cy + 3.2)], fill=color, width=px(1.5))


# ─── Écran : accueil (3 sections) ───────────────────────────────────────────

# ─── Cartes boutiques : le logo ENTIER, jamais rogné ───────────────────────
# Ce que la référence Zalando (27/10/2026) montre : une grande carte 3:4, le
# visuel dedans, le libellé SOUS la carte. Chez nous le visuel d'une boutique
# est son logo : il est donc posé en `contain`, avec 24 pt de réserve — il
# garde ses proportions et ne touche jamais le bord.

STORE_CATALOG = [
    ("Amazon", "Électronique · High-tech", "amazon.tn"),
    ("Zalando", "Mode · Chaussures", "zalando.tn"),
    ("SHEIN", "Mode femme", "shein.com"),
    ("TEMU", "Maison · Cuisine", "temu.com"),
    ("Stradivarius", "Mode femme", "stradivarius.com"),
    ("Nike", "Sport · Chaussures", "nike.com"),
]


def fit(value: str, size: int, weight: str, max_w: float) -> str:
    """Coupe un texte TROP long avec une ellipse — jamais un libellé de carte."""
    if text_width(value, size, weight) <= max_w:
        return value
    cut = value
    while cut and text_width(cut + "…", size, weight) > max_w:
        cut = cut[:-1]
    return cut.rstrip() + "…"


def draw_store_logo(d, box, label: str) -> None:
    """Wordmark centré, réduit jusqu'à tenir dans la réserve : aucune coupe."""
    x0, y0, x1, y1 = box
    size = 32
    while size > 11 and (text_width(label, size, "bold") > (x1 - x0) or size * 1.3 > (y1 - y0)):
        size -= 1
    text(d, ((x0 + x1) / 2, (y0 + y1) / 2), label, size, "bold", INK, anchor="mm")


def draw_store_card(canvas, d, x, y, w, name, subtitle=None, domain=None,
                    subtitle_size=15, saved=False, show_visit=False) -> float:
    """Carte boutique 3:4 + libellés dessous. Retourne la hauteur occupée."""
    h = w * 4 / 3
    rounded(d, (x, y, x + w, y + h), R["lg"], fill=SHIMMER)
    draw_store_logo(d, (x + 24, y + 24, x + w - 24, y + h - 24), name)
    draw_heart_button(d, x + w - 26, y + 26, active=saved)

    ty = y + h + S[2]
    text(d, (x, ty), fit(name, 14, "bold", w), 14, "bold", INK)
    ty += 18
    if subtitle:
        text(d, (x, ty), fit(subtitle, subtitle_size, "regular", w), subtitle_size, "regular", INK)
        ty += subtitle_size + 7
    if domain:
        text(d, (x, ty), fit(domain, 12, "regular", w), 12, "regular", MUTED)
        ty += 17
    if show_visit:
        text(d, (x, ty), "Visiter ↗", 12, "bold", VIOLET)
        ty += 20
    return ty - y


def render_home() -> Image.Image:
    canvas = Image.new("RGBA", (W, 4200), SURFACE)
    d = ImageDraw.Draw(canvas)
    M = S[4]                     # marge d'écran 16

    # ── Barre d'état
    status_bar(d)

    # ── En-tête 64 : wordmark officiel + panier + cœur
    header_y = 44
    paste_contain(canvas, os.path.join(MOCK, "aywebs-wordmark-violet.png"),
                  (M - 4, header_y - 2, M + 150, header_y + 44))
    icon_heart(d, W / SCALE - M - 86, header_y + 21, INK, 24)
    badge(d, W / SCALE - M - 74, header_y + 9, "1")
    icon_cart(d, W / SCALE - M - 24, header_y + 21, INK, 24)
    badge(d, W / SCALE - M - 12, header_y + 9, "2")

    # ── Recherche 48
    search_y = header_y + 52
    rounded(d, (M, search_y, W / SCALE - M, search_y + 48), R["md"], fill=SURFACE, outline=LINE, width=1)
    icon_menu(d, M + 24, search_y + 24, INK, 20)
    text(d, (M + 48, search_y + 24), "Rechercher", 16, "regular", MUTED, anchor="lm")
    icon_search(d, W / SCALE - M - 24, search_y + 24, INK, 20)
    d.line([px(M), px(search_y + 64), px(W / SCALE - M), px(search_y + 64)], fill=LINE, width=px(1))

    # ── SECTION 1 · Catégories
    y = search_y + 92
    text(d, (M, y), "Explorer par catégorie", 22, "bold", INK, anchor="ls")
    icon_chevron(d, W / SCALE - M - 10, y - 8, INK, 22)
    y += S[3] + 4

    card_w = (W / SCALE - 2 * M - S[3]) / 2
    card_h = card_w
    cats: Iterable[tuple[str, str]] = [
        ("electronics", "High-tech"), ("fashion", "Mode"),
        ("shoes", "Chaussures"), ("home", "Maison"),
        ("beauty", "Beauté"), ("kitchen", "Audio"),
    ]
    for index, (key, label) in enumerate(cats):
        row, col = divmod(index, 2)
        x0 = M + col * (card_w + S[3])
        y0 = y + row * (card_h + S[5] + 26)
        soft_shadow(canvas, (x0, y0, x0 + card_w, y0 + card_h), R["lg"])
        paste_cover(canvas, os.path.join(ASSETS, "aywebs", CATEGORY_PHOTO[key]),
                    (x0, y0, x0 + card_w, y0 + card_h), R["lg"])
        text(d, (x0, y0 + card_h + 10), label, 14, "bold", INK)

    # ── séparateur + SECTION 2 · Sponsorisé
    y_section2 = y + 3 * (card_h + S[5] + 26) + S[4]
    d.line([px(M), px(y_section2), px(W / SCALE - M), px(y_section2)], fill=LINE, width=px(1))
    y = y_section2 + S[4]
    text(d, (M, y), "Sponsorisé", 13, "regular", MUTED)
    icon_info(d, M + text_width("Sponsorisé", 13, "regular") + 14, y + 7, MUTED, 13)
    y += S[4] + 4

    paste_cover(canvas, os.path.join(OUT, "editorial-sponsor.jpg"),
                (M, y, W / SCALE - M, y + 176), R["lg"])
    y += 176 + S[3]

    text(d, (M, y), "Le dressing des fêtes,", 26, "bold", INK)
    y += 34
    text(d, (M, y), "repéré pour vous", 26, "bold", INK)
    y += 40
    text(d, (M, y), "Une sélection mode et maison à retrouver", 15, "regular", INK_2)
    y += 22
    text(d, (M, y), "dans les boutiques AYWEBs.", 15, "regular", INK_2)
    y += S[4] + 8

    rounded(d, (M, y, W / SCALE - M, y + 46), R["full"], fill=SURFACE, outline=INK, width=1.6)
    text(d, (W / (2 * SCALE), y + 23), "Voir la sélection", 15, "bold", INK, anchor="mm")

    # ── SECTION 3 · Boutiques (cartes-logo 3:4, comme la page Boutiques)
    y += 46 + S[6]
    d.line([px(M), px(y), px(W / SCALE - M), px(y)], fill=LINE, width=px(1))
    y += S[5]
    text(d, (M, y), "Explorer les boutiques", 22, "bold", INK, anchor="ls")
    icon_chevron(d, W / SCALE - M - 10, y - 8, INK, 22)
    y += S[3] + 4

    stride = card_w * 4 / 3 + 8 + 18 + 19 + 18
    for index, (name, subtitle, _domain) in enumerate(STORE_CATALOG[:4]):
        row, col = divmod(index, 2)
        x0 = M + col * (card_w + S[3])
        y0 = y + row * stride
        draw_store_card(canvas, d, x0, y0, card_w, name,
                        subtitle=subtitle.split(" · ")[0], subtitle_size=12)

    y += 2 * stride + S[4]
    rounded(d, (M, y, W / SCALE - M, y + 48), R["md"], fill=SURFACE, outline=LINE, width=1)
    icon_grid(d, M + 24, y + 24, VIOLET, 20)
    text(d, (M + 48, y + 24), "Toutes les boutiques", 14, "bold", INK, anchor="lm")
    text(d, (W / SCALE - M - 32, y + 24), "364", 12, "regular", MUTED, anchor="rm")
    icon_chevron(d, W / SCALE - M - 20, y + 24, MUTED, 18)

    # recadrage sur le contenu réel (+ marge basse)
    bottom = min(canvas.height, px(y + 48 + S[6]))
    return canvas.crop((0, 0, canvas.width, bottom))


# ─── Écran : boutiques (liste) ──────────────────────────────────────────────
STORES = ["Amazon", "SHEIN", "Zalando", "TEMU", "Stradivarius", "Nike"]


SCREEN_H = 844 * SCALE  # écran fixe : la recherche


STORE_PHOTO = {
    "Amazon": "hero-tech.jpg",
    "SHEIN": "hero-mode-homme.jpg",
    "Zalando": "hero-mode-femme.jpg",
    "TEMU": "hero-sport.jpg",
}
# Deux enseignes empruntent les visuels de catégories : aucune image inventée.
STORE_PHOTO_CATEGORY = {
    "Stradivarius": "category-shoes.jpg",
    "Nike": "category-home.jpg",
}


def store_photo(name: str) -> str:
    if name in STORE_PHOTO:
        return os.path.join(ASSETS, "hero", STORE_PHOTO[name])
    return os.path.join(ASSETS, "aywebs", STORE_PHOTO_CATEGORY[name.upper().capitalize()])


def draw_heart_button(d, cx, cy, active=False, size=36):
    """Bouton favori : pastille blanche + cœur, lisible sur toute photo."""
    r = size / 2
    d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=SURFACE)
    icon_heart(d, cx, cy + 0.5, VIOLET if active else INK, 16, filled=active)


def render_boutiques() -> Image.Image:
    """Page Boutiques : le gabarit de la référence — grandes cartes 3:4, logos entiers."""
    canvas = Image.new("RGBA", (W, 2600), SURFACE)
    d = ImageDraw.Draw(canvas)
    M = S[4]

    status_bar(d)

    # Bouton retour + titre
    icon_chevron(d, M + 10, 64, INK, 22, "left")
    text(d, (M + 34, 64), "Boutiques", 22, "bold", INK, anchor="lm")
    icon_heart(d, W / SCALE - M - 84, 64, INK)
    badge(d, W / SCALE - M - 72, 52, "1")
    icon_cart(d, W / SCALE - M - 22, 64, INK)
    badge(d, W / SCALE - M - 10, 52, "2")
    d.line([px(0), px(88), px(W / SCALE), px(88)], fill=LINE, width=px(1))

    # Recherche
    rounded(d, (M, 104, W / SCALE - M, 152), R["md"], fill=SURFACE, outline=LINE, width=1)
    icon_search(d, M + 24, 128, INK, 20)
    text(d, (M + 48, 128), "Rechercher une boutique", 15, "regular", MUTED, anchor="lm")
    d.line([px(M), px(168), px(W / SCALE - M), px(168)], fill=LINE, width=px(1))

    card_w = (W / SCALE - 2 * M - S[3]) / 2

    # Favoris : deux cartes, cœur plein
    y = 196
    text(d, (M, y), "Favoris", 20, "bold", INK, anchor="ls")
    y += S[3] + 4
    for index, (name, subtitle, domain) in enumerate(STORE_CATALOG[:2]):
        x0 = M + index * (card_w + S[3])
        draw_store_card(canvas, d, x0, y, card_w, name, subtitle, domain,
                        saved=True, show_visit=True)
    y += card_w * 4 / 3 + 8 + 18 + 22 + 17 + 20 + S[5]

    # Toutes les boutiques
    text(d, (M, y), "Toutes les boutiques", 20, "bold", INK, anchor="ls")
    text(d, (W / SCALE - M, y - 2), "364", 13, "regular", MUTED, anchor="rs")
    y += S[3] + 4

    stride = card_w * 4 / 3 + 8 + 18 + 22 + 17 + 20 + S[5]
    for index, (name, subtitle, domain) in enumerate(STORE_CATALOG[2:]):
        row, col = divmod(index, 2)
        x0 = M + col * (card_w + S[3])
        y0 = y + row * stride
        draw_store_card(canvas, d, x0, y0, card_w, name, subtitle, domain, show_visit=True)

    bottom = min(canvas.height, px(y + 2 * stride + S[5]))
    return canvas.crop((0, 0, canvas.width, bottom))


# ─── Écran : recherche active ──────────────────────────────────────────────
def render_search() -> Image.Image:
    canvas = Image.new("RGBA", (W, SCREEN_H), SURFACE)
    d = ImageDraw.Draw(canvas)
    M = S[4]
    status_bar(d)

    # En-tête compact : retour, champ actif, loupe
    rounded(d, (M, 44, W / SCALE - M, 90), R["md"], fill=SURFACE, outline=VIOLET, width=2)
    icon_chevron(d, M + 24, 67, INK, 20, "left")
    text(d, (M + 48, 67), "sneakers", 16, "regular", INK, anchor="lm")
    icon_search(d, W / SCALE - M - 24, 67, VIOLET, 20)
    d.line([px(M), px(110), px(W / SCALE - M), px(110)], fill=LINE, width=px(1))

    # Titre de résultats
    y = 140
    text(d, (M, y), "Résultats", 26, "bold", INK, anchor="ls")
    y += 28
    text(d, (M, y), "148 boutiques", 14, "regular", MUTED, anchor="ls")

    # Chips de filtres (défilement horizontal)
    y += S[3] + 4
    chip_x = M
    for index, label in enumerate(["Tout", "Mode", "Chaussures", "High-tech", "Maison"]):
        width = text_width(label, 13, "semibold") + 28
        active = index == 0
        rounded(d, (chip_x, y, chip_x + width, y + 32), R["full"],
                fill=VIOLET if active else SURFACE,
                outline=None if active else LINE, width=1)
        text(d, (chip_x + width / 2, y + 16), label, 13, "semibold",
             SURFACE if active else INK, anchor="mm")
        chip_x += width + S[2]

    # Grille de résultats : photo + titre + prix TND + boutique
    y += 32 + S[5]
    card_w = (W / SCALE - 2 * M - S[3]) / 2
    photo_h = card_w
    results = [
        ("Sneakers cuir blanc", "289,400 TND", "Amazon", "shoes"),
        ("Sweat à capuche", "149,900 TND", "SHEIN", "fashion"),
        ("Lampe de table", "89,500 TND", "Zalando", "home"),
        ("Smartphone 128 Go", "1 240,000 TND", "Amazon", "electronics"),
        ("Crème visage 50 ml", "64,200 TND", "SHEIN", "beauty"),
        ("Robot pâtissier", "512,000 TND", "TEMU", "kitchen"),
    ]
    for index, (title, price, store, key) in enumerate(results):
        row, col = divmod(index, 2)
        x0 = M + col * (card_w + S[3])
        y0 = y + row * (photo_h + 78)
        if y0 + photo_h > 844 - 70:
            break
        paste_cover(canvas, os.path.join(ASSETS, "aywebs", CATEGORY_PHOTO[key]),
                    (x0, y0, x0 + card_w, y0 + photo_h), R["lg"])
        text(d, (x0, y0 + photo_h + 10), title, 13, "bold", INK)
        text(d, (x0, y0 + photo_h + 30), price, 13, "bold", INK)
        text(d, (x0, y0 + photo_h + 50), store, 12, "regular", MUTED)

    # CTA collant du panier : jaune AYWEBs (COMMERCE.action)
    rounded(d, (M, 844 - 76, W / SCALE - M, 844 - 24), R["full"], fill=COMMERCE)
    text(d, (W / (2 * SCALE), 844 - 50), "Voir le panier · 2 articles", 15, "bold", INK, anchor="mm")
    return canvas


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    home = render_home()
    boutique = render_boutiques()
    search = render_search()
    home.convert("RGB").save(os.path.join(OUT, "officiel-01-accueil.png"), optimize=True)
    boutique.convert("RGB").save(os.path.join(OUT, "officiel-02-boutiques.png"), optimize=True)
    search.convert("RGB").save(os.path.join(OUT, "officiel-03-recherche.png"), optimize=True)
    print("✓ officiel-01-accueil.png")
    print("✓ officiel-02-boutiques.png")
    print("✓ officiel-03-recherche.png")


if __name__ == "__main__":
    sys.exit(main())
