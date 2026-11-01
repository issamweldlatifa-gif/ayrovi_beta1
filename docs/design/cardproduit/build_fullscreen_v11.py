"""
موكاب: الصورة كاملة الشاشة (full screen) — 25/10/2026.

المرجع: `Screenshot_20261025_022534` (720×1600 = 360×800dp). القياسات المقيسة:

    الشريط الأبيض فوق      0 → 280
      زرّ الغلق (X)        37→69 × 82→114   (خطّ 5px)
    منطقة الصورة          280 → 1320       (خلفية #EFEFEF، 520dp)
    الشريط الأبيض تحت      1320 → 1600
    نقاط الگاليري         1516 → 1527      (8 نقط، قطر 12px، كل 24px، 270→449)

السلوك: الصورة **تتمرّر** (سحب أفقي)، زرّ الغلق (X) فيك سو، والنقاط تتبدّل.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
PHOTO_BG = (239, 239, 239)
DOT_OFF = (178, 178, 178)
DOT_ON = (10, 10, 10)
MUTED = (128, 128, 128)
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
    "docs/design/cardproduit/photos/04-rouge.png",
]

TOP, BOTTOM = 280, 1320
DOTS_Y = 1516


def i_close(d, cx, cy, size=16, w=5):
    d.line([(cx - size, cy - size), (cx + size, cy + size)], fill=INK, width=w)
    d.line([(cx + size, cy - size), (cx - size, cy + size)], fill=INK, width=w)


def contain(path, w, h, margin=0.10):
    """الصورة كاملة داخل الإطار (بلا قصّان)، والخلفية = لون الصورة نفسه
    (ما يبانش حتى حدّ/مستطيل داخل المستطيل)."""
    im = Image.open(path).convert("RGB")
    scale = min(int(w * (1 - margin)) / im.width, int(h * (1 - margin)) / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    bg = Image.new("RGB", (w, h), im.getpixel((2, 2)))
    bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return bg


def screen(index):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)

    # الصورة في الوسط
    img.paste(contain(PHOTOS[index], W, BOTTOM - TOP), (0, TOP))

    # زرّ الغلق
    i_close(d, 53, 98)

    # النقاط: 8، قطر 12px، كل 24px، من 270 إلى 449
    count = len(PHOTOS) * 2          # 8 نقاط كيما المرجع
    for i in range(count):
        cx = 270 + i * 24 + 6
        active = i == index * 2 + 1 if index < 2 else i == 3
        d.ellipse([cx - 6, DOTS_Y - 6, cx + 6, DOTS_Y + 6], fill=DOT_ON if active else DOT_OFF)

    return img


GAP, MARGIN, HEAD, FOOT_H = 56, 56, 120, 60
page = Image.new("RGB", (MARGIN * 2 + W * 2 + GAP, HEAD + H + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("الصورة كاملة الشاشة"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 74), ar("زرّ الغلق فوق يسار، الصورة تتمرر، والنقاط تحت تتبدّل"),
        font=arabic(22), fill=MUTED)

for i in range(2):
    shot = screen(i)
    x = MARGIN + i * (W + GAP)
    page.paste(shot, (x, HEAD))
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(200, 200, 200), width=2)

page.save("docs/design/cardproduit/fullscreen-v11-25-10.png")
screen(0).save("docs/design/cardproduit/apercu-fullscreen-25-10.png")
print("ok", page.size)
