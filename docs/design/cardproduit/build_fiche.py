"""Construit la planche « fiche produit » — copie du modèle de référence.

Repères : capture du 25/10/2026 (fiche marchande) + fiche actuelle de l'app.
Échelle : 2 px = 1 dp, écran 360 × 800 dp → 720 × 1600 px.
Police : ZalandoSans (celle de l'application).
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1600
BG = (255, 255, 255)
INK = (10, 10, 10)
MUTED = (138, 138, 138)
HAIR = (236, 236, 236)
MEDIA_BG = (239, 239, 239)
STRIKE = (154, 154, 154)
OK = (30, 122, 60)
OK_BG = (232, 246, 236)

FONT_DIR = "apps/mobile/assets/fonts"
def font(size, weight="Regular"):
    return ImageFont.truetype(f"{FONT_DIR}/ZalandoSans-{weight}.ttf", size)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# ── 1. Photo : la zone média de la fiche (430 dp), plein cadre ─────────────
src = Image.open("/tmp/arena-coding-uploads/Screenshot_20261025_012150_app.ayrovi.mobile.demo.jpg").convert("RGB")
photo = src.crop((0, 56, 720, 880))
# La flèche de retour est déjà celle de l'app : on ne la retouche pas.
# Le panier, lui, n'existait pas — on le pose sur le fond, à la même cote.
photo = photo.resize((W, 860))
img.paste(photo, (0, 56))

# ── 2. En-tête flottant : retour + panier (le panier manquait) ─────────────
def chevron_left(cx, cy, size, color, width=5):
    d.line([(cx + size * 0.3, cy - size * 0.5), (cx - size * 0.3, cy), (cx + size * 0.3, cy + size * 0.5)],
           fill=color, width=width, joint="curve")

def bag(cx, cy, size, color, width=4):
    r = size * 0.42
    d.rounded_rectangle([cx - r, cy - r * 0.85, cx + r, cy + r], radius=8, outline=color, width=width)
    d.arc([cx - r * 0.55, cy - r * 1.35, cx + r * 0.55, cy - r * 0.15], 180, 360, fill=color, width=width)

def expand(cx, cy, size, color, width=4):
    a, b = size * 0.5, size * 0.22
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        x, y = cx + sx * a, cy + sy * a
        d.line([(x, y), (x - sx * b, y)], fill=color, width=width)
        d.line([(x, y), (x, y - sy * b)], fill=color, width=width)

bag(672, 113, 44, INK)
d.ellipse([686, 84, 716, 114], fill=INK)
d.text((694, 86), "2", font=font(17, "Bold"), fill=BG)

# ── 3. Galerie : points + plein écran, posés SUR la photo ──────────────────
dots_y, active = 838, 3
total, gap = 7, 26
start = W / 2 - (total - 1) * gap / 2
for i in range(total):
    x = start + i * gap
    r = 5 if i != active else 6
    d.ellipse([x - r, dots_y - r, x + r, dots_y + r], fill=INK if i == active else (201, 201, 201))
expand(662, 838, 40, INK)

# ── 4. La feuille blanche qui monte sur la photo ───────────────────────────
SHEET = 884
d.rounded_rectangle([0, SHEET, W, H], radius=40, fill=BG)
d.rectangle([0, SHEET + 40, W, H], fill=BG)
PAD = 32

# marque (plateforme source) — petite, grise, majuscules
d.text((PAD, 924), "SHEIN", font=font(21), fill=MUTED)

# titre
y = 962
for line in ("Ensemble tendance", "ZAYROVI"):
    d.text((PAD, y), line, font=font(56, "Bold"), fill=INK)
    y += 64

# prix + prix barré + remise
py = 1116
d.text((PAD, py), "153.51 TND", font=font(46, "Bold"), fill=INK)
w_price = d.textlength("153.51 TND", font=font(46, "Bold"))
old_x = PAD + w_price + 22
d.text((old_x, py + 12), "189.00 TND", font=font(31), fill=STRIKE)
w_old = d.textlength("189.00 TND", font=font(31))
d.line([(old_x - 2, py + 32), (old_x + w_old + 2, py + 32)], fill=STRIKE, width=3)
bx = old_x + w_old + 18
d.rounded_rectangle([bx, py + 8, bx + 96, py + 52], radius=10, fill=OK_BG)
d.text((bx + 15, py + 16), "-19%", font=font(26, "Bold"), fill=OK)

# ── 5. Rangée « Taille » : ouvre la feuille de choix ───────────────────────
row_y = 1200
def ruler(x, y):
    d.rounded_rectangle([x, y, x + 22, y + 44], radius=5, outline=INK, width=4)
    for i in range(3):
        yy = y + 10 + i * 11
        d.line([(x + 6, yy), (x + 12, yy)], fill=INK, width=3)
ruler(PAD, row_y + 24)
d.text((PAD + 44, row_y + 24), "Taille", font=font(31, "SemiBold"), fill=INK)
d.line([(642, row_y + 34), (656, row_y + 48), (670, row_y + 34)], fill=INK, width=4, joint="curve")
d.line([(PAD, row_y + 92), (W - PAD, row_y + 92)], fill=HAIR, width=2)

# ── 6. Sections pliables (une section vide ne s'affiche pas) ───────────────
def accordion(y, label):
    d.text((PAD, y + 22), label, font=font(31, "Bold"), fill=INK)
    cx, cy = W - PAD - 16, y + 40
    d.line([(cx - 14, cy), (cx + 14, cy)], fill=INK, width=4)
    d.line([(cx, cy - 14), (cx, cy + 14)], fill=INK, width=4)
    d.line([(PAD, y + 80), (W - PAD, y + 80)], fill=HAIR, width=2)

accordion(1262, "Caractéristiques")
accordion(1342, "Description")
accordion(1422, "Détail du prix")

# ── 7. Barre d'achat FIXE : prix serveur + CTA noir (décision verrouillée) ─
BAR = 1460
d.rectangle([0, BAR, W, H], fill=BG)
d.line([(0, BAR), (W, BAR)], fill=HAIR, width=2)
d.text((PAD, BAR + 52), "153.51 TND", font=font(32, "Bold"), fill=INK)
d.rounded_rectangle([330, BAR + 24, 688, BAR + 124], radius=50, fill=INK)
label = "Ajouter au panier"
tw = d.textlength(label, font=font(30, "Bold"))
d.text((330 + (358 - tw) / 2, BAR + 54), label, font=font(30, "Bold"), fill=BG)

img.save("docs/design/cardproduit/mockup-fiche-25-10.png")
print("ok")
