"""
موكاب الفيش الجديد — مبني على سكرين شوت التطبيق (25/10/2026).

القواعد:
  • 2px = 1dp، الشاشة 360×800dp ⇒ 720×1600px.
  • خط التطبيق: ZalandoSans (لاتيني) و NotoSansArabic (عربي).
  • ما نزيدش حتى بلوك: صورة، اسم، سطر وصف، ثمن + ثمن مشطوب،
    فاصل رمادي، سطر «Taille» مسكّر، فاصل رمادي، وشريط سفلي فيه
    الثمن + زر أسود + فاصل رمادي فوقو.
  • ثلاث صور في الگاليري باش نختبرو التمرير (3 نقط).
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

SCREEN_W, SCREEN_H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (138, 138, 138)
HAIR = (232, 232, 232)
STRIKE = (150, 150, 150)
PAGE = (245, 245, 245)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

PHOTOS = [
    ("docs/design/cardproduit/photos/01-trois-quarts.webp", 1.0),   # 3/4 face
    ("docs/design/cardproduit/photos/02-profil.jpg", 1.0),    # profil
    ("docs/design/cardproduit/photos/03-dessus.jpg", 1.0),    # dessus
]

NAME = "Sneaker Low-Top"
SUBTITLE = "Baskets basses — gris clair"
PRICE = "199.00 TND"
COMPARE = "249.00 TND"
COMPARE_LABEL = "Prix conseillé"
CTA = "Ajouter au panier"


def cover(path, width, height, zoom=1.0):
    im = Image.open(path).convert("RGB")
    scale = max(width / im.width, height / im.height) * zoom
    im = im.resize((max(width, int(im.width * scale)), max(height, int(im.height * scale))), Image.LANCZOS)
    left = (im.width - width) // 2
    top = (im.height - height) // 2
    return im.crop((left, top, left + width, top + height))


def icon_back(d, cx, cy, color=INK, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=color, width=w, joint="curve")


def icon_bag(d, cx, cy, color=INK, w=4):
    r = 20
    d.rounded_rectangle([cx - r, cy - 16, cx + r, cy + 22], radius=6, outline=color, width=w)
    d.arc([cx - 11, cy - 30, cx + 11, cy - 4], 180, 360, fill=color, width=w)


def icon_expand(d, cx, cy, color=INK, w=4):
    a, b = 18, 8
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = cx + sx * a, cy + sy * a
        d.line([(x, y), (x - sx * b, y)], fill=color, width=w)
        d.line([(x, y), (x, y - sy * b)], fill=color, width=w)


def icon_ruler(d, x, y, color=INK):
    d.rounded_rectangle([x, y, x + 22, y + 42], radius=5, outline=color, width=4)
    for i in range(3):
        yy = y + 10 + i * 11
        d.line([(x + 6, yy), (x + 13, yy)], fill=color, width=3)


def chevron_down(d, cx, cy, color=INK, w=4):
    d.line([(cx - 12, cy - 6), (cx, cy + 7), (cx + 12, cy - 6)], fill=color, width=w, joint="curve")


def screen(photo_index):
    img = Image.new("RGB", (SCREEN_W, SCREEN_H), WHITE)
    d = ImageDraw.Draw(img)

    # ── الصورة: من أعلى الشاشة إلى حدّ الورقة (430dp) ────────────────────────
    photo_h = 800
    shot, zoom = PHOTOS[photo_index]
    img.paste(cover(shot, SCREEN_W, photo_h, zoom), (0, 0))

    icon_back(d, 48, 112)
    icon_bag(d, 668, 112)

    # نقاط الگاليري + أيقونة التكبير، فوق الصورة
    total, gap, y = 3, 26, 776
    start = SCREEN_W / 2 - (total - 1) * gap / 2
    for i in range(total):
        x = start + i * gap
        r = 6 if i == photo_index else 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == photo_index else (168, 168, 168))
    icon_expand(d, 660, 776)

    # ── الورقة البيضاء اللي تطلع فوق الصورة ─────────────────────────────────
    sheet = 800
    d.rounded_rectangle([0, sheet, SCREEN_W, SCREEN_H + 40], radius=40, fill=WHITE)
    d.rectangle([0, sheet + 40, SCREEN_W, SCREEN_H], fill=WHITE)
    PAD = 32

    # سطر 1: الاسم يسار، الثمن يمين
    name_y = 852
    d.text((PAD, name_y), NAME, font=latin(40, "Bold"), fill=INK)
    pw = d.textlength(PRICE, font=latin(40, "Bold"))
    d.text((SCREEN_W - PAD - pw, name_y), PRICE, font=latin(40, "Bold"), fill=INK)

    # سطر 2: الوصف القصير يسار، الثمن المشطوب يمين
    sub_y = 914
    d.text((PAD, sub_y), SUBTITLE, font=latin(24), fill=MUTED)
    lab_font, cmp_font = latin(19), latin(21)
    lab_w = d.textlength(COMPARE_LABEL, font=lab_font)
    cmp_w = d.textlength(COMPARE, font=cmp_font)
    right = SCREEN_W - PAD
    d.text((right - cmp_w, sub_y + 1), COMPARE, font=cmp_font, fill=STRIKE)
    d.line([(right - cmp_w, sub_y + 16), (right, sub_y + 16)], fill=STRIKE, width=2)
    d.text((right - cmp_w - 8 - lab_w, sub_y + 2), COMPARE_LABEL, font=lab_font, fill=MUTED)

    # فاصل رمادي
    d.line([(PAD, 972), (SCREEN_W - PAD, 972)], fill=HAIR, width=2)

    # سطر «Taille» — مسكّر (يفتح ورقة اختيار المقاس)
    icon_ruler(d, PAD, 998)
    d.text((PAD + 42, 1002), "Taille", font=latin(28, "Bold"), fill=INK)
    chevron_down(d, SCREEN_W - PAD - 14, 1019)

    # فاصل رمادي
    d.line([(PAD, 1066), (SCREEN_W - PAD, 1066)], fill=HAIR, width=2)

    # ── شريط سفلي ثابت: فاصل رمادي + ثمن + زر أسود ─────────────────────────
    bar = 1454
    d.rectangle([0, bar, SCREEN_W, SCREEN_H], fill=WHITE)
    d.line([(0, bar), (SCREEN_W, bar)], fill=HAIR, width=2)
    d.text((PAD, bar + 40), PRICE, font=latin(30, "Bold"), fill=INK)
    d.rounded_rectangle([330, bar + 22, 688, bar + 122], radius=50, fill=INK)
    tw = d.textlength(CTA, font=latin(28, "Bold"))
    d.text((330 + (358 - tw) / 2, bar + 52), CTA, font=latin(28, "Bold"), fill=WHITE)

    return img


# ── التركيب: ثلاث شاشات + عنوان + تعليق ─────────────────────────────────────
GAP, MARGIN, HEAD, FOOT = 64, 64, 150, 96
W = MARGIN * 2 + SCREEN_W * 3 + GAP * 2
H = HEAD + SCREEN_H + FOOT
page = Image.new("RGB", (W, H), PAGE)
pd = ImageDraw.Draw(page)

pd.text((MARGIN, 34), ar("موكاب الفيش: إعادة بناء حرفية"), font=arabic(46, bold=True), fill=INK)
pd.text((MARGIN, 98), ar("صورة تتمرر، فاصل رمادي، سطر المقاس مسكر، شريط سفلي اسود"),
        font=arabic(26), fill=MUTED)

captions = [
    "الصورة الاولى",
    "الصورة الثانية بعد التمرير",
    "الصورة الثالثة بعد التمرير",
]
for i in range(3):
    x = MARGIN + i * (SCREEN_W + GAP)
    page.paste(screen(i), (x, HEAD))
    pd.rounded_rectangle([x, HEAD, x + SCREEN_W, HEAD + SCREEN_H], radius=28, outline=(214, 214, 214), width=2)
    cap = ar(captions[i])
    cw = pd.textlength(cap, font=arabic(28))
    pd.text((x + (SCREEN_W - cw) / 2, HEAD + SCREEN_H + 30), cap, font=arabic(28), fill=(90, 90, 90))

page = page.resize((int(W * 0.58), int(H * 0.58)), Image.LANCZOS)
page.save("docs/design/cardproduit/mockup-fiche-v2-25-10.png")
print("ok", page.size)
