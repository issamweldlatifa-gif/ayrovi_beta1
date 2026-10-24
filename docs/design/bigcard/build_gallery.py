#!/usr/bin/env python3
"""
FICHE PRODUIT — galerie, sections séparées, feuille de taille, carte « Taille & coupe ».

Planche générée pour le propriétaire (24/10/2026) d'après SES captures de la fiche
Zalando « Pier One » : elle montre ce qu'il a demandé explicitement —

  1. l'image est une GALERIE (on glisse, on ouvre en plein écran, on zoome) ;
  2. la fiche est découpée en SECTIONS séparées par un FILET GRIS, et chaque
     section a ses propres marges (mesurées au pixel sur la capture) ;
  3. la carte « Taille & coupe » est RICHE : mesures par taille, longueurs,
     mannequin — la « forme » qu'il veut reproduire à l'identique.

Les cotes viennent des captures 720×1600 : 1 dp ≈ 1,846 px à 390 dp de large.
Toutes les valeurs sont imprimées dans le panneau « القياسات المقروءة ».

Usage :  python3 docs/design/bigcard/build_gallery.py
Sortie : docs/design/bigcard/mockup-gallery-24-10.png (+ .jpg)
"""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "docs/design/bigcard"
ASSETS = ROOT / "docs/design/reel/assets"

INK = (14, 14, 14)
MUT = (122, 122, 122)
LINE = (232, 232, 232)      # #E8E8E8 — le filet gris du modèle
STUDIO = (246, 246, 246)    # #F6F6F6 — fond des photos produit
WHITE = (255, 255, 255)
GREEN = (11, 122, 64)
VIOLET = (87, 30, 246)
RED = (214, 32, 45)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BRAND_R = ROOT / "assets/fonts/ZalandoSans-Regular.ttf"
BRAND_B = ROOT / "assets/fonts/ZalandoSans-Bold.ttf"


def F(size, bold=False):
    return ImageFont.truetype(DEJAVU_B if bold else DEJAVU, int(round(size)))


def B(size, bold=False):
    return ImageFont.truetype(str(BRAND_B if bold else BRAND_R), int(round(size)))


def AR(text):
    return get_display(arabic_reshaper.reshape(text))


def cover(im, w, h):
    scale = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


def tint(im, colour, strength=0.55):
    grey = im.convert("L").convert("RGB")
    return Image.blend(grey, Image.new("RGB", im.size, colour), strength)


SWEATER = Image.open(ASSETS / "p-knit.jpg").convert("RGB")
JUMPSUIT = Image.open(ASSETS / "p-jumpsuit.jpg").convert("RGB")
TROUSERS = Image.open(ASSETS / "p-trousers.jpg").convert("RGB")

# ── cotes mesurées sur les captures (px @720 → dp @390) ──────────────────────
PX_PER_DP = 720 / 390
DP = lambda px: round(px / PX_PER_DP)          # noqa: E731
COTES = {
    "filet": DP(2),            # 1 dp  — filet entre deux lignes d'une section
    "separateur": DP(16),      # 9 dp  — bande grise entre deux sections
    "ligne": DP(98),           # 53 dp — ligne « clé / valeur » à deux colonnes
    "mannequin": DP(63),       # 34 dp — bande blanche du mannequin
    "taille": DP(83),          # 45 dp — une ligne de la feuille de taille
    "photo": DP(0),            # photo pleine largeur, fond #F6F6F6
}

W, H = 390, 844
HEAD = 54          # en-tête (transparent sur la photo, blanc ensuite)
IMAGE_H = 430      # hauteur de la zone photo
BAR = 72           # bandeau d'achat fixe


def base_screen():
    im = Image.new("RGB", (W, H), WHITE)
    return im, ImageDraw.Draw(im)


