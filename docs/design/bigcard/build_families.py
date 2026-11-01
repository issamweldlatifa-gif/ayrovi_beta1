#!/usr/bin/env python3
"""
FICHE PRODUIT — les FAMILLES et leurs ATTRIBUTS (source : le CRM).

Planche demandée par le propriétaire (24/10/2026) : avant d'implémenter la maquette
de la fiche, il faut savoir **ce que le CRM doit remplir** pour que la fiche se
construise toute seule, et **comment distinguer** un vêtement d'un accessoire, d'un
produit de maquillage, d'un électronique, d'un article maison ou d'un essentiel.

Trois panneaux :
  1. les 7 familles, leurs sous-familles et **les axes de choix** (variantes) ;
  2. la **matrice attributs × familles** — ● obligatoire, ○ facultatif, · sans objet —
     chaque ligne sait dans quelle SECTION de la fiche elle s'affiche ;
  3. le **chemin** : formulaire CRM → base → `GET /api/public/products/:id` →
     sections rendues par l'application, sans code par famille.

Règle tenue partout : un attribut absent ⇒ **sa ligne disparaît, et la section
disparaît si elle devient vide**. Aucun « — », aucune valeur inventée.

Usage : python3 docs/design/bigcard/build_families.py
Sortie : docs/design/bigcard/families-attributes-24-10.png (+ .jpg)
"""
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/design/bigcard"

INK = (16, 16, 16)
MUT = (124, 124, 124)
LINE = (226, 226, 226)
SOFT = (246, 246, 246)
WHITE = (255, 255, 255)
GREEN = (11, 122, 64)
AMBER = (176, 110, 10)
VIOLET = (87, 30, 246)
RED = (200, 24, 40)

AR_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
AR_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BRAND_R = ROOT / "assets/fonts/ZalandoSans-Regular.ttf"
BRAND_B = ROOT / "assets/fonts/ZalandoSans-Bold.ttf"


def F(s, bold=False):
    return ImageFont.truetype(AR_BOLD if bold else AR_FONT, int(round(s)))


def B(s, bold=False):
    return ImageFont.truetype(str(BRAND_B if bold else BRAND_R), int(round(s)))


def ar(text):
    return get_display(arabic_reshaper.reshape(text))


FAMILIES = ["ملابس", "أحذية", "إكسسوارات", "جمال", "إلكترونيك", "منزل", "مستلزمات"]

# (section, [(clé arabe, clé technique, (obligatoire ou facultatif par famille))])
# ● = 2 (obligatoire) · ○ = 1 (facultatif) · · = 0 (sans objet)
ROWS = [
    ("الهوية", [
        ("العلامة", "brand", [2, 2, 2, 2, 2, 2, 2]),
        ("المرجع", "reference", [2, 2, 2, 2, 2, 2, 2]),
        ("الجمهور", "audience", [2, 2, 1, 2, 1, 2, 2]),
        ("بلد المنشأ", "origin", [1, 1, 1, 1, 1, 1, 1]),
    ]),
    ("المقاس والقيس", [
        ("جدول القياسات", "size_chart", [2, 2, 1, 0, 0, 0, 1]),
        ("المقاسات المتوفرة", "size", [2, 2, 1, 0, 0, 1, 2]),
        ("قصّة", "fit", [1, 1, 0, 0, 0, 0, 0]),
        ("الطول", "length", [1, 1, 1, 0, 0, 1, 0]),
        ("ارتفاع الكعب", "heel_height", [0, 2, 0, 0, 0, 0, 0]),
        ("عرض القدم", "shoe_width", [0, 1, 0, 0, 0, 0, 0]),
        ("العدد في العلبة", "pack_size", [0, 0, 0, 1, 1, 1, 2]),
    ]),
    ("الخامة", [
        ("التركيبة", "composition", [2, 2, 2, 2, 0, 2, 1]),
        ("المادة الخارجية", "material", [1, 2, 2, 1, 2, 2, 1]),
        ("البطانة", "lining", [1, 1, 1, 0, 0, 0, 0]),
        ("النعل", "sole", [0, 1, 0, 0, 0, 0, 0]),
        ("نوع المعدن / الحجر", "metal_stone", [0, 0, 2, 0, 0, 0, 0]),
    ]),
    ("الخواص التقنية", [
        ("الذاكرة والتخزين", "memory_storage", [0, 0, 0, 0, 2, 0, 0]),
        ("الشاشة", "display", [0, 0, 0, 0, 2, 0, 0]),
        ("المعالج", "processor", [0, 0, 0, 0, 1, 0, 0]),
        ("البطارية والشحن", "battery", [0, 0, 0, 0, 2, 1, 0]),
        ("الشبكة والنظام", "network_os", [0, 0, 0, 0, 2, 0, 0]),
        ("القوة / السعة", "power_capacity", [0, 0, 0, 0, 1, 1, 0]),
    ]),
    ("الجمال والعناية", [
        ("الحجم", "volume", [0, 0, 1, 2, 0, 1, 2]),
        ("الدرجة / اللون", "shade", [1, 0, 1, 2, 0, 0, 0]),
        ("نوع البشرة", "skin_type", [0, 0, 0, 2, 0, 0, 1]),
        ("المكوّنات الفعّالة", "ingredients", [0, 0, 0, 2, 0, 0, 0]),
        ("مدة الاستعمال", "pao", [0, 0, 0, 2, 0, 0, 0]),
        ("خالٍ من", "free_from", [0, 0, 0, 1, 0, 0, 0]),
    ]),
    ("المنزل", [
        ("الأبعاد", "dimensions", [0, 0, 2, 1, 2, 2, 1]),
        ("طريقة التركيب", "assembly", [0, 0, 0, 0, 0, 2, 0]),
        ("مقاوم للماء", "water_resistant", [0, 1, 1, 1, 1, 1, 1]),
        ("النمط", "style", [1, 0, 1, 0, 0, 2, 0]),
    ]),
    ("الضمان والتوصيل", [
        ("الضمان", "warranty", [0, 1, 1, 0, 2, 1, 0]),
        ("المنشأ / الاستيراد", "import", [1, 1, 1, 1, 2, 1, 1]),
        ("العناية والغسل", "care", [2, 1, 1, 0, 0, 1, 0]),
    ]),
]

