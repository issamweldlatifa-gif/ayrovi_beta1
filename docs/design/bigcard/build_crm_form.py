#!/usr/bin/env python3
"""
CRM — la FICHE PRODUIT en un seul endroit (proposition, 24/10/2026).

Ce que le propriétaire demande : que TOUT ce qui alimente les cartes (Reel,
Story, Publication, grande fiche) se remplisse **d'une seule place** dans le
CRM — produit + catégorie + médias (images ET vidéo) + description + variantes,
avec des champs qui **changent selon le type** (vêtement → taille, chaussure →
pointure, électronique → capacité) et des champs qui **se remplissent seuls**.

Ce que le code a DÉJÀ (vérifié, pas supposé) :
  • `products` : name, description, image, additional_images, brand_id/brand_name,
    category, source_url, prix (original/converti/douane/port/service/final),
    stock_status, status, product_code, slug, category_id, product_type.        [P2.1]
  • `catalogue_categories` : arbre `parent_id` + `sort_order` (aucun nom en dur). [P2.1]
  • `catalogue_variants` : SKU par variante.                                     [P2.1]
  • `catalogue_media` : **IMAGE / VIDEO / DOCUMENT**, `sort_order`, `is_primary`,
    `variant_id` — donc « photos + vidéo dans la même fiche » est déjà possible.  [P2.1]
  • `catalogue_attributes` + `catalogue_attribute_values` : clé, libellé, type
    (TEXT / NUMBER / BOOLEAN / SELECT), `applies_to` product|variant, options.    [P2.1]
  • `mediaUpload.ts` accepte déjà les vidéos (10 Mo max) et les images (4 Mo).

Ce qui MANQUE pour que ce soit utilisable :
  • un écran unique avec onglets (aujourd'hui : 4 pages séparées + un formulaire
    média qui n'accepte qu'une URL collée) ;
  • la **famille** qui pilote les champs (`product_type` ne vaut que
    STANDARD | BUNDLE aujourd'hui) et la liste d'attributs obligatoires ;
  • les catégories internationales semées **en données** ;
  • le bloc « aperçu de la carte » dans le formulaire.

Usage : python3 docs/design/bigcard/build_crm_form.py
Sortie : docs/design/bigcard/crm-product-form-24-10.png (+ .jpg)
"""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/design/bigcard"
ASSETS = ROOT / "docs/design/reel/assets"

INK = (16, 16, 16)
MUT = (124, 124, 124)
FAINT = (168, 168, 168)
LINE = (226, 226, 226)
PALE = (245, 245, 245)
WHITE = (255, 255, 255)
GREEN = (11, 122, 64)
AMBER = (176, 110, 10)
VIOLET = (87, 30, 246)
RED = (200, 24, 40)

AR_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
AR_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BRAND_R = ROOT / "assets/fonts/ZalandoSans-Regular.ttf"
BRAND_B = ROOT / "assets/fonts/ZalandoSans-Bold.ttf"


def F(s, bold=False):
    return ImageFont.truetype(AR_B if bold else AR_R, int(round(s)))


def B(s, bold=False):
    return ImageFont.truetype(str(BRAND_B if bold else BRAND_R), int(round(s)))


def ar(text):
    return get_display(arabic_reshaper.reshape(text))


import re as _re
ARABIC = _re.compile(r"[\u0600-\u06FF]")


def any_font(text, size, bold=False):
    """Choisit la police qui contient réellement les glyphes du texte."""
    return F(size, bold) if ARABIC.search(text) else B(size, bold)


def draw_any(xy, text, size, fill=INK, bold=False, anchor="la"):
    """Écrit un texte mixte sans jamais produire de carrés vides."""
    d.text(xy, ar(text) if ARABIC.search(text) else text, font=any_font(text, size, bold), fill=fill, anchor=anchor)


