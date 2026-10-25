"""
موكاب: الورقة كي توصل للهيدر (25/10/2026).

القياسات مأخوذة بالبكسل من `Screenshot_20261025_022004` (720×1600 = 360×800dp):

    الهيدر            0 → 173      (سهم 34→76 · العنوان 123→466 · سلة 638→676)
    فاصل هيدر         173 → 179
    Taille            180 → 287    (سطر مسكّر، chevron يمين 679)
    فاصل              271 → 287
    Couleur           287 → 385    (أيقونة لوحة + «Couleur» عريض + «Gris» عادي)
      vignettes       407 → 599    (32→169 و 186→323: 137×192dp، فراغ 17)
      خطّ التحديد     598 → 606    (بنفسجي، تحت الصورة المختارة)
      تسمية           605 → 659
    فاصل              694 → 710
    Caractéristiques  710 → 806
    Matière           806 → 904
    Taille & coupe    904 → 1002
    فاصل              1002 → 1018
    Livraison rapide  1018 → 1140  (أخضر #008735، ثم تاريخ)
    Retours gratuits  1140 → 1336
    فاصل              1336 → 1352
    Partager          1352 → 1454
    فاصل              1454 → 1458
    الشريط            1458 → 1600  («Se termine dans» يسار + زرّ 290→703 / 1480→1575)

ملاحظة صادقة: الزرّ في المرجع بنفسجي (`#571EF7`)، عندنا **أسود** (قرارك المسكّر).
«Se termine dans» = عدّاد حملة، ما عندناش حملة ⇒ السطر ما يظهرش. هنا حطّيناه
باش تشوف البلاصة، ومكتوب تحتها في اللوحة.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (128, 128, 128)
HAIR = (232, 232, 232)
GREEN = (0, 135, 53)
VIOLET = (86, 30, 239)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

PAD = 32
HEADER_H = 173
TITLE = "Sneaker Low-Top"


# ── الأيقونات (خطّ خارجي فقط) ──────────────────────────────────────────────
def i_back(d, cx, cy, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=INK, width=w, joint="curve")


def i_bag(d, cx, cy, w=4):
    r = 20
    d.rounded_rectangle([cx - r, cy - 16, cx + r, cy + 22], radius=6, outline=INK, width=w)
    d.arc([cx - 11, cy - 30, cx + 11, cy - 4], 180, 360, fill=INK, width=w)


def i_ruler(d, x, y):
    d.rounded_rectangle([x, y, x + 30, y + 56], radius=6, outline=INK, width=4)
    for i in range(3):
        yy = y + 14 + i * 14
        d.line([(x + 8, yy), (x + 18, yy)], fill=INK, width=4)


def i_palette(d, cx, cy, w=4):
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=INK, width=w)
    for dx, dy in ((-11, -9), (0, -14), (11, -8), (13, 6)):
        d.ellipse([cx + dx - 5, cy + dy - 5, cx + dx + 5, cy + dy + 5], outline=INK, width=w)
    d.arc([cx - 30, cy + 4, cx - 2, cy + 30], 0, 120, fill=INK, width=w)


def i_tag(d, cx, cy, w=4):
    d.line([(cx - 20, cy - 18), (cx + 4, cy - 18), (cx + 20, cy - 2), (cx + 20, cy + 16), (cx - 6, cy + 16), (cx - 20, cy + 2), (cx - 20, cy - 18)],
           fill=INK, width=w, joint="curve")
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
    d.line([(cx + 6, cy - 4), (cx + 20, cy - 4), (cx + 28, cy + 6), (cx + 28, cy + 10), (cx + 6, cy + 10)], fill=INK, width=w, joint="curve")
    for dx in (-20, 0, 22):
        d.ellipse([cx + dx - 6, cy + 8, cx + dx + 6, cy + 20], outline=INK, width=w)
    d.line([(cx - 24, cy - 6), (cx - 6, cy - 6)], fill=INK, width=w)
    d.line([(cx - 24, cy + 2), (cx - 6, cy + 2)], fill=INK, width=w)


def i_share(d, cx, cy, w=4):
    for dx, dy in ((-18, 0), (12, -16), (12, 16)):
        d.ellipse([cx + dx - 7, cy + dy - 7, cx + dx + 7, cy + dy + 7], outline=INK, width=w)
    d.line([(cx - 11, cy - 3), (cx + 6, cy - 12)], fill=INK, width=w)
    d.line([(cx - 11, cy + 3), (cx + 6, cy + 12)], fill=INK, width=w)


def i_chevron_down(d, cx, cy, w=4):
    d.line([(cx - 13, cy - 6), (cx, cy + 8), (cx + 13, cy - 6)], fill=INK, width=w, joint="curve")


def cover(path, w, h, margin=0.12):
    im = Image.open(path).convert("RGB")
    inner_w, inner_h = int(w * (1 - margin)), int(h * (1 - margin))
    scale = min(inner_w / im.width, inner_h / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    corner = im.getpixel((2, 2))
    bg = Image.new("RGB", (w, h), corner)
    bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return bg


def row(y_top, y_bottom, icon, label, trailing_chevron=True):
    """سطر accordéon: أيقونة + عنوان + chevron."""
    icon((y_top + y_bottom) // 2)
    d.text((PAD + 80, y_top + (y_bottom - y_top) // 2 - 26), label, font=latin(34, "Bold"), fill=INK)
    if trailing_chevron:
        i_chevron_down(d, W - 40, (y_top + y_bottom) // 2)


img = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(img)

# ── 1. الهيدر (فيكسو، مليان) ───────────────────────────────────────────────
i_back(d, 55, 108)
d.text((123, 82), TITLE, font=latin(38), fill=INK)
i_bag(d, 657, 103)
d.rectangle([0, HEADER_H, W, HEADER_H + 6], fill=HAIR)

# ── 2. Taille (مسكّر) ──────────────────────────────────────────────────────
i_ruler(d, PAD + 10, 190)
d.text((PAD + 80, 206), "Taille", font=latin(34, "Bold"), fill=INK)
i_chevron_down(d, W - 40, 222)
d.rectangle([0, 271, W, 279], fill=HAIR)

# ── 3. Couleur ─────────────────────────────────────────────────────────────
i_palette(d, PAD + 22, 344)
d.text((PAD + 82, 314), "Couleur", font=latin(34, "Bold"), fill=INK)
cw = d.textlength("Couleur", font=latin(34, "Bold"))
d.text((PAD + 82 + cw + 14, 314), "Gris", font=latin(34), fill=INK)

# vignettes 137×192dp
thumbs = [("docs/design/cardproduit/photos/01-trois-quarts.webp", "gris", True),
          ("docs/design/cardproduit/photos/04-rouge.png", "multicolore", False)]
tx = PAD
for path, label, selected in thumbs:
    img.paste(cover(path, 137, 192, margin=0.05), (tx, 407))
    if selected:
        d.rectangle([tx, 598, tx + 137, 606], fill=VIOLET)
    d.text((tx, 612), label, font=latin(30, "Bold" if selected else "Regular"), fill=INK)
    tx += 137 + 17

d.rectangle([0, 694, W, 710], fill=HAIR)

# ── 4. Accordéons ──────────────────────────────────────────────────────────
row(710, 806, lambda cy: i_tag(d, PAD + 22, cy), "Caractéristiques")
d.line([(0, 806), (W, 806)], fill=HAIR, width=2)
row(806, 904, lambda cy: i_matiere(d, PAD + 22, cy), "Matière")
d.line([(0, 904), (W, 904)], fill=HAIR, width=2)
row(904, 1002, lambda cy: i_coupe(d, PAD + 22, cy), "Taille & coupe")

d.rectangle([0, 1002, W, 1018], fill=HAIR)

# ── 5. Livraison / Retours ─────────────────────────────────────────────────
i_truck(d, PAD + 24, 1052)
d.text((PAD + 82, 1026), "Livraison rapide", font=latin(32, "Bold"), fill=GREEN)
d.text((PAD + 82, 1072), "30 octobre - 04 novembre", font=latin(30), fill=MUTED)
d.text((PAD + 82, 1160), "Retours gratuits", font=latin(32, "Bold"), fill=INK)
d.text((PAD + 82, 1206), "pendant 31 jours à compter de la date de", font=latin(30), fill=MUTED)
d.text((PAD + 82, 1242), "livraison", font=latin(30), fill=MUTED)

d.rectangle([0, 1336, W, 1352], fill=HAIR)

# ── 6. Partager ────────────────────────────────────────────────────────────
i_share(d, PAD + 22, 1400)
d.text((PAD + 80, 1378), "Partager", font=latin(34, "Bold"), fill=INK)

d.line([(0, 1454), (W, 1458)], fill=HAIR, width=4)

# ── 7. الشريط السفلي ───────────────────────────────────────────────────────
d.text((PAD - 14, 1496), "Se termine dans", font=latin(28), fill=MUTED)
d.text((PAD - 14, 1536), "1 j   20 h   39 m", font=latin(30, "Bold"), fill=INK)
d.rounded_rectangle([290, 1480, 703, 1575], radius=47, fill=INK)   # noir (décision), pas violet
cta = "Ajouter au panier"
tw = d.textlength(cta, font=latin(30, "Bold"))
d.text(((290 + 703) / 2 - tw / 2, 1510), cta, font=latin(30, "Bold"), fill=WHITE)

img.save("docs/design/cardproduit/apercu-ecran-bas-25-10.png")

# ── لوحة: المرجع × الموكاب ────────────────────────────────────────────────
ref = Image.open("/tmp/arena-coding-uploads/Screenshot_20261025_022004_com.gbox.android.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
MARGIN, GAP, HEAD, FOOT_H = 56, 60, 120, 60
page = Image.new("RGB", (MARGIN * 2 + W * 2 + GAP, HEAD + H + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("نفس الصفحة: المرجع × الموكاب"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 74), ar("يسار: صورتك، يمين: الموكاب بنفس المقاسات (الزرّ اسود حسب قرارك)"), font=arabic(22), fill=MUTED)
page.paste(ref, (MARGIN, HEAD))
page.paste(img, (MARGIN + W + GAP, HEAD))
for x in (MARGIN, MARGIN + W + GAP):
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(200, 200, 200), width=2)
page.save("docs/design/cardproduit/comparaison-bas-v9-25-10.png")
print("ok", page.size)