VARIANTS = [
    ("ملابس", "XS → 4XL · EU 34–52", "اللون"),
    ("أحذية", "EU 36–46 · US · UK", "اللون"),
    ("إكسسوارات", "S/M/L · طول الحزام", "اللون · المادة"),
    ("جمال", "30/50/100 ml", "الدرجة · الحجم"),
    ("إلكترونيك", "128/256/512 Go", "اللون · النسخة"),
    ("منزل", "S/M/L · أبعاد", "اللون"),
    ("مستلزمات", "1 / 3 / 6", "المقاس"),
]

ROWS_H = sum(24 + 22 * len(rows) + 4 for _, rows in ROWS)
SECTION_H = ROWS_H + 110
CARDS_H = 176
W, H = 1980, 130 + SECTION_H + 46 + CARDS_H + 40
canvas = Image.new("RGB", (W, H), (243, 243, 243))
d = ImageDraw.Draw(canvas)


def artext(xy, text, size=16, fill=INK, bold=False, anchor="ra"):
    d.text(xy, ar(text), font=F(size, bold), fill=fill, anchor=anchor)


# ── titre ───────────────────────────────────────────────────────────────────
artext((W - 50, 26), "الكارطة الكبيرة — العائلات والخصائص من CRM", size=36, bold=True)
artext((W - 50, 80), "باش تتعمّر الفيشة وحدها: كل خصيصة عندها عائلة، نوع، وإلزامية — والقسم يختفي كان ما فمّاش", size=18, fill=MUT)

# ── panneau 1 : familles + axes ─────────────────────────────────────────────
PX, PY, PW_, PH = 40, 130, 470, H - 130 - 226
d.rounded_rectangle((PX, PY, PX + PW_, PY + PH), radius=18, fill=WHITE, outline=LINE)
artext((PX + PW_ - 22, PY + 16), "1 · سبع عائلات", size=20, bold=True)
artext((PX + PW_ - 22, PY + 44), "العائلة تحدّد الخصائص والمقاسات", size=13, fill=MUT)

y = PY + 74
for index, (family, axis, colour) in enumerate(VARIANTS):
    if index:
        d.line((PX + 20, y - 8, PX + PW_ - 20, y - 8), fill=(242, 242, 242), width=1)
    d.ellipse((PX + PW_ - 32, y + 4, PX + PW_ - 18, y + 18), fill=VIOLET)
    d.text((PX + PW_ - 25, y + 11), str(index + 1), font=F(10, True), fill=WHITE, anchor="mm")
    artext((PX + PW_ - 44, y), family, size=16, bold=True)
    artext((PX + PW_ - 44, y + 22), f"المقاس: {axis}", size=12, fill=MUT)
    artext((PX + PW_ - 44, y + 40), f"الألوان/الأنواع: {colour}", size=12, fill=MUT)
    y += 66

artext((PX + PW_ - 22, PY + PH - 44), "«رجالي / نسائي / أطفال» موش عائلة — خصيصة الجمهور", size=12, fill=AMBER)

# ── panneau 2 : matrice ─────────────────────────────────────────────────────
MX = PX + PW_ + 26
MY = PY
MW = 1010
COL0 = 250          # largeur de la colonne « attribut »
COLW = (MW - 40 - COL0) / len(FAMILIES)

d.rounded_rectangle((MX, MY, MX + MW, MY + ROWS_H + 110), radius=18, fill=WHITE, outline=LINE)
artext((MX + MW - 20, MY + 14), "2 · مصفوفة الخصائص", size=20, bold=True)
artext((MX + MW - 20, MY + 42), "● إلزامي   ○ اختياري   · ما يخدمش", size=12, fill=MUT)

