"""
موكاب ورقة المقاسات — تتحلّ كي تدقّ على سطر «Taille» في الفيش (25/10/2026).

القياسات المأخوذة بالبكسل من `Screenshot_20261025_021253` (720×1600 = 360×800dp):

    الشاشة المحجوبة (dim)  0 → 124
    الورقة تبدأ          45
    المقبض               328→391 × 89→96   (#D1D1D1)
    العنوان              42→397 × 149→171  «Sélectionnez votre taille» (34px)
    لوحة لافندر          32→688 × 181→313  (#EEECF7)
      الأيقونة           64→230 × 195→250
      النصّ (سطرين)      154→630 × 220→273
    سطر العناوين         y 354→379  «FR» 42 · «SUR L'ÉTIQUETTE (US)» 204 (24px)
    سطر أوّل             430 → 509   (79px)، والخطوط 509/613/717/… كل 104px
      FR 41→74 (44px) · US 203 · حالة السطر على اليمين 499→677

الحالة على يمين السطر هي **داتا**: مقاس مقطوع (strike) = غير متوفّر،
«Dernier article» = آخر وحدة، «Réserve» = محجوز.
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H = 720, 1600
WHITE = (255, 255, 255)
INK = (26, 26, 26)
MUTED = (128, 128, 128)
HAIR = (232, 232, 232)
LAVENDER = (238, 236, 247)
HANDLE = (209, 209, 209)
VIOLET = (83, 42, 196)
PAGE = (246, 246, 246)

FONT_DIR = "apps/mobile/assets/fonts"
def latin(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

def arabic(size, bold=False):
    return ImageFont.truetype(f"{FONT_DIR}/NotoSansArabic-{'Bold' if bold else 'Regular'}.ttf", size)

def ar(text):
    return get_display(arabic_reshaper.reshape(text))

SHEET_TOP = 45
PAD = 32
HANDLE_Y = (328, 89, 391, 97)
TITLE_Y = 140
PANEL = (32, 181, 688, 313)
HEAD_Y = 348
ROW_TOP = 430
ROW_H = 104
ROW_INNER = 79

# (FR, US, état) — état = None (متوفّر) · 'out' (مقطوع) · 'last' · 'reserved'
SIZES = [
    ("40", "7", "last"),
    ("41", "8", "out"),
    ("42", "8.5", "out"),
    ("42.5", "9", "out"),
    ("43", "9.5", "out"),
    ("44", "10", "out"),
    ("44.5", "10.5", "out"),
    ("45", "11", None),
    ("45.5", "11.5", "out"),
    ("46", "12", "out"),
    ("47.5", "13", "out"),
    ("48.5", "14", "reserved"),
]

STATE_LABEL = {"last": "Dernier article", "reserved": "Réserve"}


def icon_ruler(d, x, y, color=INK):
    d.rounded_rectangle([x, y, x + 30, y + 58], radius=6, outline=color, width=4)
    for i in range(3):
        yy = y + 14 + i * 15
        d.line([(x + 8, yy), (x + 18, yy)], fill=color, width=4)
    d.line([(x - 6, y + 20), (x + 2, y + 20)], fill=color, width=4)
    d.line([(x - 6, y + 38), (x + 2, y + 38)], fill=color, width=4)


def sheet(background):
    img = background.copy()
    d = ImageDraw.Draw(img)

    # خلفية محجوبة فوق الورقة (dim)
    scrim = Image.new("RGB", (W, SHEET_TOP), (20, 20, 20))
    img.paste(Image.blend(img.crop((0, 0, W, SHEET_TOP)), scrim, 0.35), (0, 0))

    # الورقة
    d.rectangle([0, SHEET_TOP, W, H], fill=WHITE)

    # المقبض
    d.rounded_rectangle(list(HANDLE_Y), radius=4, fill=HANDLE)

    # العنوان
    d.text((PAD, TITLE_Y), "Sélectionnez votre taille", font=latin(34), fill=INK)

    # لوحة التوصية
    d.rectangle(list(PANEL), fill=LAVENDER)
    icon_ruler(d, 64, 196)
    hint = latin(30)
    d.text((154, 216), "Nous vous recommandons de choisir", font=hint, fill=INK)
    d.text((154, 252), "la taille habituelle.", font=hint, fill=INK)

    # سطر العناوين
    d.text((42, HEAD_Y), "FR", font=latin(24, "SemiBold"), fill=INK)
    d.text((204, HEAD_Y), "SUR L'ÉTIQUETTE (US)", font=latin(24, "SemiBold"), fill=INK)

    # الأسطر
    fr_font, us_font = latin(44), latin(44)
    state_font = latin(30)
    for i, (fr, us, state) in enumerate(SIZES):
        top = ROW_TOP + i * ROW_H
        if top > H:
            break
        base = top + 8

        # الرقم + الخطّ على المقطوع
        d.text((42, base), fr, font=fr_font, fill=INK if state != "out" else (150, 150, 150))
        if state == "out":
            fw = d.textlength(fr, font=fr_font)
            d.line([(42, base + 30), (42 + fw, base + 30)], fill=(150, 150, 150), width=3)
        d.text((204, base), us, font=us_font, fill=INK if state != "out" else (150, 150, 150))
        if state == "out":
            uw = d.textlength(us, font=us_font)
            d.line([(204, base + 30), (204 + uw, base + 30)], fill=(150, 150, 150), width=3)

        # الحالة على اليمين
        if state in STATE_LABEL:
            label = STATE_LABEL[state]
            lw = d.textlength(label, font=state_font)
            d.text((677 - lw, base + 6), label, font=state_font, fill=VIOLET)

        # الخطّ الفاصل بين سطرين
        d.line([(0, top + ROW_INNER - 2), (W, top + ROW_INNER - 2)], fill=HAIR, width=2)

    return img


# خلفية = الفيش (باش يبان السياق: الورقة تطلع فوقو)
try:
    fiche = Image.open("docs/design/cardproduit/apercu-ecran-v6-25-10.png").convert("RGB")
except FileNotFoundError:
    fiche = Image.new("RGB", (W, H), (239, 239, 239))

shot = sheet(fiche)

GAP, MARGIN, HEAD, FOOT_H = 56, 56, 132, 64
page = Image.new("RGB", (MARGIN * 2 + W * 2 + GAP, HEAD + H + FOOT_H), PAGE)
pd = ImageDraw.Draw(page)
pd.text((MARGIN, 24), ar("ورقة المقاسات: تتحل كي تدق على Taille"), font=arabic(38, bold=True), fill=INK)
pd.text((MARGIN, 78), ar("يسار: الورقة فوق الفيش · يمين: نفس الورقة كاملة"), font=arabic(22), fill=MUTED)

page.paste(shot, (MARGIN, HEAD))
page.paste(shot, (MARGIN + W + GAP, HEAD))
pd.rectangle([MARGIN, HEAD, MARGIN + W, HEAD + H], outline=(200, 200, 200), width=2)
pd.rectangle([MARGIN + W + GAP, HEAD, MARGIN + W + GAP + W, HEAD + H], outline=(200, 200, 200), width=2)

page.save("docs/design/cardproduit/guide-tailles-ouverture-v8-25-10.png")
shot.save("docs/design/cardproduit/apercu-ouverture-taille-25-10.png")
print("ok", page.size)
