"""
الموكاب الكامل للفيش — 4 شاشات (25/10/2026).

  1. الشاشة الأولى   : صورة كبيرة + اسم/ثمن + وصف + سطر Taille مسكّر
  2. الشاشة الثانية  : بعد التمرير — Couleur + 3 accordéons + Livraison + Retours + Partager
  3. ورقة المقاسات   : اللي تتحلّ كي تدقّ على Taille
  4. الصورة كاملة    : full screen (X + تمرير + نقاط)

**بلا «Prix conseillé» وبلا تخفيض** — ما فماش ثمن قديم ولا نسبة.

كل المقاسات بالبكسل من سكرين شوتات المرجع (720×1600 = 360×800dp):
  • الشاشة الأولى : 1162 حدّ الصورة · 1186 الاسم · 1249 الخط · 1256 الوصف ·
                    1342 خطّ رقيق · 1376→1440 Taille · 1440→1458 فاصل رمادي ·
                    1458→1600 الشريط (الزرّ 290→703 / 1480→1575)
  • الشاشة الثانية: 173 الهيدر · 180→287 Taille · 287→385 Couleur · 407→599 الصور
                    (137×192) · 694/1002/1336 فواصل 16px · 710/806/904 accordéons ·
                    1018 Livraison · 1140 Retours · 1352 Partager · 1454 الخط
  • ورقة المقاسات : 45 بداية الورقة · 89 المقبض · 149 العنوان · 181→313 لوحة ·
                    348 العناوين · 430 أوّل سطر (كل 104)
  • فولسكرين      : 280→1320 الصورة · X 37→69/82→114 · نقاط 1516 (8 نقط)
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (128, 128, 128)
HAIR = (232, 232, 232)
LAVENDER = (238, 236, 247)
GREEN = (0, 135, 53)
VIOLET = (86, 30, 239)
DOT_OFF = (178, 178, 178)
MEDIA = (239, 239, 239)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def lat(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def ara(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

PAD = 32
PHOTOS = [
    "docs/design/cardproduit/photos/01-trois-quarts.webp",
    "docs/design/cardproduit/photos/02-profil.jpg",
    "docs/design/cardproduit/photos/03-dessus.jpg",
    "docs/design/cardproduit/photos/04-rouge.png",
]
NAME = "Sneaker Low-Top"
SUB = "Baskets basses — gris clair"
PRICE = "199.00 TND"
CTA = "Ajouter au panier"

# ── أدوات ──────────────────────────────────────────────────────────────────
def cover(path, w, h, margin=0.14):
    im = Image.open(path).convert("RGB")
    s = min(int(w * (1 - margin)) / im.width, int(h * (1 - margin)) / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    bg = Image.new("RGB", (w, h), im.getpixel((2, 2)))
    bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return bg

def i_back(d, cx, cy, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=INK, width=w, joint="curve")

def i_bag(d, cx, cy, w=4):
    r = 20
    d.rounded_rectangle([cx - r, cy - 16, cx + r, cy + 22], radius=6, outline=INK, width=w)
    d.arc([cx - 11, cy - 30, cx + 11, cy - 4], 180, 360, fill=INK, width=w)

def i_close(d, cx, cy, size=16, w=5):
    d.line([(cx - size, cy - size), (cx + size, cy + size)], fill=INK, width=w)
    d.line([(cx + size, cy - size), (cx - size, cy + size)], fill=INK, width=w)

def i_ruler(d, x, y):
    d.rounded_rectangle([x, y, x + 26, y + 48], radius=6, outline=INK, width=4)
    for i in range(3):
        yy = y + 12 + i * 12
        d.line([(x + 7, yy), (x + 16, yy)], fill=INK, width=4)

def i_chev(d, cx, cy, w=4):
    d.line([(cx - 13, cy - 6), (cx, cy + 8), (cx + 13, cy - 6)], fill=INK, width=w, joint="curve")

def i_palette(d, cx, cy, w=4):
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=INK, width=w)
    for dx, dy in ((-11, -9), (0, -14), (11, -8), (13, 6)):
        d.ellipse([cx + dx - 5, cy + dy - 5, cx + dx + 5, cy + dy + 5], outline=INK, width=w)

def i_tag(d, cx, cy, w=4):
    d.line([(cx - 20, cy - 18), (cx + 4, cy - 18), (cx + 20, cy - 2), (cx + 20, cy + 16),
            (cx - 6, cy + 16), (cx - 20, cy + 2), (cx - 20, cy - 18)], fill=INK, width=w, joint="curve")
    d.ellipse([cx - 12, cy - 10, cx - 2, cy], outline=INK, width=w)

def i_matiere(d, cx, cy, w=4):
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=INK, width=w)
    d.arc([cx - 16, cy - 22, cx + 30, cy + 24], 120, 300, fill=INK, width=w)
    d.arc([cx - 28, cy - 14, cx + 14, cy + 28], 300, 120, fill=INK, width=w)

def i_coupe(d, cx, cy, w=4):
    d.ellipse([cx - 7, cy - 26, cx + 7, cy - 12], outline=INK, width=w)
    d.line([(cx, cy - 12), (cx, cy + 12)], fill=INK, width=w)
    d.line([(cx, cy - 4), (cx - 16, cy + 8)], fill=INK, width=w)
    d.line([(cx, cy - 4), (cx + 16, cy + 8)], fill=INK, width=w)
    d.line([(cx, cy + 12), (cx - 12, cy + 26)], fill=INK, width=w)
    d.line([(cx, cy + 12), (cx + 12, cy + 26)], fill=INK, width=w)

def i_truck(d, cx, cy, w=4):
    d.rectangle([cx - 30, cy - 14, cx + 6, cy + 10], outline=INK, width=w)
    d.line([(cx + 6, cy - 4), (cx + 20, cy - 4), (cx + 28, cy + 6), (cx + 28, cy + 10), (cx + 6, cy + 10)],
           fill=INK, width=w, joint="curve")
    for dx in (-20, 0, 22):
        d.ellipse([cx + dx - 6, cy + 8, cx + dx + 6, cy + 20], outline=INK, width=w)

def i_share(d, cx, cy, w=4):
    for dx, dy in ((-18, 0), (12, -16), (12, 16)):
        d.ellipse([cx + dx - 7, cy + dy - 7, cx + dx + 7, cy + dy + 7], outline=INK, width=w)
    d.line([(cx - 11, cy - 3), (cx + 6, cy - 12)], fill=INK, width=w)
    d.line([(cx - 11, cy + 3), (cx + 6, cy + 12)], fill=INK, width=w)

def bar(d, price_left=True):
    """الشريط السفلي: الثمن + الزرّ الأسود. بلا عدّاد حملة."""
    d.rectangle([0, 1458, W, H], fill=WHITE)
    if price_left:
        d.text((PAD, 1508), PRICE, font=lat(30, "Bold"), fill=INK)
    d.rounded_rectangle([290, 1480, 703, 1575], radius=47, fill=INK)
    tw = d.textlength(CTA, font=lat(30, "Bold"))
    d.text(((290 + 703) / 2 - tw / 2, 1510), CTA, font=lat(30, "Bold"), fill=WHITE)

# ── 1. الشاشة الأولى ───────────────────────────────────────────────────────
def screen_top():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    img.paste(cover(PHOTOS[0], W, 1162), (0, 0))
    i_back(d, 48, 112)
    i_bag(d, 657, 104)

    y = 1106
    for i in range(len(PHOTOS)):
        x = W / 2 - (len(PHOTOS) - 1) * 13 + i * 26
        r = 6 if i == 0 else 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == 0 else DOT_OFF)

    d.text((PAD, 1186), NAME, font=lat(44), fill=INK)
    nw = d.textlength(NAME, font=lat(44))
    d.line([(PAD, 1249), (PAD + nw, 1249)], fill=(170, 170, 170), width=4)

    pf = lat(40, "Bold")
    pw = d.textlength(PRICE, font=pf)
    d.text((W - 34 - pw, 1182), PRICE, font=pf, fill=INK)

    df = lat(30)
    words, line, lines = SUB.split(), "", []
    for word in words:
        trial = (line + " " + word).strip()
        if d.textlength(trial, font=df) <= (W - 34 - pw) - PAD - 16 or not line:
            line = trial
        else:
            lines.append(line); line = word
    lines.append(line)
    for i, tl in enumerate(lines[:2]):
        d.text((PAD, 1256 + i * 34), tl, font=df, fill=MUTED)

    d.line([(0, 1342), (W, 1342)], fill=HAIR, width=2)

    # سطر Taille: مسكّر (يفتح ورقة المقاسات)
    d.text((114, 1386), "Taille", font=lat(36, "Bold"), fill=INK)
    i_ruler(d, 46, 1380)
    i_chev(d, W - 40, 1408)

    d.rectangle([0, 1440, W, 1458], fill=HAIR)
    bar(d)
    return img

# ── 2. الشاشة الثانية ──────────────────────────────────────────────────────
def screen_bottom():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    i_back(d, 55, 108)
    d.text((123, 82), NAME, font=lat(38), fill=INK)
    i_bag(d, 657, 103)
    d.rectangle([0, 173, W, 179], fill=HAIR)

    i_ruler(d, 42, 190)
    d.text((114, 206), "Taille", font=lat(34, "Bold"), fill=INK)
    i_chev(d, W - 40, 222)
    d.rectangle([0, 271, W, 287], fill=HAIR)

    i_palette(d, 54, 344)
    d.text((114, 314), "Couleur", font=lat(34, "Bold"), fill=INK)
    d.text((114 + d.textlength("Couleur", font=lat(34, "Bold")) + 14, 314), "Gris", font=lat(34), fill=INK)

    tx = PAD
    for path, label, sel in ((PHOTOS[0], "gris", True), (PHOTOS[3], "multicolore", False)):
        im = Image.open(path).convert("RGB")
        s = max(137 / im.width, 192 / im.height)
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
        im = im.crop(((im.width - 137) // 2, (im.height - 192) // 2,
                      (im.width - 137) // 2 + 137, (im.height - 192) // 2 + 192))
        img.paste(im, (tx, 407))
        if sel:
            d.rectangle([tx, 598, tx + 137, 606], fill=VIOLET)
        d.text((tx, 612), label, font=lat(30, "Bold" if sel else "Regular"), fill=INK)
        tx += 137 + 17

    d.rectangle([0, 694, W, 710], fill=HAIR)
    for top, bottom, icon, label in ((710, 806, i_tag, "Caractéristiques"),
                                     (806, 904, i_matiere, "Matière"),
                                     (904, 1002, i_coupe, "Taille & coupe")):
        cy = (top + bottom) // 2
        icon(d, 54, cy)
        d.text((114, cy - 26), label, font=lat(34, "Bold"), fill=INK)
        i_chev(d, W - 40, cy)
        if bottom < 1002:
            d.line([(0, bottom), (W, bottom)], fill=HAIR, width=2)

    d.rectangle([0, 1002, W, 1018], fill=HAIR)

    i_truck(d, 56, 1052)
    d.text((114, 1026), "Livraison rapide", font=lat(32, "Bold"), fill=GREEN)
    d.text((114, 1072), "30 octobre - 04 novembre", font=lat(30), fill=MUTED)
    d.text((114, 1160), "Retours gratuits", font=lat(32, "Bold"), fill=INK)
    d.text((114, 1206), "pendant 31 jours à compter de la date de", font=lat(30), fill=MUTED)
    d.text((114, 1242), "livraison", font=lat(30), fill=MUTED)

    d.rectangle([0, 1336, W, 1352], fill=HAIR)

    i_share(d, 54, 1400)
    d.text((114, 1378), "Partager", font=lat(34, "Bold"), fill=INK)
    d.line([(0, 1454), (W, 1454)], fill=HAIR, width=4)

    bar(d)
    return img

# ── 3. ورقة المقاسات ──────────────────────────────────────────────────────
SIZES = [("40", "7", "last"), ("41", "8", "out"), ("42", "8.5", "out"), ("42.5", "9", "out"),
         ("43", "9.5", None), ("44", "10", "out"), ("44.5", "10.5", "out"), ("45", "11", None),
         ("45.5", "11.5", "out"), ("46", "12", "out"), ("47.5", "13", "out"), ("48.5", "14", "reserved")]
STATE = {"last": "Dernier article", "reserved": "Réserve"}
ROW_TOP, ROW_H = 430, 96

def screen_sheet():
    base = screen_top()
    img = base.copy()
    d = ImageDraw.Draw(img)
    scrim = Image.new("RGB", (W, 45), (20, 20, 20))
    img.paste(Image.blend(img.crop((0, 0, W, 45)), scrim, 0.35), (0, 0))

    d.rectangle([0, 45, W, H], fill=WHITE)
    d.rounded_rectangle([328, 89, 391, 97], radius=4, fill=(209, 209, 209))
    d.text((PAD, 140), "Sélectionnez votre taille", font=lat(34), fill=INK)

    d.rectangle([32, 181, 688, 313], fill=LAVENDER)
    i_ruler(d, 64, 196)
    d.text((154, 216), "Nous vous recommandons de choisir", font=lat(30), fill=INK)
    d.text((154, 252), "la taille habituelle.", font=lat(30), fill=INK)

    d.text((42, 348), "FR", font=lat(24, "SemiBold"), fill=INK)
    d.text((204, 348), "SUR L'ÉTIQUETTE (US)", font=lat(24, "SemiBold"), fill=INK)

    for i, (fr, us, state) in enumerate(SIZES):
        # 96px par ligne ⇒ les 12 lignes tiennent entièrement (430 + 12*96 = 1582),
        # donc le dernier numéro (48.5 / 14) et son état sont visibles.
        top = ROW_TOP + i * ROW_H
        if top + ROW_H > H:
            break
        base_y = top + 4
        col = (150, 150, 150) if state == "out" else INK
        d.text((42, base_y), fr, font=lat(44), fill=col)
        d.text((204, base_y), us, font=lat(44), fill=col)
        if state == "out":
            d.line([(42, base_y + 30), (42 + d.textlength(fr, font=lat(44)), base_y + 30)], fill=col, width=3)
            d.line([(204, base_y + 30), (204 + d.textlength(us, font=lat(44)), base_y + 30)], fill=col, width=3)
        if state in STATE:
            label = STATE[state]
            lw = d.textlength(label, font=lat(30))
            d.text((677 - lw, base_y + 4), label, font=lat(30), fill=VIOLET)
        d.line([(0, top + ROW_H - 1), (W, top + ROW_H - 1)], fill=HAIR, width=2)
    return img

# ── 4. فولسكرين ───────────────────────────────────────────────────────────
def screen_full():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    im = Image.open(PHOTOS[1]).convert("RGB")
    ih = 1320 - 280
    s = min(W * 0.94 / im.width, ih * 0.90 / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    img.paste(im, ((W - im.width) // 2, 280 + (ih - im.height) // 2))

    i_close(d, 53, 98)
    for i in range(8):
        cx = 276 + i * 24
        d.ellipse([cx - 6, 1516, cx + 6, 1528], fill=INK if i == 1 else DOT_OFF)
    return img


shots = [screen_top(), screen_bottom(), screen_sheet(), screen_full()]
names = ["1-fiche-haut", "2-fiche-bas", "3-feuille-taille", "4-plein-ecran"]
for shot, name in zip(shots, names):
    shot.save(f"docs/design/cardproduit/ecran-{name}-25-10.png")

# ── اللوحة النهائية 2×2 ───────────────────────────────────────────────────
SCALE = 0.62
sw, sh = int(W * SCALE), int(H * SCALE)
GAP, MARGIN, HEAD, FOOT_H = 56, 56, 150, 76
page = Image.new("RGB", (MARGIN * 2 + sw * 2 + GAP, HEAD + sh * 2 + GAP + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)

pd.text((MARGIN, 26), ar("الفيش الكامل: 4 شاشات"), font=ara(44, bold=True), fill=INK)
pd.text((MARGIN, 94), ar("بلا ثمن قديم وبلا تخفيض. الزرّ اسود. الفواصل الرمادية كيما المرجع."),
        font=ara(24), fill=MUTED)

captions = ["الشاشة الأولى", "الشاشة الثانية (بعد التمرير)", "ورقة المقاسات", "الصورة كاملة"]
for i, (shot, cap) in enumerate(zip(shots, captions)):
    col, row = i % 2, i // 2
    x = MARGIN + col * (sw + GAP)
    y = HEAD + row * (sh + GAP)
    page.paste(shot.resize((sw, sh), Image.LANCZOS), (x, y))
    pd.rectangle([x, y, x + sw, y + sh], outline=(200, 200, 200), width=2)
    label = ar(cap)
    lw = pd.textlength(label, font=ara(26))
    pd.text((x + (sw - lw) / 2, y + sh + 8), label, font=ara(26), fill=(90, 90, 90))

page.save("docs/design/cardproduit/mockup-complet-25-10.png")
print("ok", page.size)
