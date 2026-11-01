"""
موكاب الفيش — نسخة 4 (25/10/2026). مبني على **قياس** سكرين شوت المرجع.

القياسات مأخوذة بالبكسل من `Screenshot_20261025_012101` (720×1600 = 360×800dp، 1dp = 2px):

    الصورة          0 → 942 px   (471dp)
    الورقة          942 px       (بلا حواف دايرة)
    الاسم           975 → 1010   (font 44px)
    خط تحت الاسم    1030         (عرض الكلمة بالضبط، 4px رمادي)
    الثمن           970 → 1001   (font 40px، على اليمين)
    الوصف القصير    1026 → 1079  (يسار) · الثمن المشطوب (يمين)
    خط رقيق         1122         (2px، على كامل العرض)
    سطر Taille      1366 → 1412
    خط رقيق         1440         (2px)
    فاصل رمادي      1440 → 1458  (9dp — أكبر من الخطين)
    الشريط السفلي   1458 → 1600  (الزرّ الأسود وحده، بلا ثمن)

البلاصة 1140 → 1344 هي بلوك المرجع (توصية المقاس) — ما عندناش داتا متاعها،
خلّيناها **علامة** مخصّصة للي باش تقلّي عليه، موش محتوى مخترع.
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
UNDERLINE = (165, 165, 165)
PAGE = (246, 246, 246)
DASH = (226, 226, 226)

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

SHEET = 942          # بداية الورقة = نهاية الصورة
PAD = 32
NAME_Y = 966
RULE1 = 1122
SLOT_TOP, SLOT_BOTTOM = 1140, 1344     # بلاصة بلوك المرجع
TAILLE_TOP, TAILLE_BOTTOM = 1344, 1440
RULE2 = 1440
BAND_BOTTOM = 1458
BAR = 1458


def cover(path, width, height, zoom=1.0):
    im = Image.open(path).convert("RGB")
    scale = max(width / im.width, height / im.height) * zoom
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


def chevron_down(d, cx, cy, color=INK, w=4):
    d.line([(cx - 12, cy - 6), (cx, cy + 7), (cx + 12, cy - 6)], fill=color, width=w, joint="curve")


def screen(index):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # ── الصورة: 471dp، من فوق حتى الورقة، بلا فراغ ────────────────────────────
    img.paste(cover(PHOTOS[index], W, SHEET), (0, 0))
    icon_back(d, 48, 112)
    icon_bag(d, 668, 112)
    total, gap, y = 3, 26, SHEET - 62
    start = W / 2 - (total - 1) * gap / 2
    for i in range(total):
        x = start + i * gap
        r = 6 if i == index else 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == index else (168, 168, 168))
    icon_expand(d, 660, y)

    # ── الورقة: زاوية قائمة ────────────────────────────────────────────────────
    d.rectangle([0, SHEET, W, H], fill=WHITE)

    # الاسم + خط بطول الكلمة بالضبط
    name_font = latin(44, "Bold")
    d.text((PAD, NAME_Y), NAME, font=name_font, fill=INK)
    nw = d.textlength(NAME, font=name_font)
    d.line([(PAD, 1030), (PAD + nw, 1030)], fill=UNDERLINE, width=4)

    # الثمن على اليمين
    price_font = latin(40, "Bold")
    pw = d.textlength(PRICE, font=price_font)
    d.text((W - PAD - pw, NAME_Y + 4), PRICE, font=price_font, fill=INK)

    # الوصف تحت الخط (يسار) · الثمن المشطوب (يمين)
    lab_font, cmp_font = latin(26), latin(26)
    lab = COMPARE_LABEL
    lab_w = d.textlength(lab, font=lab_font)
    cmp_w = d.textlength(COMPARE, font=cmp_font)
    right = W - PAD
    d.text((right - cmp_w, 1046), COMPARE, font=cmp_font, fill=STRIKE)
    d.line([(right - cmp_w, 1070), (right, 1070)], fill=STRIKE, width=3)
    d.text((right - cmp_w - 10 - lab_w, 1046), lab, font=lab_font, fill=MUTED)

    # الوصف: يتلفّف على سطرين داخل العمود الأيسر فقط، ما يلمسش عمود الثمن
    sub_font = latin(28)
    left_limit = right - cmp_w - 10 - lab_w - 16
    words, line, lines = SUB.split(), '', []
    for word in words:
        trial = (line + ' ' + word).strip()
        if d.textlength(trial, font=sub_font) <= left_limit - PAD or not line:
            line = trial
        else:
            lines.append(line); line = word
    lines.append(line)
    for i, text_line in enumerate(lines[:2]):
        d.text((PAD, 1042 + i * 34), text_line, font=sub_font, fill=MUTED)

    # خط رقيق على كامل العرض
    d.line([(0, RULE1), (W, RULE1)], fill=RULE, width=2)

    # ── بلاصة بلوك المرجع: علامة فقط، ماشي محتوى مخترع ───────────────────────
    d.rounded_rectangle([PAD, SLOT_TOP, W - PAD, SLOT_BOTTOM], radius=14, outline=DASH, width=3)
    hint = ar("بلاصة فاضية: قلّي شنو نحطّ فيها")
    hw = d.textlength(hint, font=arabic(24))
    d.text(((W - hw) / 2, (SLOT_TOP + SLOT_BOTTOM) / 2 - 16), hint, font=arabic(24), fill=(176, 176, 176))

    # ── سطر Taille: نفس الحجم، والزرّ مقابل ───────────────────────────────────
    cy = (TAILLE_TOP + TAILLE_BOTTOM) / 2
    icon_ruler(d, PAD, int(cy - 21))
    d.text((PAD + 42, int(cy - 23)), "Taille", font=latin(40, "Bold"), fill=INK)
    chevron_down(d, W - PAD - 16, int(cy))

    # خط رقيق + الفاصل الرمادي الأكبر
    d.line([(0, RULE2), (W, RULE2)], fill=RULE, width=2)
    d.rectangle([0, RULE2 + 2, W, BAND_BOTTOM], fill=RULE)

    # ── الشريط السفلي: الزرّ وحده، بلا ثمن ────────────────────────────────────
    d.rectangle([0, BAR, W, H], fill=WHITE)
    d.rounded_rectangle([PAD, BAR + 24, W - PAD, BAR + 120], radius=48, fill=INK)
    tw = d.textlength(CTA, font=latin(30, "Bold"))
    d.text(((W - tw) / 2, BAR + 54), CTA, font=latin(30, "Bold"), fill=WHITE)

    return img


GAP, MARGIN, HEAD, FOOT = 56, 56, 132, 76
PAGE_W = MARGIN * 2 + W * 3 + GAP * 2
PAGE_H = HEAD + H + FOOT
page = Image.new("RGB", (PAGE_W, PAGE_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("موكاب الفيش: نسخة 4، على قياس المرجع"), font=arabic(42, bold=True), fill=INK)
pd.text((MARGIN, 82), ar("بلا ثمن في الشريط · الخط بطول الكلمة · الصورة 471dp · فاصل رمادي · بلا حواف"),
        font=arabic(24), fill=MUTED)

for i in range(3):
    x = MARGIN + i * (W + GAP)
    page.paste(screen(i), (x, HEAD))
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(205, 205, 205), width=2)

page.save("docs/design/cardproduit/mockup-fiche-v4-25-10.png")
screen(0).save("docs/design/cardproduit/apercu-ecran-v4-25-10.png")
print("ok", page.size)
