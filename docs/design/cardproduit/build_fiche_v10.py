"""
موكاب الفيش — نسخة 10 (25/10/2026): «Taille» كي ما فماش توصية مقاس.

المرجع: `Screenshot_20261025_022307` (منتوج بلا مقاسات متعدّدة).
القياسات المقيسة (720×1600 = 360×800dp):

    الصورة            0 → 1162     (581dp — الصورة تاخذ 73% من الشاشة)
    الاسم             1195 → 1249  (خطّ 44px)
    خطّ تحت الاسم     1249         (يمتد على عمود الاسم كامل 37→406)
    الثمن             1190 → 1249  (528→686)
    الوصف             1250 → 1314  (سطرين)
    الثمن المشطوب     1250 → 1325  (يمين)
    شارة P Points     1382 → 1399  (504→618)
    سطر Taille        1376 → 1406  (46→618: أيقونة + «Taille 12» + «Disponible en taille unique»)
    خطّ رقيق          1342         (2px)
    فاصل رمادي        1440 → 1458  (9dp)
    الشريط            1458 → 1600  (عدّاد يسار + زرّ 290→703 / 1480→1575)

الفرق على النسخة 6: **ما فماش بلوك لافندر للتوصية** كي ما فماش مقاسات متعدّدة،
و«Taille» تولّي معلومة (وحدة واحدة) موش زرّ يفتح ورقة.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (128, 128, 128)
HAIR = (232, 232, 232)
STRIKE = (150, 150, 150)
UNDERLINE = (170, 170, 170)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

PHOTO = "docs/design/cardproduit/photos/01-trois-quarts.webp"
BRAND = "Sneaker Co."
NAME = "Sneaker Low-Top"
SUB = "Baskets basses — gris clair"
PRICE = "199.00 TND"
COMPARE = "249.00 TND"
COMPARE_LABEL = "Prix conseillé"
SIZE_LINE = ("Taille 42", "Disponible en taille unique")
CTA = "Ajouter au panier"

PAD = 32
PHOTO_BOTTOM = 1162
NAME_Y = 1186
UNDERLINE_Y = 1249
RULE_Y = 1342
TAILLE_TOP, TAILLE_BOTTOM = 1376, 1440
BAND_TOP, BAND_BOTTOM = 1440, 1458
BTN = (290, 1480, 703, 1575)


def cover(path, w, h, margin=0.10):
    im = Image.open(path).convert("RGB")
    scale = min(int(w * (1 - margin)) / im.width, int(h * (1 - margin)) / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    bg = Image.new("RGB", (w, h), im.getpixel((2, 2)))
    bg.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return bg


def i_back(d, cx, cy, w=5):
    d.line([(cx + 12, cy - 20), (cx - 12, cy), (cx + 12, cy + 20)], fill=INK, width=w, joint="curve")


def i_bag(d, cx, cy, w=4):
    r = 20
    d.rounded_rectangle([cx - r, cy - 16, cx + r, cy + 22], radius=6, outline=INK, width=w)
    d.arc([cx - 11, cy - 30, cx + 11, cy - 4], 180, 360, fill=INK, width=w)


def i_ruler(d, x, y):
    d.rounded_rectangle([x, y, x + 26, y + 48], radius=6, outline=INK, width=4)
    for i in range(3):
        yy = y + 12 + i * 12
        d.line([(x + 7, yy), (x + 16, yy)], fill=INK, width=4)


def i_check(d, cx, cy, color=(10, 10, 10), w=4):
    d.line([(cx - 9, cy), (cx - 2, cy + 8), (cx + 10, cy - 9)], fill=color, width=w, joint="curve")


img = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(img)

# 1. الصورة الكبيرة
img.paste(cover(PHOTO, W, PHOTO_BOTTOM, margin=0.14), (0, 0))
i_back(d, 48, 112)
i_bag(d, 657, 104)

# نقاط الگاليري (2)
y = PHOTO_BOTTOM - 56
for i in range(2):
    x = W / 2 - 13 + i * 26
    r = 6 if i == 0 else 5
    d.ellipse([x - r, y - r, x + r, y + r], fill=INK if i == 0 else (168, 168, 168))

# 2. سطر الاسم
name_font = latin(44)
d.text((PAD, NAME_Y), NAME, font=name_font, fill=INK)
d.line([(PAD, UNDERLINE_Y), (PAD + (W - PAD * 2) * 0.56, UNDERLINE_Y)], fill=UNDERLINE, width=4)

price_font = latin(40, "Bold")
pw = d.textlength(PRICE, font=price_font)
d.text((W - 34 - pw, NAME_Y - 4), PRICE, font=price_font, fill=INK)

# 3. الوصف + الثمن المشطوب
desc_font = latin(30)
lab_font, cmp_font = latin(26), latin(26)
lab = COMPARE_LABEL
lab_w = d.textlength(lab, font=lab_font)
cmp_w = d.textlength(COMPARE, font=cmp_font)
right = W - 34
d.text((right - cmp_w, 1258), COMPARE, font=cmp_font, fill=STRIKE)
d.line([(right - cmp_w, 1284), (right, 1284)], fill=STRIKE, width=3)
d.text((right - cmp_w - 10 - lab_w, 1258), lab, font=lab_font, fill=MUTED)

# الوصف: يتلفّف على سطرين داخل العمود الأيسر
left_limit = right - cmp_w - 10 - lab_w - 16
words, line, lines = SUB.split(), '', []
for word in words:
    trial = (line + ' ' + word).strip()
    if d.textlength(trial, font=desc_font) <= left_limit - PAD or not line:
        line = trial
    else:
        lines.append(line); line = word
lines.append(line)
for i, tl in enumerate(lines[:2]):
    d.text((PAD, 1256 + i * 34), tl, font=desc_font, fill=MUTED)

# 4. شارة P Points (البلاصة، بلا داتا عندنا)
badge_x0, badge_x1 = 566, 687
d.rounded_rectangle([badge_x0, 1291, badge_x1, 1325], radius=17, outline=INK, width=3)
d.ellipse([badge_x0 + 14, 1300, badge_x0 + 30, 1316], outline=INK, width=2)
d.text((badge_x0 + 40, 1298), "Points", font=latin(22), fill=INK)

# 5. خطّ رقيق
d.line([(0, RULE_Y), (W, RULE_Y + 2)], fill=HAIR, width=2)

# 6. سطر Taille (معلومة، موش زرّ — ما فماش ورقة كي المقاس وحدة)
cy = (TAILLE_TOP + TAILLE_BOTTOM) // 2
i_ruler(d, 46, cy - 24)
d.text((114, cy - 26), SIZE_LINE[0], font=latin(36, "Bold"), fill=INK)
d.text((272, cy - 22), SIZE_LINE[1], font=latin(30), fill=MUTED)

# 7. الفاصل الرمادي + الشريط
d.rectangle([0, BAND_TOP, W, BAND_BOTTOM], fill=HAIR)
d.text((PAD - 14, 1496), "Se termine dans", font=latin(28), fill=MUTED)
d.text((PAD - 14, 1536), "1 j   21 h   36 m", font=latin(30, "Bold"), fill=INK)
d.rounded_rectangle(list(BTN), radius=47, fill=INK)
tw = d.textlength(CTA, font=latin(30, "Bold"))
d.text(((BTN[0] + BTN[2]) / 2 - tw / 2, BTN[1] + 30), CTA, font=latin(30, "Bold"), fill=WHITE)

img.save("docs/design/cardproduit/apercu-ecran-v10-25-10.png")

# لوحة مقارنة
ref = Image.open("/tmp/arena-coding-uploads/Screenshot_20261025_022307_com.gbox.android.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
MARGIN, GAP, HEAD, FOOT_H = 56, 60, 120, 60
page = Image.new("RGB", (MARGIN * 2 + W * 2 + GAP, HEAD + H + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("نسخة بدون توصية المقاس"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 74), ar("يسار المرجع، يمين الموكاب: المقاس وحدة واحدة، بلا ورقة، وبلا بلوك توصية"),
        font=arabic(22), fill=MUTED)
page.paste(ref, (MARGIN, HEAD))
page.paste(img, (MARGIN + W + GAP, HEAD))
for x in (MARGIN, MARGIN + W + GAP):
    pd.rectangle([x, HEAD, x + W, HEAD + H], outline=(200, 200, 200), width=2)
page.save("docs/design/cardproduit/comparaison-v10-25-10.png")
print("ok", page.size)
