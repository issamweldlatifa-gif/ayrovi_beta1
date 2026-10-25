"""
موكاب «دليل المقاسات» — الصفحة اللي تتحلّ كي تدقّ على
«Obtenir une recommandation» في الفيش (25/10/2026).

القياسات مأخوذة بالبكسل من صور المرجع (720×1600 = 360×800dp):
    شريط العنوان   0 → 224   (سهم + اسم المنتوج على 3 سطور + خطّ فاصل)
    H1             250 → 300 (خطّ 46px عريض)
    فقرة الشرح     320 → 510 (30px، 5 سطور)
    H2 الجدول      640
    سطر العناوين   690 → 730 (30px)
    سطر الجدول     74px، تخطيط مخطّط (#EDEDED / أبيض)
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (17, 17, 17)
MUTED = (110, 110, 110)
ZEBRA = (237, 237, 237)
RULE = (220, 220, 220)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

# ── الداتا: نفس جدول المرجع (FR / UE / IT / UK / US) ─────────────────────────
CONVERSION = [
    ("38.5", "38.5", "38.5", "5.5", "6"), ("39", "39", "39", "6", "6.5"),
    ("40", "40", "40", "6", "7"), ("40.5", "40.5", "40.5", "6.5", "7.5"),
    ("41", "41", "41", "7", "8"), ("42", "42", "42", "7.5", "8.5"),
    ("42.5", "42.5", "42.5", "8", "9"), ("43", "43", "43", "8.5", "9.5"),
    ("44", "44", "44", "9", "10"), ("44.5", "44.5", "44.5", "9.5", "10.5"),
    ("45", "45", "45", "10", "11"), ("45.5", "45.5", "45.5", "10.5", "11.5"),
    ("46", "46", "46", "11", "12"), ("47", "47", "47", "11.5", "12.5"),
    ("47.5", "47.5", "47.5", "12", "13"), ("48", "48", "48", "12.5", "13.5"),
    ("48.5", "48.5", "48.5", "13", "14"), ("49", "49", "49", "13.5", "14.5"),
    ("49.5", "49.5", "49.5", "14", "15"),
]
FOOT = [
    ("38.5", "38.5", "23.7"), ("39", "39", "24.1"), ("40", "40", "24.5"),
    ("40.5", "40.5", "25"), ("41", "41", "25.4"), ("42", "42", "25.8"),
    ("42.5", "42.5", "26.2"), ("43", "43", "26.7"), ("44", "44", "27.1"),
    ("44.5", "44.5", "27.5"), ("45", "45", "27.9"), ("45.5", "45.5", "28.3"),
    ("46", "46", "28.8"), ("47", "47", "29.2"), ("47.5", "47.5", "29.6"),
    ("48", "48", "30"), ("48.5", "48.5", "30.5"), ("49", "49", "30.9"),
    ("49.5", "49.5", "31.3"),
]

TITLE = "Sneaker Low-Top"          # اسم المنتوج في شريط العنوان
INTRO = ("Trouvez la bonne taille dans différents pays grâce au guide de "
         "Sneaker Low-Top. Les tailles et les mensurations pouvant varier "
         "selon les coupes et les collections, ce guide n'est proposé qu'à "
         "titre indicatif.")

PAD = 32
HEADER_H = 224
RULE_Y = 218


def icon_back(d, cx, cy, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=INK, width=w, joint="curve")


def wrap(d, text, font, width):
    words, line, out = text.split(), "", []
    for word in words:
        trial = (line + " " + word).strip()
        if d.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            out.append(line)
            line = word
    out.append(line)
    return out


def header(d, lines=3):
    """شريط العنوان: سهم + اسم المنتوج (سطور مقصوصة) + خطّ فاصل."""
    icon_back(d, 48, 112)
    font = latin(38)
    wrapped = wrap(d, TITLE, font, W - 150)[:lines]
    y = 62 if len(wrapped) > 1 else 92
    for i, line in enumerate(wrapped):
        d.text((118, y + i * 46), line, font=font, fill=INK)
    d.line([(0, RULE_Y), (W, RULE_Y + 3)], fill=RULE, width=3)


def zebra_table(d, y, headers, rows, col_x, row_h=74, font_size=30, header_size=30):
    """جدول بلا خطوط عمودية: سطر عناوين + صفوف مخطّطة."""
    hfont = latin(header_size, "SemiBold")
    for label, x in zip(headers, col_x):
        d.text((x, y), label, font=hfont, fill=INK)
    y += row_h - 14
    font = latin(font_size)
    for i, row in enumerate(rows):
        if i % 2 == 0:
            d.rectangle([PAD, y, W - PAD, y + row_h], fill=ZEBRA)
        for value, x in zip(row, col_x):
            tw = d.textlength(value, font=font)
            d.text((x, y + row_h / 2 - 20), value, font=font, fill=INK) if False else None
            d.text((x, y + row_h / 2 - 19), value, font=font, fill=INK)
        y += row_h
    return y


def screen_top():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    header(d)

    # H1
    d.text((PAD, 248), "Guide des tailles", font=latin(46, "Bold"), fill=INK)

    # فقرة الشرح
    y = 322
    for line in wrap(d, INTRO, latin(29), W - PAD * 2):
        d.text((PAD, y), line, font=latin(29), fill=INK)
        y += 40

    # H2 + الجدول
    d.text((PAD, 638), "Tableau de conversion des tailles", font=latin(28, "Bold"), fill=INK)
    col_x = [70, 200, 322, 462, 592]
    zebra_table(d, 692, ["FR", "UE", "IT", "UK", "US"], CONVERSION[:8], col_x)
    return img


def screen_scrolled():
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    header(d)
    # نكمّلو الجدول من السطر 12 (بعد التمرير)
    y = 232
    col_x = [70, 200, 322, 462, 592]
    font = latin(30)
    for i, row in enumerate(CONVERSION[11:]):
        if i % 2 == 0:
            d.rectangle([PAD, y, W - PAD, y + 74], fill=ZEBRA)
        for value, x in zip(row, col_x):
            d.text((x, y + 18), value, font=font, fill=INK)
        y += 74

    # Mensurations
    y += 60
    d.text((PAD, y), "Mensurations", font=latin(28, "Bold"), fill=INK)
    y += 54
    cols = [108, 330, 470]
    d.text((cols[0], y + 8), "FR", font=latin(30, "SemiBold"), fill=INK)
    d.text((cols[1], y + 8), "UE", font=latin(30, "SemiBold"), fill=INK)
    d.text((cols[2], y + 8), "Longueur du", font=latin(28, "SemiBold"), fill=INK)
    d.text((cols[2] + 8, y + 44), "pied", font=latin(28, "SemiBold"), fill=INK)
    y += 96
    for i, row in enumerate(FOOT[:13]):
        if i % 2 == 0:
            d.rectangle([PAD, y, W - PAD, y + 74], fill=ZEBRA)
        for value, x in zip(row, cols):
            d.text((x + 16, y + 18), value, font=font, fill=INK)
        y += 74
    return img


top, scrolled = screen_top(), screen_scrolled()

GAP, MARGIN, HEAD, FOOT_H = 56, 56, 132, 64
page = Image.new("RGB", (MARGIN * 2 + W * 2 + GAP, HEAD + H + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("دليل المقاسات: الصفحة اللي تتحل كي تدق على الرابط"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 78), ar("يسار: فوق الصفحة، يمين: نفس الصفحة بعد التمرير (جدول القياس)"), font=arabic(22), fill=MUTED)

for i, shot in enumerate((top, scrolled)):
    x = MARGIN + i * (W + GAP)
    page.paste(shot, (x, HEAD))
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(200, 200, 200), width=2)

page.save("docs/design/cardproduit/guide-tailles-v7-25-10.png")
top.save("docs/design/cardproduit/guide-tailles-haut-25-10.png")
print("ok", page.size)
