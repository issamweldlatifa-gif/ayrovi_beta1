"""
موكاب الفيش — نسخة 3 (25/10/2026).

الملاحظات اللي تصحّحت:
  1. ما فمّاش فراغ أبيض: الصورة تاخذ 432dp مالـ800dp (54%).
  2. الورقة **بلا حواف دائرية** (زاوية قائمة).
  3. الاسم دايمًا تحتو خط رقيق، وتحتو الوصف القصير؛ مقابل الاسم الثمن،
     وتحتو الثمن المشطوب. السطر كلو ارتفاعو ثابت (60dp) مهما كان النصّ.
  4. سطر «Taille» نفس حجم المرجع، مقابل زر الفتح (chevron)، وتحتو خط رمادي.
  5. فاصل رمادي **أكبر** من الخطوط، وتحتو معلومات «add to cart».

المقياس: 2px = 1dp، 360×800dp ⇒ 720×1600px.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (120, 120, 120)
LINE = (222, 222, 222)      # الخط الرقيق
BAND = (236, 236, 236)      # الفاصل الأكبر
STRIKE = (150, 150, 150)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

PHOTOS = [
    "docs/design/cardproduit/photos/01-trois-quarts.webp",
    "docs/design/cardproduit/photos/02-profil.jpg",
    "docs/design/cardproduit/photos/03-dessus.jpg",
]

NAME = "Sneaker Low-Top"
SUBTITLE = "Baskets basses — gris clair"
PRICE = "199.00 TND"
COMPARE = "249.00 TND"
COMPARE_LABEL = "Prix conseillé"
CTA = "Ajouter au panier"

PHOTO_H = 864          # 432dp
PAD = 32
ROW_H = 120            # سطر الاسم: ارتفاع ثابت 60dp
TAILLE_TOP = PHOTO_H + ROW_H + 2      # بعد الاسم + الخط
TAILLE_H = 72          # 36dp: نفس حجم سطر المقاس في المرجع
BAND_Y = 1400
BAR_Y = 1416


def cover(path, width, height):
    im = Image.open(path).convert("RGB")
    scale = max(width / im.width, height / im.height)
    im = im.resize((max(width, int(im.width * scale)), max(height, int(im.height * scale))), Image.LANCZOS)
    return im.crop(((im.width - width) // 2, (im.height - height) // 2,
                    (im.width - width) // 2 + width, (im.height - height) // 2 + height))


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


def chevron(d, cx, cy, direction="down", color=INK, w=4):
    if direction == "down":
        d.line([(cx - 12, cy - 6), (cx, cy + 7), (cx + 12, cy - 6)], fill=color, width=w, joint="curve")
    else:
        d.line([(cx - 6, cy - 12), (cx + 7, cy), (cx - 6, cy + 12)], fill=color, width=w, joint="curve")


def screen(index):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # ── 1. الصورة: من فوق إلى حدّ الورقة، بلا فراغ ─────────────────────────────
    img.paste(cover(PHOTOS[index], W, PHOTO_H), (0, 0))
    icon_back(d, 48, 112)
    icon_bag(d, 668, 112)

    total, gap, y = 3, 26, PHOTO_H - 44
    start = W / 2 - (total - 1) * gap / 2
    for i in range(total):
        x = start + i * gap
        r = 6 if i == index else 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == index else (168, 168, 168))
    icon_expand(d, 660, y)

    # ── 2. الورقة: زاوية قائمة، بلا حواف دائرية ───────────────────────────────
    d.rectangle([0, PHOTO_H, W, H], fill=WHITE)

    # سطر الاسم (ارتفاع ثابت): يسار = الاسم + خط + وصف، يمين = الثمن + مشطوب
    name_font, price_font = latin(38, "Bold"), latin(38, "Bold")
    name_y = PHOTO_H + 30
    pw = d.textlength(PRICE, font=price_font)
    lab_font, cmp_font = latin(18), latin(20)
    lab_w = d.textlength(COMPARE_LABEL, font=lab_font)
    cmp_w = d.textlength(COMPARE, font=cmp_font)
    d.text((PAD, name_y), NAME, font=name_font, fill=INK)
    # الخط تحت الاسم دايماً، ويمتد على عرض العمود حتى لو الاسم قصير أو طويل.
    left_col_w = W - PAD * 2 - max(pw, lab_w + cmp_w) - 24
    d.line([(PAD, name_y + 50), (PAD + left_col_w, name_y + 50)], fill=INK, width=2)
    d.text((PAD, name_y + 62), SUBTITLE, font=latin(23), fill=MUTED)

    d.text((W - PAD - pw, name_y), PRICE, font=price_font, fill=INK)
    right = W - PAD
    d.text((right - cmp_w, name_y + 64), COMPARE, font=cmp_font, fill=STRIKE)
    d.line([(right - cmp_w, name_y + 78), (right, name_y + 78)], fill=STRIKE, width=2)
    d.text((right - cmp_w - 8 - lab_w, name_y + 65), COMPARE_LABEL, font=lab_font, fill=MUTED)

    # الخط الرقيق الأوّل
    d.line([(PAD, TAILLE_TOP), (W - PAD, TAILLE_TOP)], fill=LINE, width=2)

    # ── 3. سطر «Taille»: نفس الحجم، مقابل زر الفتح ────────────────────────────
    cy = TAILLE_TOP + TAILLE_H / 2
    icon_ruler(d, PAD, int(cy - 21))
    d.text((PAD + 42, int(cy - 18)), "Taille", font=latin(30, "Bold"), fill=INK)
    chevron(d, W - PAD - 14, int(cy), "down")

    # الخط الرقيق الثاني
    d.line([(PAD, TAILLE_TOP + TAILLE_H), (W - PAD, TAILLE_TOP + TAILLE_H)], fill=LINE, width=2)

    # ── 4. الفاصل الرمادي الأكبر، وتحتو معلومات «add to cart» ─────────────────
    d.rectangle([0, BAND_Y, W, BAR_Y], fill=BAND)

    d.text((PAD, BAR_Y + 42), PRICE, font=latin(28, "Bold"), fill=INK)
    d.rounded_rectangle([330, BAR_Y + 24, 688, BAR_Y + 118], radius=47, fill=INK)
    tw = d.textlength(CTA, font=latin(27, "Bold"))
    d.text((330 + (358 - tw) / 2, BAR_Y + 53), CTA, font=latin(27, "Bold"), fill=WHITE)

    return img


GAP, MARGIN, HEAD, FOOT = 56, 56, 140, 80
PAGE_W = MARGIN * 2 + W * 3 + GAP * 2
PAGE_H = HEAD + H + FOOT
page = Image.new("RGB", (PAGE_W, PAGE_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 28), ar("موكاب الفيش: النّسخة المصحّحة"), font=arabic(44, bold=True), fill=INK)
pd.text((MARGIN, 86), ar("ورقة بلا حواف دايرة، الاسم تحتو خط، المقاس مسكر، فاصل رمادي اكبر، وتحتو add to cart"),
        font=arabic(24), fill=MUTED)

for i in range(3):
    x = MARGIN + i * (W + GAP)
    page.paste(screen(i), (x, HEAD))
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(205, 205, 205), width=2)

page.save("docs/design/cardproduit/mockup-fiche-v3-25-10.png")
print("ok", page.size)