def header(d, solid, title=""):
    if solid:
        d.rectangle((0, 0, W, HEAD), fill=WHITE)
        d.line((0, HEAD, W, HEAD), fill=LINE)
        colour = INK
        if title:
            d.text((W / 2, HEAD / 2), title, font=B(14), fill=INK, anchor="mm")
    else:
        colour = INK
    # retour : flèche simple, sans pastille (comme le modèle)
    d.line((22, HEAD / 2, 34, HEAD / 2 - 8), fill=colour, width=2)
    d.line((22, HEAD / 2, 34, HEAD / 2 + 8), fill=colour, width=2)
    d.line((22, HEAD / 2, 40, HEAD / 2), fill=colour, width=2)
    # sac
    d.rounded_rectangle((W - 38, HEAD / 2 - 9, W - 22, HEAD / 2 + 9), radius=2, outline=colour, width=2)
    d.arc((W - 34, HEAD / 2 - 6, W - 26, HEAD / 2 + 2), 180, 360, fill=colour, width=2)


def gallery_dots(d, y, count=6, active=0, centre=W / 2, step=11):
    for index in range(count):
        cx = centre + (index - (count - 1) / 2) * step
        colour = INK if index == active else (198, 198, 198)
        d.ellipse((cx - 3, y - 3, cx + 3, y + 3), fill=colour)


def mannequin_band(im, d, y):
    d.rectangle((0, y, W, y + COTES["mannequin"]), fill=WHITE)
    d.text((10, y + COTES["mannequin"] / 2), AR("موديلنا 187 سم يلبس M"), font=F(11), fill=INK, anchor="lm")


def buy_bar(d, price=True):
    top = H - BAR
    d.rectangle((0, top, W, H), fill=WHITE)
    d.line((0, top, W, top), fill=LINE, width=1)
    if price:
        d.text((12, top + 22), "189.00", font=B(15, True), fill=INK, anchor="lm")
        d.text((12 + d.textlength("189.00", font=B(15, True)) + 4, top + 24), "TND", font=B(9), fill=MUT, anchor="lm")
    d.rounded_rectangle((W - 206, top + 12, W - 12, top + 56), radius=22, fill=INK)
    d.text((W - 109, top + 34), AR("زيد للسلّة"), font=F(14, True), fill=WHITE, anchor="mm")