def cover(im, w, h):
    scale = max(w / im.width, h / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


JACKET = Image.open(ASSETS / "p-jacket.jpg").convert("RGB")
KNIT = Image.open(ASSETS / "p-knit.jpg").convert("RGB")
TROUSERS = Image.open(ASSETS / "p-trousers.jpg").convert("RGB")
JUMPSUIT = Image.open(ASSETS / "p-jumpsuit.jpg").convert("RGB")

W, H = 2140, 1180 + 470
canvas = Image.new("RGB", (W, H), (241, 241, 241))
d = ImageDraw.Draw(canvas)


def t(xy, text, size=15, fill=INK, bold=False, anchor="ra"):
    d.text(xy, ar(text), font=F(size, bold), fill=fill, anchor=anchor)


def latin(xy, text, size=14, fill=INK, bold=False, anchor="la"):
    d.text(xy, text, font=B(size, bold), fill=fill, anchor=anchor)


def panel(x, y, w, h, title, subtitle=""):
    d.rounded_rectangle((x, y, x + w, y + h), radius=18, fill=WHITE, outline=LINE)
    t((x + w - 22, y + 16), title, size=20, bold=True)
    if subtitle:
        t((x + w - 22, y + 44), subtitle, size=12, fill=MUT)
    return y + (76 if subtitle else 62)


def field(x, y, w, label, value, hint="", height=38, kind="text"):
    t((x + w - 6, y), label, size=12, fill=MUT)
    d.rounded_rectangle((x, y + 20, x + w, y + 20 + height), radius=9, fill=PALE if kind == "ro" else WHITE,
                        outline=LINE, width=1)
    if kind == "select":
        draw_any((x + 12, y + 20 + height / 2), value, 13, INK, anchor="lm")
        d.line((x + w - 26, y + 20 + height / 2 - 3, x + w - 20, y + 20 + height / 2 + 3), fill=INK, width=2)
        d.line((x + w - 20, y + 20 + height / 2 + 3, x + w - 14, y + 20 + height / 2 - 3), fill=INK, width=2)
    elif kind == "ro":
        draw_any((x + 12, y + 20 + height / 2), value, 13, MUT, anchor="lm")
        d.text((x + w - 12, y + 20 + height / 2), "auto", font=F(10), fill=GREEN, anchor="rm")
    else:
        draw_any((x + 12, y + 20 + height / 2), value, 13, INK, anchor="lm")
    if hint:
        t((x + w - 6, y + 24 + height), hint, size=10, fill=FAINT)
    return y + 20 + height + (26 if hint else 14)


def chips(x, y, w, items, colour=INK):
    cx = x + w
    for label in items:
        tw = d.textlength(ar(label), font=F(11)) + 22
        d.rounded_rectangle((cx - tw, y, cx, y + 26), radius=8, fill=PALE, outline=LINE)
        t((cx - 11, y + 13), label, size=11, anchor="rm", fill=colour)
        cx -= tw + 6
    return y + 38


# ═══════════════════════════ 1 · le formulaire ══════════════════════════════
FX, FY, FW, FH = 40, 128, 760, 900
y = panel(FX, FY, FW, FH, "1 · المنتوج — شاشة وحدة", "الهوية · السعر · الخصائص · الوصف · النشر")

# rail d'onglets
tabs = ["الهوية", "الوسائط", "المتغيّرات", "الخصائص", "الوصف", "النشر"]
tx = FX + FW - 22
for index, name in enumerate(tabs):
    tw = d.textlength(ar(name), font=F(12, index == 0)) + 26
    fill = INK if index == 0 else PALE
    colour = WHITE if index == 0 else MUT
    d.rounded_rectangle((tx - tw, y - 6, tx, y + 24), radius=8, fill=fill)
    t((tx - tw / 2, y + 9), name, size=12, fill=colour, bold=index == 0, anchor="mm")
    tx -= tw + 6
y += 44

col_w = (FW - 44 - 16) / 2
left_x = FX + 22
right_x = left_x + col_w + 16

y2 = field(left_x, y, col_w, "اسم المنتوج", "Veste en cuir synthétique")
y2 = field(left_x, y2, col_w, "العلامة", "Stradivarius", kind="select")
y2 = field(left_x, y2, col_w, "القسم", "جاكيتات ← ملابس نساء", kind="select", hint="شجرة أقسام عالمية · قابلة للبحث")
y3 = field(right_x, y, col_w, "العائلة (تختار الحقول)", "ملابس", kind="select")
y3 = field(right_x, y3, col_w, "الجمهور", "نساء", kind="select", hint="رجالي · نسائي · أطفال · مختلط")
y3 = field(right_x, y3, col_w, "الحالة", "ACTIVE", kind="select")

y = max(y2, y3) + 6
d.line((FX + 22, y, FX + FW - 22, y), fill=(238, 238, 238), width=1)
y += 16
t((FX + FW - 22, y), "السعر — الخادم هو اللي يحسب الإجمالي", size=13, bold=True)
y += 26
steps = [("سعر المصدر", "249.00"), ("الديوانة", "12.40"), ("الشحن", "7.00"), ("الخدمة", "3.00")]
cw4 = (FW - 44 - 3 * 10) / 4
for index, (label, value) in enumerate(steps):
    x = FX + 22 + index * (cw4 + 10)
    d.rounded_rectangle((x, y, x + cw4, y + 34), radius=8, fill=WHITE, outline=LINE)
    t((x + cw4 - 10, y + 8), label, size=10, fill=MUT)
    d.text((x + 10, y + 20), value, font=B(13, True), fill=INK, anchor="lm")
y += 46
d.rounded_rectangle((FX + 22, y, FX + 22 + cw4 * 2 + 10, y + 40), radius=9, fill=(238, 235, 251))
t((FX + 22 + cw4 * 2 + 2, y + 10), "الإجمالي TND", size=10, fill=VIOLET)
d.text((FX + 32, y + 26), "271.40", font=B(16, True), fill=VIOLET, anchor="lm")
d.text((FX + 32 + d.textlength("271.40", font=B(16, True)) + 5, y + 28), "TND", font=B(9), fill=VIOLET, anchor="lm")
t((FX + FW - 22, y + 12), "auto · يُحسب في الخادم", size=10, fill=GREEN)
y += 58
d.line((FX + 22, y, FX + FW - 22, y), fill=(238, 238, 238), width=1)
y += 16

t((FX + FW - 22, y), "الخصائص — تبدّلت وحدها كي اخترت «ملابس»", size=13, bold=True)
t((FX + FW - 620, y + 2), "بقية العائلات تعطي حقول أخرى", size=10, fill=MUT)
y += 24
attr_rows = [
    ("الخامة", "صوف مخلوط 70% · بوليستر 30%", "نص"),
    ("القصّة", "regular", "اختيار"),
    ("الطول", "standard", "اختيار"),
    ("العناية", "غسل 30° · بلا تجفيف", "نص"),
    ("جدول القياسات", "EU 34 → 52 (7 مقاسات)", "جدول"),
]
for label, value, kind in attr_rows:
    d.rounded_rectangle((FX + 22, y, FX + FW - 22, y + 32), radius=8, fill=WHITE, outline=(240, 240, 240))
    t((FX + FW - 34, y + 9), label, size=12)
    draw_any((FX + 150, y + 10), value, 12, MUT)
    tw = d.textlength(ar(kind), font=F(9)) + 16
    d.rounded_rectangle((FX + 34, y + 8, FX + 34 + tw, y + 24), radius=6, fill=PALE)
    t((FX + 34 + tw - 8, y + 16), kind, size=9, fill=MUT, anchor="rm")
    y += 38

y += 8
t((FX + FW - 22, y), "الوصف — نصّ حرّ + نقاط", size=13, bold=True)
y += 22
d.rounded_rectangle((FX + 22, y, FX + FW - 22, y + 64), radius=9, fill=WHITE, outline=LINE)
d.text((FX + 34, y + 12), "Veste en cuir synthétique, doublure chaude.", font=B(12), fill=INK, anchor="la")
for index, point in enumerate(["· matière souple", "· poches intérieures"]):
    d.text((FX + 34, y + 30 + index * 14), point, font=B(10), fill=MUT, anchor="la")

# aperçu carte, dans le même écran
py = FY + FH - 176
d.rounded_rectangle((FX + 22, py - 30, FX + FW - 22, py - 6), radius=8, fill=(247, 247, 247))

t((FX + FW - 34, py - 24), "هذي هي الكارطة الصغيرة — نفس الشاشة تعمّرها", size=11, fill=MUT)
cw, ch = 300, 137
px = FX + 22
d.rounded_rectangle((px, py + 10, px + cw, py + 10 + ch), radius=10, fill=WHITE, outline=(238, 238, 238))
band = 90
shot = cover(JACKET, band, ch)
mask = Image.new("L", (cw, ch), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=10, fill=255)
canvas.paste(shot, (px, py + 10), mask.crop((0, 0, band, ch)))
d.text((px + band + 12, py + 26), "Stradivarius", font=B(13, True), fill=INK, anchor="la")
d.text((px + band + 12, py + 49), "Faux leather jacket", font=B(12), fill=INK, anchor="la")
d.text((px + band + 12, py + 72), "189.00 TND", font=B(12, True), fill=INK, anchor="la")
d.line((px + cw - 30, py + 21, px + cw - 20, py + 31), fill=INK, width=2)
d.line((px + cw - 20, py + 31, px + cw - 10, py + 21), fill=INK, width=2)

bx = px + cw + 20
t((FX + FW - 34, py + 16), "وين تبان", size=12, bold=True)
for index, item in enumerate(["الريل · الكارطة الصغيرة", "الستوري والمنشور", "الفيشة الكبيرة", "البحث واللينس"]):
    d.ellipse((FX + FW - 30, py + 44 + index * 24 + 4, FX + FW - 20, py + 44 + index * 24 + 14), fill=VIOLET)
    t((FX + FW - 38, py + 42 + index * 24), item, size=11, fill=MUT)

# ═══════════════════════════ 2 · les médias ═════════════════════════════════
MX = FX + FW + 24
MW_ = 620
y = panel(MX, FY, MW_, FH, "2 · الوسائط — صور وفيديو في نفس البلاصة",
          "catalogue_media موجود: IMAGE · VIDEO · DOCUMENT · ترتيب · رئيسية")

kind_x = MX + MW_ - 22
for label, active in [("صور", True), ("فيديو", False)]:
    tw = d.textlength(ar(label), font=F(12, True)) + 26
    d.rounded_rectangle((kind_x - tw, y, kind_x, y + 28), radius=8, fill=INK if active else PALE)
    t((kind_x - tw / 2, y + 14), label, size=12, fill=WHITE if active else MUT, bold=True, anchor="mm")
    kind_x -= tw + 6
y += 44

thumb = 128
gap = 12
for index, shot in enumerate([JACKET, KNIT, TROUSERS, JUMPSUIT]):
    col = index % 3
    row = index // 3
    x = MX + MW_ - 22 - thumb - col * (thumb + gap)
    ty = y + row * (thumb + 34)
    canvas.paste(cover(shot, thumb, thumb), (x, ty))
    d.rounded_rectangle((x, ty, x + thumb, ty + thumb), radius=10, outline=LINE, width=1)
    if index == 0:
        d.rounded_rectangle((x + 6, ty + 6, x + 44, ty + 26), radius=6, fill=INK)
        t((x + 10, ty + 11), "رئيسية", size=9, fill=WHITE, anchor="la")
        d.ellipse((x + thumb - 26, ty + 6, x + thumb - 8, ty + 24), fill=WHITE)
        d.text((x + thumb - 17, ty + 15), "★", font=F(10), fill=INK, anchor="mm")
    d.text((x + 6, ty + thumb - 22), f"{index + 1}", font=B(11, True), fill=WHITE, anchor="la")
    # poignée
    for line_index in range(3):
        d.line((x + 6, ty + thumb - 34 + line_index * 4, x + 20, ty + thumb - 34 + line_index * 4), fill=(255, 255, 255), width=2)

add_x = MX + MW_ - 22 - thumb - 2 * (thumb + gap)
vy = y + thumb + 34
# tuile vidéo
d.rounded_rectangle((add_x, vy, add_x + thumb * 2 + gap, vy + thumb), radius=10, fill=(22, 22, 22))
canvas.paste(cover(JACKET, thumb * 2 + gap, thumb).convert("RGB").point(lambda v: int(v * 0.45)), (add_x, vy))
d.polygon([(add_x + 118, vy + 44), (add_x + 118, vy + 84), (add_x + 150, vy + 64)], fill=WHITE)
d.text((add_x + 10, vy + 8), "MP4 · 0:12", font=B(10, True), fill=WHITE, anchor="la")
t((add_x + 10, vy + thumb - 34), "الفيديو يخدم في الريل", size=10, fill=WHITE, anchor="la")
t((add_x + 10, vy + thumb - 18), "والكارطة تاخذ أول صورة", size=10, fill=(205, 205, 205), anchor="la")

# zone de dépôt
dy = vy + thumb + 22
d.rounded_rectangle((MX + 22, dy, MX + MW_ - 22, dy + 96), radius=12, fill=(249, 249, 249), outline=(214, 214, 214), width=2)
for dx in range(int(MX + 60), int(MX + MW_ - 60), 18):
    d.line((dx, dy + 8, dx + 9, dy + 8), fill=(214, 214, 214), width=2)
    d.line((dx, dy + 88, dx + 9, dy + 88), fill=(214, 214, 214), width=2)
t((MX + MW_ / 2, dy + 22), "اسحب وأفلت الصور والفيديو هنا", size=13, bold=True, anchor="ma")
t((MX + MW_ / 2, dy + 48), "JPG · PNG · WEBP · MP4 (حتى 10 ميغا) — ولا تنسخ رابط https", size=10, fill=MUT, anchor="ma")
t((MX + MW_ / 2, dy + 68), "الفيديو والصور في نفس السطر · الترتيب بالسحب", size=10, fill=GREEN, anchor="ma")

dy += 118
t((MX + MW_ - 22, dy), "قواعد صغيرة تحمي العرض", size=12, bold=True)
dy += 24
for rule in ["صورة واحدة على الأقل باش ينشر المنتوج",
             "الفيديو ما يبدّلش الصورة الرئيسية وحدو",
             "حذف صورة = تنحّي المرجع، الملف يبقى في الديسك",
             "ترتيب الصور هو ترتيب النقّاطات في الفيشة"]:
    d.ellipse((MX + MW_ - 28, dy + 6, MX + MW_ - 18, dy + 16), fill=AMBER)
    t((MX + MW_ - 36, dy), rule, size=11, fill=MUT)
    dy += 24

# ═══════════════════════════ 3 · les catégories ═════════════════════════════
CX = MX + MW_ + 26
CW_ = W - CX - 40
y = panel(CX, FY, CW_, FH, "3 · الأقسام — عالمية، كبيانات موش كود",
          "شجرة catalogue_categories: parent_id + sort_order")

TREE = [
    ("ملابس", ["نساء", "رجال", "أطفال", "ملابس داخلية", "رياضة"]),
    ("أحذية", ["نساء", "رجال", "أطفال", "رياضة"]),
    ("حقائب وإكسسوارات", ["حقائب", "أحزمة", "نظارات", "قبعات", "مجوهرات", "ساعات"]),
    ("جمال", ["عناية بالبشرة", "ماكياج", "عطور", "شعر", "عناية شخصية"]),
    ("إلكترونيك", ["هواتف", "حواسيب", "صوتيات", "تلفزيون", "ملحقات", "منزلية ذكية"]),
    ("منزل وديكور", ["أثاث", "ديكور", "مطبخ", "مفروشات", "إضاءة", "حديقة"]),
    ("رياضة", ["لياقة", "دراجات", "تخييم", "ألعاب"]),
    ("بقالة", ["منظّفات", "ورقيات", "يوميات"]),
]

colw2 = (CW_ - 44 - 18) / 2
for index, (family, children) in enumerate(TREE):
    cx0 = CX + CW_ - 22 - (index % 2) * (colw2 + 18) - colw2
    cy0 = y + (index // 2) * 214
    d.rounded_rectangle((cx0, cy0, cx0 + colw2, cy0 + 26), radius=7, fill=(249, 249, 249))
    t((cx0 + colw2 - 10, cy0 + 6), family, size=12, bold=True)
    d.text((cx0 + 10, cy0 + 8), str(len(children)), font=B(9, True), fill=FAINT, anchor="la")
    for child_index, child in enumerate(children):
        cy1 = cy0 + 32 + child_index * 24
        d.line((cx0 + colw2 - 12, cy1 + 10, cx0 + colw2 - 6, cy1 + 10), fill=(206, 206, 206), width=1)
        t((cx0 + colw2 - 16, cy1 + 1), child, size=10, fill=MUT)

note_y = FY + FH - 56
d.line((CX + 22, note_y - 12, CX + CW_ - 22, note_y - 12), fill=(238, 238, 238), width=1)
t((CX + CW_ - 22, note_y), "مثال: هاتف ← إلكترونيك / هواتف", size=11, fill=VIOLET)
t((CX + CW_ - 22, note_y + 22), "العائلة تحدد حقول المتغيّرات والخصائص", size=11, fill=VIOLET)

# ═══════════════════════════ 4 · le tableau ═════════════════════════════════
TY = FY + FH + 56
t((W - 40, TY), "اللي يتعمّر وحدو حسب العائلة", size=24, bold=True)
t((W - 40, TY + 34), "نفس الشاشة، حقول مختلفة — بلا كود لكل عائلة", size=13, fill=MUT)
TY += 74

cols = [("العائلة", 170), ("المتغيّر", 240), ("خصائص إلزامية", 420), ("اختيارية", 330), ("يتعمّر وحدو", 260)]
start = W - 40 - sum(width for _, width in cols)
x = start
for label, width in cols:
    t((x + width - 16, TY), label, size=12, fill=MUT, bold=True)
    x += width
d.line((start, TY + 26, W - 40, TY + 26), fill=(208, 208, 208), width=2)

ROWS = [
    ("ملابس", "مقاس XS → 4XL · اللون", "الخامة · العناية · جدول القياسات", "القصّة · الطول · بلد الصنع", "الصورة · السعر · العلامة"),
    ("أحذية", "EU / US / UK · اللون", "المادة · النعل · جدول القياسات", "ارتفاع الكعب · عرض القدم", "الصورة · السعر · العلامة"),
    ("جمال", "الحجم ml · الدرجة", "المكوّنات · نوع البشرة · PAO", "خالٍ من · بلد الصنع", "الصورة · السعر · العلامة"),
    ("إلكترونيك", "الذاكرة · اللون", "الشاشة · البطارية · الشبكة", "المعالج · الوزن · الضمان", "المرجع · الصورة · السعر"),
    ("منزل", "الأبعاد · اللون", "الأبعاد · المادة · التركيب", "النمط · العناية", "الصورة · السعر · العلامة"),
    ("مستلزمات", "العدد (1/3/6)", "العدد في العلبة · الحجم", "الاستعمال · بلد الصنع", "الصورة · السعر · العلامة"),
]
ry = TY + 36
for index, row in enumerate(ROWS):
    if index % 2 == 0:
        d.rectangle((start, ry - 8, W - 40, ry + 34), fill=WHITE)
    x = start
    for cell_index, (cell, (_, width)) in enumerate(zip(row, cols)):
        if cell_index == 0:
            t((x + width - 16, ry), cell, size=13, bold=True)
        elif cell_index == 4:
            tw2 = d.textlength(ar(cell), font=F(10)) + 20
            d.rounded_rectangle((x + width - 16 - tw2, ry - 2, x + width - 16, ry + 22), radius=7, fill=(232, 246, 238))
            t((x + width - 26, ry + 2), cell, size=10, fill=GREEN)
        else:
            t((x + width - 16, ry), cell, size=11, fill=MUT)
        x += width
    ry += 42

ry += 16
d.rounded_rectangle((start, ry, W - 40, ry + 62), radius=12, fill=(238, 235, 251))
t((W - 56, ry + 10), "قاعدة الانتقال: كان ما اخترناش العائلة، نطلبوها قبل ما نعمرو الخصائص", size=12, fill=VIOLET)
t((W - 56, ry + 34), "والعائلة تبدّل المتغيّر والخصائص في نفس اللحظة — بلا ما يضيع شي من اللي تعمّر", size=11, fill=VIOLET)

d.text((40, H - 34), "docs/design/bigcard/crm-product-form-24-10.png", font=F(13), fill=(160, 160, 160))
canvas.save(OUT / "crm-product-form-24-10.png")
canvas.convert("RGB").save(OUT / "crm-product-form-24-10.jpg", quality=92, optimize=True)
print("saved", canvas.size)