# entêtes
hy = MY + 70
for index, family in enumerate(FAMILIES):
    cx = MX + 20 + COLW * index + COLW / 2
    d.text((cx, hy + 10), ar(family), font=F(12, True), fill=INK, anchor="mm")
d.line((MX + 16, hy + 26, MX + MW - 16, hy + 26), fill=LINE, width=1)

y = hy + 34
for section, rows in ROWS:
    # bandeau de section
    d.rectangle((MX + 16, y, MX + MW - 16, y + 22), fill=(247, 247, 247))
    artext((MX + MW - 24, y + 4), section, size=12, fill=MUT, bold=True)
    y += 24
    for label, key, marks in rows:
        artext((MX + MW - 24, y + 2), label, size=13)
        d.text((MX + 20, y + 4), key, font=F(9), fill=(178, 178, 178))
        for index, mark in enumerate(marks):
            cx = MX + 20 + COLW * index + COLW / 2
            cy = y + 9
            if mark == 2:
                d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=INK)
            elif mark == 1:
                d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), outline=(150, 150, 150), width=2)
            else:
                d.text((cx, cy + 1), "·", font=F(13), fill=(205, 205, 205), anchor="mm")
        y += 22
    y += 4

# ── panneau 3 : le chemin + la règle ───────────────────────────────────────
FX = MX + MW + 26
FW = W - FX - 40
d.rounded_rectangle((FX, PY, FX + FW, PY + ROWS_H + 110), radius=18, fill=WHITE, outline=LINE)
artext((FX + FW - 20, PY + 14), "3 · الطريق", size=20, bold=True)

chain = [
    ("CRM", "كانترول المنتوج: عائلة + خصائص + صور + مقاسات"),
    ("BD", "catalogue_attributes · catalogue_attribute_values"),
    ("API", "GET /api/public/products/:id → sheet"),
    ("APP", "يرسم sections[] بالترتيب — بلا كود لكل عائلة"),
]
y = PY + 56
for code, text in chain:
    d.rounded_rectangle((FX + FW - 78, y, FX + FW - 20, y + 26), radius=8, fill=(28, 28, 28))
    d.text((FX + FW - 49, y + 13), code, font=B(12, True), fill=WHITE, anchor="mm")
    artext((FX + FW - 90, y + 3), text, size=12)
    y += 40
    if code != "APP":
        d.line((FX + FW - 49, y - 12, FX + FW - 49, y + 2), fill=(200, 200, 200), width=2)

y += 24
artext((FX + FW - 20, y), "القاعدة", size=18, bold=True); y += 30
for rule in [
    "خصيصة غايبة ⇒ سطرها يختفي",
    "قسم ولّى فارغ ⇒ يختفي",
    "خصيصة موش في العائلة ⇒ ما تتعرضش",
    "الحقل الغالط ⇒ الخادم يرفض (بلا تخزين صامت)",
]:
    d.ellipse((FX + FW - 26, y + 6, FX + FW - 16, y + 16), fill=RED)
    artext((FX + FW - 36, y), rule, size=12, fill=MUT)
    y += 26

# ── panneau 4 : exemples concrets de sections par famille ──────────────────
SY = PY + ROWS_H + 136
artext((W - 50, SY), "كيفاش تتبدّل الأقسام حسب العائلة", size=20, bold=True)
SY += 36
cards = [
    ("ملابس", ["المقاس والقصّة", "الخامة", "العناية"], GREEN),
    ("أحذية", ["المقاس (EU/US/UK)", "ارتفاع الكعب", "النعل"], GREEN),
    ("إكسسوارات", ["الأبعاد", "المعدن/الحجر", "المادة"], VIOLET),
    ("جمال", ["المكوّنات", "نوع البشرة", "المدة (PAO)"], VIOLET),
    ("إلكترونيك", ["الشاشة", "الذاكرة", "البطارية"], AMBER),
    ("منزل", ["الأبعاد", "التركيب", "الخامة"], AMBER),
    ("مستلزمات", ["العدد", "الحجم", "الاستعمال"], GREEN),
]
cw = (W - 80 - 6 * 14) / 7
for index, (family, sections, colour) in enumerate(cards):
    x = W - 40 - cw - index * (cw + 14)
    d.rounded_rectangle((x, SY, x + cw, SY + 150), radius=14, fill=WHITE, outline=LINE)
    d.rectangle((x, SY, x + cw, SY + 4), fill=colour)
    artext((x + cw - 14, SY + 14), family, size=15, bold=True)
    yy = SY + 42
    for section in sections:
        d.ellipse((x + cw - 22, yy + 5, x + cw - 14, yy + 13), fill=colour)
        artext((x + cw - 28, yy), section, size=11, fill=MUT)
        yy += 28

d.text((40, H - 34), "docs/design/bigcard/families-attributes-24-10.png", font=F(13), fill=(165, 165, 165))
canvas.save(OUT / "families-attributes-24-10.png")
canvas.convert("RGB").save(OUT / "families-attributes-24-10.jpg", quality=92, optimize=True)
print("saved", canvas.size)
