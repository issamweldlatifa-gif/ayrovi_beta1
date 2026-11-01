#!/usr/bin/env python3
"""
Planche de la carte « article » du Reel — GÉNÉRÉE DEPUIS LE CODE.

Aucun chiffre n'est écrit ici : tout est **lu** dans les sources qui font foi
(`shared/articleCard.ts` et `apps/mobile/src/features/reels/reelTray.ts`), puis
dessiné. Si une cote change dans le code, la planche change au prochain run —
c'est le seul moyen qu'une planche ne mente pas trois jours après.

Les icônes sont les **vraies** Ionicons du projet (le TTF de `@expo/vector-icons`),
pas un tracé à main levée : ce que tu vois est le glyphe qui sera installé.

Usage
-----
    python3 docs/design/reel/compare/build_mockup.py

Sorties (mêmes dossiers, écrasées) :
    docs/design/reel/compare/mockup-code-24-10.png
    docs/design/reel/compare/mockup-code-24-10.jpg

Dépendances : Pillow, arabic_reshaper, python-bidi (déjà installés dans l'atelier).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import arabic_reshaper
from bidi.algorithm import get_display

ROOT = Path(__file__).resolve().parents[4]
COMPARE = ROOT / "docs/design/reel/compare"
ASSETS = ROOT / "docs/design/reel/assets"
ICONS = ROOT / "apps/mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons"

INK = (12, 12, 12)
MUTED = (125, 125, 125)
STUDIO = (246, 246, 246)
WHITE = (255, 255, 255)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LATIN = lambda s, b=False: ImageFont.truetype(DEJAVU_B if b else DEJAVU, int(s))
ar = lambda text: get_display(arabic_reshaper.reshape(text))

BRAND_B = ROOT / "assets/fonts/ZalandoSans-Bold.ttf"
BRAND_SB = ROOT / "apps/mobile/assets/fonts/ZalandoSans-SemiBold.ttf"
BRAND_R = ROOT / "assets/fonts/ZalandoSans-Regular.ttf"


def brand_font(size: float, weight: str = "r"):
    path = {"b": BRAND_B, "s": BRAND_SB}.get(weight, BRAND_R)
    return ImageFont.truetype(str(path), int(round(size)))


# ── lecture des cotes dans le code ───────────────────────────────────────────
def read_constants(path: Path, block: str) -> dict[str, float]:
    text = path.read_text(encoding="utf-8")
    start = text.index(block)
    body = text[start : text.index("} as const;", start)]
    values: dict[str, float] = {}
    for key, raw in re.findall(r"(\w+):\s*(-?\d+(?:\.\d+)?)", body):
        values[key] = float(raw)
    return values


CARD = read_constants(ROOT / "shared/articleCard.ts", "export const ARTICLE_CARD = {")
TRAY = read_constants(
    ROOT / "apps/mobile/src/features/reels/reelTray.ts", "export const REEL_TRAY = {"
)

for required in ("width", "height", "radius", "gap", "thumb", "brandSize", "titleSize", "priceSize", "favourite"):
    if required not in CARD:
        raise SystemExit(f"cote manquante dans shared/articleCard.ts : {required}")
for required in ("cardBottom", "padding", "cardGap", "pillHeight", "pillGap", "pillClosedBottom", "railGap", "railInset", "railHit"):
    if required not in TRAY:
        raise SystemExit(f"cote manquante dans reelTray.ts : {required}")

SCREEN_W, SCREEN_H = 390.0, 844.0
S = 2.0  # suréchantillonnage du rendu téléphone


def dp(value: float) -> int:
    return int(round(value * S))


# ── icônes : la famille du projet, telle quelle ─────────────────────────────
GLYPHS = json.loads((ICONS / "glyphmaps/Ionicons.json").read_text(encoding="utf-8"))
ICON_FONT = str(ICONS / "Fonts/Ionicons.ttf")


def ion(im: Image.Image, name: str, size: float, cx: float, cy: float, color) -> None:
    draw = ImageDraw.Draw(im)
    draw.text((cx, cy), chr(GLYPHS[name]), font=ImageFont.truetype(ICON_FONT, int(round(size))), fill=color, anchor="mm")


# ── décor ───────────────────────────────────────────────────────────────────
def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    scale = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    left = (im.width - w) // 2
    top = (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


POSTER = Image.open(ASSETS / "reel-poster.jpg").convert("RGB").filter(ImageFilter.GaussianBlur(9))
SHOT_1 = Image.open(ASSETS / "p-jacket.jpg").convert("RGB")
SHOT_2 = Image.open(ASSETS / "p-jumpsuit.jpg").convert("RGB")
REFERENCE = Image.open(COMPARE / "reference-ouvert.jpg").convert("RGB")

PW, PH = dp(SCREEN_W), dp(SCREEN_H)


def phone(open_state: bool, playing: bool = False) -> Image.Image:
    """Un écran de Reel : la vidéo, puis la pastille, le rail et les cartes."""
    im = cover(POSTER, PW, PH).copy()
    veil = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    dv = ImageDraw.Draw(veil)
    steps = int(PH * 0.42)
    for i in range(steps):
        dv.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(0, 0, 0, int(120 * (i / steps) ** 1.5)))
    im = Image.alpha_composite(im.convert("RGBA"), veil).convert("RGB")
    d = ImageDraw.Draw(im)

    # retour : cercle 43, à 13 / 37 (mesuré sur le modèle)
    bx, by = dp(13), dp(37)
    d.ellipse((bx, by, bx + dp(43), by + dp(43)), fill=(30, 30, 30))
    ion(im, "chevron-back", dp(21), bx + dp(21.5), by + dp(21.5), WHITE)

    if playing:
        pr = dp(30)
        pcx, pcy = PW // 2, int(PH * 0.40)
        d.ellipse((pcx - pr, pcy - pr, pcx + pr, pcy + pr), outline=(245, 245, 245), width=dp(2.6))
        ion(im, "play", dp(30), pcx + dp(2), pcy, (245, 245, 245))

    # pastille : au-dessus des cartes ouvertes, près du bord fermée
    label = "Masquer les articles" if open_state else "Voir les articles"
    pill_h = dp(TRAY["pillHeight"])
    pill_w = max(dp(158), d.textlength(label, font=brand_font(dp(15), "b")) + dp(66))
    px = dp(TRAY["padding"])
    py = (
        PH - dp(TRAY["cardBottom"]) - dp(CARD["height"]) - dp(TRAY["pillGap"]) - pill_h
        if open_state
        else PH - dp(TRAY["pillClosedBottom"]) - pill_h
    )
    fill = (9, 9, 9) if open_state else WHITE
    fg = WHITE if open_state else INK
    centre = py + pill_h // 2

    # rail : accroché à la pastille (descend avec elle)
    rail_x = PW - dp(TRAY["railInset"])
    ion(im, "chatbubble-outline", dp(23), rail_x, centre, WHITE)
    ion(im, "volume-mute", dp(23), rail_x, centre - dp(TRAY["railGap"]), WHITE)
    ion(im, "share-social-outline", dp(23), rail_x, centre - 2 * dp(TRAY["railGap"]), WHITE)

    d.rounded_rectangle((px, py, px + pill_w, py + pill_h), radius=pill_h // 2, fill=fill)
    d.text((px + dp(24), centre), label, font=brand_font(dp(15), "b"), fill=fg, anchor="lm")
    ion(im, "chevron-up" if open_state else "chevron-down", dp(19), px + pill_w - dp(26), centre, fg)

    # auteur, juste au-dessus de la pastille
    ay = py - dp(46)
    d.ellipse((px, ay, px + dp(30), ay + dp(30)), fill=(226, 226, 226))
    tx = px + dp(40)
    f14 = brand_font(dp(14))
    d.text((tx, ay + dp(15)), "tinasomnia", font=f14, fill=WHITE, anchor="lm")
    d.text(
        (tx + d.textlength("tinasomnia", font=f14) + dp(8), ay + dp(15)),
        "· Follow",
        font=brand_font(dp(14), "b"),
        fill=WHITE,
        anchor="lm",
    )
    if not open_state:
        return im

    # cartes : aplomb blanc, aucun bord, aucune ombre, marge tout autour
    cw, ch = dp(CARD["width"]), dp(CARD["height"])
    radius = dp(CARD["radius"])
    band = dp(CARD["thumb"])
    top = PH - dp(TRAY["cardBottom"]) - ch

    def card(x: int, shot: Image.Image, brand: str, title: str, price: str) -> None:
        d.rounded_rectangle((x, top, x + cw, top + ch), radius=radius, fill=WHITE)
        zone = Image.new("RGB", (band, ch), STUDIO)
        scale = min((band - dp(8)) / shot.width, (ch - dp(8)) / shot.height)
        thumb = (int(shot.width * scale), int(shot.height * scale))
        zone.paste(shot.resize(thumb, Image.LANCZOS), ((band - thumb[0]) // 2, (ch - thumb[1]) // 2))
        mask = Image.new("L", (cw, ch), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=radius, fill=255)
        im.paste(zone, (x, top), mask.crop((0, 0, band, ch)))
        tx0 = x + band + dp(CARD["gap"])
        d.text((tx0, top + dp(16)), brand, font=brand_font(dp(CARD["brandSize"]), "b"), fill=INK)
        d.text((tx0, top + dp(39)), title, font=brand_font(dp(CARD["titleSize"])), fill=INK)
        d.text((tx0, top + dp(62)), price, font=brand_font(dp(CARD["priceSize"]), "s"), fill=INK)
        ion(im, "heart-outline", dp(CARD["favourite"]), x + cw - dp(20), top + dp(21), INK)

    card(dp(TRAY["padding"]), SHOT_1, "Stradivarius", "Faux leather jacket - grey", "189.00 TND")
    card(
        dp(TRAY["padding"]) + cw + dp(TRAY["cardGap"]),
        SHOT_2,
        "SHEIN",
        "Ensemble tendance",
        "153.51 TND",
    )
    return im


def paste(canvas: Image.Image, x: int, y: int, im: Image.Image, radius: int = 20) -> None:
    canvas.paste(im, (x, y))
    ImageDraw.Draw(canvas).rounded_rectangle(
        (x, y, x + im.width, y + im.height), radius=radius, outline=(216, 216, 216), width=2
    )


# ── planche ─────────────────────────────────────────────────────────────────
W, H = 1780, 1330
canvas = Image.new("RGB", (W, H), (242, 242, 242))
d = ImageDraw.Draw(canvas)


def arabic(xy, text, size=20, fill=INK, bold=False, anchor="ra"):
    d.text(xy, ar(text), font=LATIN(size, bold), fill=fill, anchor=anchor)


arabic((W - 70, 36), "الريل — النسخة المطابقة للكود", size=38, bold=True)
arabic((W - 70, 92), "كل رقم في هذي الصورة مقروء من الكود · الأيقونات Ionicons الحقيقية", size=19, fill=MUTED)

opened = phone(True)
closed = phone(False, playing=True)
scale = 0.50
opened_s = opened.resize((int(opened.width * scale), int(opened.height * scale)), Image.LANCZOS)
closed_s = closed.resize((int(closed.width * scale), int(closed.height * scale)), Image.LANCZOS)
ax, ay = 80, 140
bx, by = ax + opened_s.width + 70, 140
paste(canvas, ax, ay, opened_s)
paste(canvas, bx, by, closed_s)
arabic((ax + opened_s.width // 2, ay + opened_s.height + 14), "محلول", size=21, bold=True, anchor="ma")
arabic((bx + closed_s.width // 2, by + closed_s.height + 14), "مسكّر", size=21, bold=True, anchor="ma")

# colonne de droite : la famille d'icônes réellement utilisée
rx = W - 80
arabic((rx, 140), "الأيقونات — من عائلة المشروع", size=21, bold=True)
family = [
    ("share-social-outline", "مشاركة"),
    ("volume-mute", "صوت"),
    ("chatbubble-outline", "تعليق"),
    ("chevron-back", "رجوع"),
    ("heart-outline", "قلب"),
]
for index, (name, label) in enumerate(family):
    yy = 186 + index * 50
    d.rounded_rectangle((rx - 54, yy - 19, rx - 10, yy + 27), radius=13, fill=(26, 26, 26))
    ion(canvas, name, dp(10), rx - 32, yy + 4, WHITE)
    d.text((rx - 68, yy + 4), name, font=LATIN(16), fill=INK, anchor="rm")
    arabic((rx - 232, yy + 4), label, size=16, fill=MUTED, anchor="rm")

arabic((rx, 470), "اللي في الصورة (مقروء من الكود)", size=21, bold=True)
rows = [
    ("الكارطة", f"{CARD['width']:.0f} x {CARD['height']:.0f}"),
    ("الزاوية", f"r {CARD['radius']:.0f}"),
    ("الصورة", f"{CARD['thumb'] / CARD['width'] * 100:.0f}%"),
    ("البين", f"{TRAY['cardGap']:.0f}"),
    ("الحاشية", f"{TRAY['padding']:.0f} / {TRAY['cardBottom']:.0f}"),
    ("الزرّ", f"{TRAY['pillHeight']:.0f}"),
    ("الرّيل", f"{TRAY['railGap']:.0f}"),
]
for index, (label, value) in enumerate(rows):
    yy = 524 + index * 40
    arabic((rx, yy), label, size=18, bold=True)
    d.text((rx - 250, yy + 3), value, font=LATIN(16), fill=MUTED, anchor="la")

# comparaison de la carte avec le modèle, à la même largeur
ref_card = REFERENCE.crop((24, 1265, 688, 1569))
ref_card = ref_card.resize((420, int(ref_card.height * 420 / ref_card.width)), Image.LANCZOS)
card_top = PH - dp(TRAY["cardBottom"]) - dp(CARD["height"])
my_card = opened.crop((dp(TRAY["padding"]), card_top, dp(TRAY["padding"]) + dp(CARD["width"]), PH - dp(TRAY["cardBottom"])))
my_card = my_card.resize((420, int(my_card.height * 420 / my_card.width)), Image.LANCZOS)
cy0 = 1058
canvas.paste(ref_card, (90, cy0))
canvas.paste(my_card, (90 + 420 + 70, cy0))
arabic((90 + 210, cy0 + ref_card.height + 14), "المرجع", size=20, bold=True, anchor="ma")
arabic((90 + 420 + 70 + 210, cy0 + my_card.height + 14), "الكود", size=20, bold=True, anchor="ma")
arabic((W - 80, cy0 + 10), "نفس النسب", size=18, fill=MUTED)
d.text((W - 80, cy0 + 42), f"663x303  vs  {CARD['width']:.0f}x{CARD['height']:.0f}", font=LATIN(17), fill=MUTED, anchor="ra")
d.text((80, cy0 + ref_card.height + 52), "docs/design/reel/compare/mockup-code-24-10.png", font=LATIN(15), fill=(160, 160, 160))

out = COMPARE / "mockup-code-24-10.png"
canvas.save(out)
canvas.convert("RGB").save(out.with_suffix(".jpg"), quality=92, optimize=True)
print(f"saved {out.relative_to(ROOT)} {canvas.size}")