# ── 1 · la fiche avec sa galerie ────────────────────────────────────────────
def screen_gallery(active=0):
    im, d = base_screen()
    shot = [SWEATER, JUMPSUIT, TROUSERS][active % 3]
    im.paste(cover(shot, W, IMAGE_H), (0, 0))
    header(d, False)
    # compteur « 1/6 »
    label = f"{active + 1}/6"
    tw = d.textlength(label, font=F(11, True))
    d.rounded_rectangle((W - 24 - tw - 12, IMAGE_H - 34, W - 12, IMAGE_H - 12), radius=11, fill=(20, 20, 20))
    d.text((W - 18 - tw, IMAGE_H - 23), label, font=F(11, True), fill=WHITE, anchor="lm")
    # icône plein écran
    d.line((W - 34, IMAGE_H - 58, W - 34, IMAGE_H - 42), fill=INK, width=2)
    d.line((W - 34, IMAGE_H - 42, W - 18, IMAGE_H - 42), fill=INK, width=2)
    d.line((W - 18, IMAGE_H - 42, W - 18, IMAGE_H - 50), fill=INK, width=2)
    mannequin_band(im, d, IMAGE_H - 34)
    gallery_dots(d, IMAGE_H + 12, active=active)
    # feuille : marque + prix, puis sections séparées
    y = IMAGE_H + 34
    d.rectangle((0, y, W, H - BAR), fill=WHITE)
    d.line((0, y, W, y), fill=LINE, width=1)
    y += 14
    d.text((12, y), "PIER ONE BY ZALANDO", font=B(9, True), fill=MUT)
    d.text((W - 12, y - 2), "189.00 TND", font=B(16, True), fill=INK, anchor="ra")
    y += 18
    d.text((12, y), "2 PACK — Sweatshirt, blanc", font=B(13), fill=INK)
    d.text((W - 12, y + 2), "239.00 TND", font=B(10), fill=MUT, anchor="ra")
    y += 34

    def section_gap(y):
        d.rectangle((0, y, W, y + COTES["separateur"]), fill=LINE)
        return y + COTES["separateur"]

    def hairline(y):
        d.line((0, y, W, y), fill=LINE, width=1)
        return y

    # ── section 1 : sélecteur de taille (replié)
    d.text((12, y + 14), AR("المقاس"), font=F(13, True), fill=INK)
    d.text((W - 12, y + 14), AR("اختر"), font=F(11), fill=MUT, anchor="ra")
    d.line((W - 30, y + 22, W - 22, y + 30), fill=INK, width=2)
    d.line((W - 22, y + 30, W - 14, y + 22), fill=INK, width=2)
    y = section_gap(y + 46)

    # ── section 2 : couleur, en miniatures-images
    d.text((12, y + 14), AR("اللون"), font=F(13, True), fill=INK)
    d.text((64, y + 15), "blanc", font=F(11), fill=MUT)
    y += 36
    thumb, gap = 80, 6
    for index, colour in enumerate([(255, 255, 255), (28, 36, 64), (150, 180, 205), (110, 110, 110)]):
        x = 12 + index * (thumb + gap)
        im.paste(tint(SWEATER, colour).resize((thumb, thumb), Image.LANCZOS), (x, y))
        if index == 0:
            d.rectangle((x, y + thumb + 2, x + thumb, y + thumb + 5), fill=VIOLET)
        d.text((x, y + thumb + 10), ["blanc", "bleu", "ciel", "gris"][index], font=F(10), fill=INK)
    y = section_gap(y + thumb + 26)

    # ── section 3 : caractéristiques, deux colonnes, filets
    d.text((12, y + 14), AR("الخصائص"), font=F(13, True), fill=INK)
    y += 40
    pairs = [
        ("Occasion", "loisirs"), ("Motif", "uni"),
        ("Longueur", "standard"), ("Fermeture", "éclair"),
        ("Col", "rond"), ("Coupe", "regular"),
        ("Manches", "longues"), ("Silhouette", "droite"),
    ]
    for index, (key, value) in enumerate(pairs):
        column = index % 2
        row = index // 2
        x = 12 if column == 0 else 200
        cy = y + row * COTES["ligne"]
        d.text((x, cy), f"{key}", font=F(9, True), fill=INK)
        d.text((x, cy + 15), value, font=F(11), fill=MUT)
        if index % 2 == 1:
            hairline(cy + COTES["ligne"] - 2)
    y = section_gap(y + 4 * COTES["ligne"] + 4)
    d.text((12, y + 14), AR("الوصف"), font=F(13, True), fill=INK)
    buy_bar(d)
    return im


