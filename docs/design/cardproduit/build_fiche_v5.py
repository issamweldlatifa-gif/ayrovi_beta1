"""
موكاب الفيش — نسخة 5 (25/10/2026).

كل رقم هنا **مقاس** من `Screenshot_20261025_012101` (720×1600 px = 360×800dp):
    الصورة            0 → 942        (471dp)
    الاسم             975 → 1010     خطّ 44px
    خطّ تحت الاسم     1031           عرضو = عرض الكلمة برك
    الثمن             970 → 1001     خطّ 40px، على اليمين (هامش 34px)
    الوصف             1026 → 1079    سطرين، خطّ 30px
    الثمن المشطوب     1046 → 1070    على اليمين
    خطّ رقيق          1122 → 1123    (2px #E8E8E8) على كامل العرض
    ⬜ بلاصة فاضية    1140 → 1343    **فارغة، بلا حتى محتوى**
    سطر Taille        1366 → 1412    خطّ 40px + chevron مقابل
    فاصل رمادي        1440 → 1457    (18px = 9dp)
    الشريط السفلي     1458 → 1600    الثمن يسار + الزرّ 279→703 / 1480→1575

البلاصة الفاضية خلّيناها بيضاء كيما طلب — ما فيها حتى كتابة، حتى إطار، حتى علامة.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (128, 128, 128)
RULE = (232, 232, 232)
STRIKE = (150, 150, 150)
UNDERLINE = (170, 170, 170)
PAGE = (246, 246, 246)
GUIDE = (255, 92, 92)

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
SUB = "Baskets basses — gris clair"
PRICE = "199.00 TND"
COMPARE = "249.00 TND"
COMPARE_LABEL = "Prix conseillé"
CTA = "Ajouter au panier"

# ── القياسات ───────────────────────────────────────────────────────────────
PHOTO_BOTTOM = 942
PAD = 32
NAME_Y = 966
NAME_PX = 44
UNDERLINE_Y = 1031
PRICE_PX = 40
PRICE_Y = 968
DESC_Y = 1040
DESC_PX = 30
RULE_Y = 1122
EMPTY_TOP, EMPTY_BOTTOM = 1140, 1343     # ← فارغة
TAILLE_TOP, TAILLE_BOTTOM = 1366, 1412
BAND_TOP, BAND_BOTTOM = 1440, 1458
BAR_TOP = 1458
BTN = (279, 1480, 703, 1575)


def cover(path, width, height, margin=0.16):
    """الصورة كاملة داخل الإطار، بلون خلفية المرجع — بلا قصّان."""
    im = Image.open(path).convert("RGB")
    inner_w, inner_h = int(width * (1 - margin)), int(height * (1 - margin))
    scale = min(inner_w / im.width, inner_h / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    # لون الإطار = لون خلفية الصورة نفسها ⇒ ما يبانش حتى حدّ
    corner = im.getpixel((2, 2))
    bg = Image.new("RGB", (width, height), corner)
    bg.paste(im, ((width - im.width) // 2, (height - im.height) // 2))
    return bg


def icon_back(d, cx, cy, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=INK, width=w, joint="curve")


def icon_bag(d, cx, cy, w=4):
    r = 20
    d.rounded_rectangle([cx - r, cy - 16, cx + r, cy + 22], radius=6, outline=INK, width=w)
    d.arc([cx - 11, cy - 30, cx + 11, cy - 4], 180, 360, fill=INK, width=w)


def icon_expand(d, cx, cy, w=4):
    a, b = 18, 8
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = cx + sx * a, cy + sy * a
        d.line([(x, y), (x - sx * b, y)], fill=INK, width=w)
        d.line([(x, y), (x, y - sy * b)], fill=INK, width=w)


def icon_ruler(d, x, y):
    d.rounded_rectangle([x, y, x + 22, y + 46], radius=5, outline=INK, width=4)
    for i in range(3):
        yy = y + 11 + i * 12
        d.line([(x + 6, yy), (x + 13, yy)], fill=INK, width=3)


def chevron_down(d, cx, cy, w=4):
    d.line([(cx - 12, cy - 6), (cx, cy + 7), (cx + 12, cy - 6)], fill=INK, width=w, joint="curve")


def screen(index):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # 1. الصورة تنتهي بالضبط على 942، والورقة تبدا من غادي
    img.paste(cover(PHOTOS[index], W, PHOTO_BOTTOM), (0, 0))
    icon_back(d, 48, 112)
    icon_bag(d, 657, 104)

    total, gap, y = 3, 26, PHOTO_BOTTOM - 62
    start = W / 2 - (total - 1) * gap / 2
    for i in range(total):
        x = start + i * gap
        r = 6 if i == index else 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == index else (168, 168, 168))
    icon_expand(d, 660, y)

    # 2. الورقة: بيضاء، بلا حواف دايرة
    d.rectangle([0, PHOTO_BOTTOM, W, H], fill=WHITE)

    # 3. الاسم + خطّ بطول الكلمة
    name_font = latin(NAME_PX)
    d.text((PAD, NAME_Y), NAME, font=name_font, fill=INK)
    nw = d.textlength(NAME, font=name_font)
    d.line([(PAD, UNDERLINE_Y), (PAD + nw, UNDERLINE_Y)], fill=UNDERLINE, width=4)

    # 4. الثمن على اليمين
    price_font = latin(PRICE_PX, "Bold")
    pw = d.textlength(PRICE, font=price_font)
    d.text((W - 34 - pw, PRICE_Y), PRICE, font=price_font, fill=INK)

    # 5. الوصف (يسار، يتلفّف) + الثمن المشطوب (يمين)
    desc_font = latin(DESC_PX)
    lab_font = latin(26)
    cmp_font = latin(26)
    lab_w = d.textlength(COMPARE_LABEL, font=lab_font)
    cmp_w = d.textlength(COMPARE, font=cmp_font)
    right = W - 34
    d.text((right - cmp_w, DESC_Y + 22), COMPARE, font=cmp_font, fill=STRIKE)
    d.line([(right - cmp_w, DESC_Y + 46), (right, DESC_Y + 46)], fill=STRIKE, width=3)
    d.text((right - cmp_w - 10 - lab_w, DESC_Y + 22), COMPARE_LABEL, font=lab_font, fill=MUTED)

    left_limit = right - cmp_w - 10 - lab_w - 14
    words, line, lines = SUB.split(), '', []
    for word in words:
        trial = (line + ' ' + word).strip()
        if d.textlength(trial, font=desc_font) <= left_limit - PAD or not line:
            line = trial
        else:
            lines.append(line); line = word
    lines.append(line)
    for i, text_line in enumerate(lines[:2]):
        d.text((PAD, DESC_Y + i * 32), text_line, font=desc_font, fill=MUTED)

    # 6. الخطّ الرقيق
    d.line([(0, RULE_Y), (W, RULE_Y + 1)], fill=RULE, width=2)

    # 7. ⬜ البلاصة الفاضية: ما نحطّو فيها حتى حاجة (1140 → 1343)
    #    (ما فماش حتى رسم هنا — هذا هو المطلوب)

    # 8. سطر Taille
    icon_ruler(d, PAD, TAILLE_TOP - 2)
    d.text((PAD + 42, TAILLE_TOP - 8), "Taille", font=latin(40, "Bold"), fill=INK)
    chevron_down(d, W - PAD - 16, (TAILLE_TOP + TAILLE_BOTTOM) // 2)

    # 9. الفاصل الرمادي
    d.rectangle([0, BAND_TOP, W, BAND_BOTTOM], fill=RULE)

    # 10. الشريط السفلي: الثمن يسار + الزرّ بنفس مقاس المرجع
    d.rectangle([0, BAR_TOP, W, H], fill=WHITE)
    bar_price = latin(30, "Bold")
    bpw = d.textlength(PRICE, font=bar_price)
    d.text((PAD, (BTN[1] + BTN[3]) / 2 - 20), PRICE, font=bar_price, fill=INK)
    assert PAD + bpw < BTN[0] - 6
    d.rounded_rectangle(list(BTN), radius=47, fill=INK)
    tw = d.textlength(CTA, font=latin(30, "Bold"))
    d.text(((BTN[0] + BTN[2]) / 2 - tw / 2, BTN[1] + 30), CTA, font=latin(30, "Bold"), fill=WHITE)

    return img


# ── ورقة المقارنة: المرجع (يسار) × الموكاب (يمين) مع نفس الخطوط ─────────────
REF = "/tmp/arena-coding-uploads/Screenshot_20261025_012101_com.gbox.android.jpg"
ref = Image.open(REF).convert("RGB").resize((W, H), Image.LANCZOS)
mine = screen(0)

MARGIN, GAP, HEAD, FOOT = 56, 60, 120, 60
sheet_w = MARGIN * 2 + W * 2 + GAP
sheet_h = HEAD + H + FOOT
page = Image.new("RGB", (sheet_w, sheet_h), PAGE)
pd = ImageDraw.Draw(page)

page.paste(ref, (MARGIN, HEAD))
page.paste(mine, (MARGIN + W + GAP, HEAD))

marks = [
    (PHOTO_BOTTOM, "942  نهاية الصورة"),
    (RULE_Y, "1122  خطّ رقيق"),
    (EMPTY_TOP, "1140  بداية البلاصة الفاضية"),
    (EMPTY_BOTTOM, "1343  نهاية البلاصة"),
    (TAILLE_TOP, "1366  Taille"),
    (BAND_TOP, "1440  فاصل رمادي"),
    (BAR_TOP, "1458  الشريط"),
    (BTN[1], "1480  الزرّ"),
]
for y, label in marks:
    pd.line([(MARGIN - 14, HEAD + y), (MARGIN + W * 2 + GAP + 14, HEAD + y)], fill=GUIDE, width=1)
    pd.text((MARGIN - 34, HEAD + y - 22), label.split()[0], font=latin(17, "Bold"), fill=GUIDE)

pd.text((MARGIN, 24), ar("مقارنة الابعاد"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 74), ar("على اليسار المرجع، على اليمين الموكاب الجديد، والارقام على الخطوط هي نفسها في الزوز"),
        font=arabic(22), fill=MUTED)
pd.rectangle([MARGIN, HEAD, MARGIN + W, HEAD + H], outline=(200, 200, 200), width=2)
pd.rectangle([MARGIN + W + GAP, HEAD, MARGIN + W + GAP + W, HEAD + H], outline=(200, 200, 200), width=2)

page.save("docs/design/cardproduit/comparaison-v5-25-10.png")
mine.save("docs/design/cardproduit/apercu-ecran-v5-25-10.png")
print("ok", page.size)