# ── 1 bis · les sections, avec leurs filets et leurs marges ────────────────
def screen_sections():
    im, d = base_screen()
    im.paste(cover(SWEATER, W, 250), (0, 0))
    header(d, False)
    mannequin_band(im, d, 250 - COTES["mannequin"])
    gallery_dots(d, 262)
    y = 286
    d.rectangle((0, y, W, y + 6), fill=LINE)          # filet de séparation sous la photo
    y += 6

    def band(y, title, hint):
        d.rectangle((0, y, W, y + COTES["separateur"]), fill=(238, 238, 238))
        # cote imprimée dans la bande
        d.text((W - 8, y + COTES["separateur"] / 2), hint, font=F(8), fill=(150, 150, 150), anchor="rm")
        return y + COTES["separateur"]

    d.text((12, y + 12), AR("المقاس"), font=F(13, True), fill=INK)
    d.text((W - 30, y + 12), AR("اختر"), font=F(11), fill=MUT, anchor="ra")
    d.line((12, y + 42, W, y + 42), fill=LINE, width=1)
    y = band(y + 42, "", f"{COTES['separateur']}dp")

    d.text((12, y + 12), AR("اللون"), font=F(13, True), fill=INK)
    y += 36
    for index, colour in enumerate([(255, 255, 255), (28, 36, 64), (150, 180, 205), (110, 110, 110)]):
        x = 12 + index * 86
        im.paste(tint(SWEATER, colour).resize((80, 80), Image.LANCZOS), (x, y))
        if index == 0:
            d.rectangle((x, y + 82, x + 80, y + 85), fill=VIOLET)
    y = band(y + 104, "", f"{COTES['separateur']}dp")

    d.text((12, y + 12), AR("الخصائص"), font=F(13, True), fill=INK)
    y += 36
    for index, (key, value) in enumerate([("Occasion", "loisirs"), ("Motif", "uni"),
                                          ("Longueur", "standard"), ("Coupe", "regular")]):
        x = 12 if index % 2 == 0 else 200
        cy = y + (index // 2) * COTES["ligne"]
        d.text((x, cy), key, font=F(9, True), fill=INK)
        d.text((x, cy + 15), value, font=F(11), fill=MUT)
        d.line((12, cy + COTES["ligne"] - 2, W, cy + COTES["ligne"] - 2), fill=LINE, width=1)
    y = band(y + 2 * COTES["ligne"] + 2, "", f"1dp · {COTES['ligne']}dp")
    d.text((12, y + 12), AR("المقاس والقصّة"), font=F(13, True), fill=INK)
    d.text((W - 26, y + 12), AR("افتح"), font=F(11), fill=MUT, anchor="ra")
    d.line((12, y + 42, W, y + 42), fill=LINE, width=1)
    band(y + 42, "", "")
    buy_bar(d)
    return im


# ── 2 · visionneuse plein écran ────────────────────────────────────────────
def screen_fullscreen(zoomed=False):
    """Visionneuse, mesurée sur la capture : fond blanc, X en haut à gauche,
    la photo « flotte » au milieu du blanc, les points en bas. Pas de barre."""
    im, d = base_screen()
    top, height = 250, 520
    if zoomed:
        shot = cover(SWEATER, int(W * 1.55), int(height * 1.15))
        im.paste(shot, (-int((shot.width - W) / 2), top - 60))
    else:
        im.paste(cover(SWEATER, W, height), (0, top))
    d.rectangle((0, 0, W, top), fill=WHITE)
    d.rectangle((0, top + height, W, H), fill=WHITE)
    d.line((28, 52, 44, 68), fill=INK, width=2)
    d.line((44, 52, 28, 68), fill=INK, width=2)
    d.text((W - 16, 60), AR("تصغير" if zoomed else "تكبير"), font=F(11), fill=MUT, anchor="rm")
    gallery_dots(d, top + height + 40, active=1 if zoomed else 0)
    d.text((W / 2, top + height + 74), AR("اسحب · اقرص للتكبير"), font=F(11), fill=MUT, anchor="ma")
    return im


# ── 3 · feuille de taille ─────────────────────────────────────────────────
def screen_size_sheet():
    im, d = base_screen()
    im.paste(cover(SWEATER, W, H), (0, 0))
    overlay = Image.new("RGBA", (W, H), (20, 20, 20, 150))
    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(im)
    top = 210
    d.rounded_rectangle((0, top, W, H), radius=16, fill=WHITE)
    d.rectangle((0, top + 20, W, H), fill=WHITE)
    d.rounded_rectangle((W / 2 - 18, top + 10, W / 2 + 18, top + 14), radius=2, fill=(208, 208, 208))
    y = top + 30
    d.text((14, y), AR("اختر مقاسك"), font=F(16), fill=INK)
    y += 40
    rows = [("FR", "", False), ("XS", "", False), ("S", "", False), ("M", "", False),
            ("L", AR("باقي 2"), True), ("XL", AR("آخر قطعة"), True), ("3XL", AR("آخر قطعة"), True),
            ("4XL", AR("باقي 4"), True)]
    for index, (label, note, hot) in enumerate(rows):
        cy = y + index * COTES["taille"]
        d.text((14, cy + COTES["taille"] / 2), label, font=F(14), fill=INK, anchor="lm")
        if note:
            d.text((W - 14, cy + COTES["taille"] / 2), note, font=F(12), fill=VIOLET, anchor="rm")
        d.line((0, cy + COTES["taille"], W, cy + COTES["taille"]), fill=LINE, width=1)
    return im


# ── 4 · carte « Taille & coupe » ──────────────────────────────────────────
def screen_size_card():
    im, d = base_screen()
    d.rectangle((0, 0, W, HEAD), fill=WHITE)
    d.line((0, HEAD, W, HEAD), fill=LINE)
    header(d, True, "Taille & coupe")
    y = HEAD + 4
    d.text((12, y), AR("القياسات بالسنتيمتر"), font=F(11), fill=MUT)
    y += 22

    # tableau : une colonne par taille
    sizes = ["S", "M", "L", "XL"]
    rows = [("الصدر", [96, 102, 108, 114]), ("الطول الكلّي", [66, 68, 70, 72]),
            ("الأكمام", [64, 66, 68, 70]), ("الأكتاف", [44, 46, 48, 50])]
    col0, colw = 96, (W - 96 - 12) / len(sizes)
    d.rectangle((0, y, W, y + 30), fill=(247, 247, 247))
    d.text((12, y + 15), AR("القياس"), font=F(10, True), fill=MUT, anchor="lm")
    for index, size in enumerate(sizes):
        cx = col0 + colw * index + colw / 2
        d.text((cx, y + 15), size, font=F(11, True), fill=INK, anchor="mm")
    y += 30
    for key, values in rows:
        cy = y
        d.text((12, cy + 16), AR(key), font=F(10), fill=MUT, anchor="lm")
        for index, value in enumerate(values):
            cx = col0 + colw * index + colw / 2
            d.text((cx, cy + 16), str(value), font=F(11), fill=INK, anchor="mm")
        y += 30
        d.line((12, y, W, y), fill=LINE, width=1)
    y += 12
    d.text((12, y), AR("مانيكان طوله 189 سم · يلبس M"), font=F(10), fill=MUT)
    y += 26

    # encart : mannequin + guide
    im.paste(cover(JUMPSUIT, 110, 150), (W - 122, y))
    d.text((12, y), AR("كيفاش تقيس"), font=F(12, True), fill=INK)
    for index, text in enumerate(["الصدر: تحت الإبط", "الطول: من الكتف", "الكمّ: من الكتف"]):
        d.text((12, y + 20 + index * 18), "· " + AR(text), font=F(10), fill=MUT)
    d.text((12, y + 84), AR("دليل المقاسات الكامل"), font=F(11, True), fill=INK)
    tw = d.textlength(AR("دليل المقاسات الكامل"), font=F(11, True))
    d.line((12, y + 98, 12 + tw, y + 98), fill=INK, width=2)
    y += 168
    d.rectangle((0, y, W, y + COTES["separateur"]), fill=LINE)
    y += COTES["separateur"] + 14
    d.text((12, y), AR("التبديل مجاني خلال 30 يوم"), font=F(11), fill=INK)
    d.text((12, y + 18), AR("التوصيل في 2 إلى 4 أيام"), font=F(10), fill=MUT)
    buy_bar(d)
    return im


# ── assemblage ─────────────────────────────────────────────────────────────
def frame(im, label, sub, accent=INK):
    pad = 12
    w, h = im.width + pad * 2, im.height + pad * 2 + 46
    cv = Image.new("RGB", (w, h), (242, 242, 242))
    d = ImageDraw.Draw(cv)
    cv.paste(im, (pad, pad))
    d.rounded_rectangle((pad, pad, pad + im.width, pad + im.height), radius=18, outline=(214, 214, 214), width=2)
    d.text((w / 2, pad + im.height + 12), AR(label), font=F(15, True), fill=accent, anchor="ma")
    d.text((w / 2, pad + im.height + 32), AR(sub), font=F(11), fill=MUT, anchor="ma")
    return cv


panels = [
    frame(screen_gallery(0), "1 · الصورة مجموعة صور", "اسحب · عدّاد 1/6 · نقّاطات"),
    frame(screen_fullscreen(False), "2 · صورة كاملة", "X في الفوق · نقّاطات في التحت"),
    frame(screen_fullscreen(True), "3 · تكبير", "قرصة بإصبعين · اسحب"),
    frame(screen_sections(), "4 · أقسام مفصولة", "شريط رمادي 9dp بين الأقسام"),
    frame(screen_size_sheet(), "5 · اختيار المقاس", "كل سطر 45dp · آخر قطعة"),
    frame(screen_size_card(), "6 · بطاقة المقاس والقصّة", "جدول قياسات + مانيكان"),
]

GAP = 26
grid_w = sum(p.width for p in panels[:3]) + GAP * 2
head_h = 128
row_h = max(p.height for p in panels)
panel_w = 470
canvas_w = grid_w + panel_w + 80
canvas_h = head_h + row_h * 2 + 90
canvas = Image.new("RGB", (canvas_w, canvas_h), (242, 242, 242))
d = ImageDraw.Draw(canvas)


def ar(xy, text, size=18, fill=INK, bold=False, anchor="ra"):
    d.text(xy, AR(text), font=F(size, bold), fill=fill, anchor=anchor)


ar((canvas_w - 40, 26), "الكارطة الكبيرة — الصورة مجموعة صور والأقسام", size=32, bold=True)
ar((canvas_w - 40, 74), "قست كل شيء على تصاورك (720×1600) وحوّلتهم لـdp على 390", size=16, fill=MUT)

x0 = 30
for row in range(2):
    x = x0
    for panel in panels[row * 3: row * 3 + 3]:
        canvas.paste(panel, (x, head_h + row * (row_h + 40)))
        x += panel.width + GAP

# panneau des cotes
px0 = x0 + grid_w + 20
py0 = head_h
d.rounded_rectangle((px0 - 12, py0 - 12, px0 + panel_w - 12, py0 + row_h * 2 + 20), radius=18, fill=WHITE, outline=(226, 226, 226))
ar((px0 + panel_w - 34, py0 + 8), "القياسات المقروءة", size=19, bold=True)
y = py0 + 48
for label, value, note in [
    ("بين قسم وقسم", f"{COTES['separateur']}dp", "خطّ رمادي #E8E8E8"),
    ("خطّ داخل القسم", f"{COTES['filet']}dp", "#E8E8E8"),
    ("سطر (عمودين)", f"{COTES['ligne']}dp", "مفتاح + قيمة"),
    ("سطر المقاس", f"{COTES['taille']}dp", "في الورقة السفلية"),
    ("شريط الموديل", f"{COTES['mannequin']}dp", "أبيض على الصورة"),
    ("صورة المنتوج", "390×430", "خلفية #F6F6F6"),
]:
    d.text((px0 + panel_w - 34, y), value, font=F(17, True), fill=INK, anchor="ra")
    ar((px0 + panel_w - 34 - d.textlength(value, font=F(17, True)) - 14, y), label, size=16)
    ar((px0 + panel_w - 34, y + 22), note, size=12, fill=MUT)
    y += 54

y += 6
ar((px0 + panel_w - 34, y), "اللي يلزم من الخادم", size=18, bold=True)
y += 34
for text in ["جدول القياسات لكل مقاس", "طول المانيكان والمقاس", "مقاسات القصّة (regular/slim)"]:
    ar((px0 + panel_w - 34, y), text, size=14, fill=MUT)
    y += 24

d.text((30, canvas_h - 40), "docs/design/bigcard/mockup-gallery-24-10.png", font=F(14), fill=(160, 160, 160))
canvas.save(OUT_DIR / "mockup-gallery-24-10.png")
canvas.convert("RGB").save(OUT_DIR / "mockup-gallery-24-10.jpg", quality=92, optimize=True)
print("saved", canvas.size)
