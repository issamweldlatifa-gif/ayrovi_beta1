"""
Comparatif de TAILLES — « ce qui existe » contre « ce qu'on veut faire ».

Le client a envoyé, le 27/10/2026, une capture de l'application (deux colonnes,
grandes plaques) et une référence (trois colonnes, tuiles portrait). La
question n'est pas « lequel est joli » mais « quelles sont les cotes ». Ce
script dessine donc trois panneaux à l'échelle 1:1 sur un écran de 390 pt et
annote les mesures réelles :

  A. Aujourd'hui, tel quel .......... 2 colonnes, carte 176, photo 128
     (24 pt de réserve sur chaque bord : la réserve servait aux LOGOS de
     boutiques, elle avait été appliquée aussi aux PHOTOS de catégories)
  B. Aujourd'hui, réserve retirée .... 2 colonnes, carte 176, photo 176
  C. Référence du client ............. 3 colonnes, carte 117 × 133, photo 117

Les cotes de la référence sont mesurées sur l'image fournie (1024 px de large)
puis ramenées à 390 pt : marge 37 px, gouttière 19 px, tuile 305 × 347 px,
soit — à l'échelle 390/1024 — marge 14,1 pt, gouttière 7,2 pt, tuile
116,2 × 132,2 pt. Le script travaille avec des valeurs RONDES du système
(marge 12, gouttière 8, tuile 116,7) : c'est ce que le code peut réellement
poser, les jetons n'ayant pas de 7,2.

Sortie : `img/comparatif-tailles.png`.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw

import render_officiel as R

# ─── Géométrie de l'écran de référence ─────────────────────────────────────
SCREEN = 390                      # pt
S = 2                             # rendu ×2
GUTTER = R.S[3]                   # 12 pt — marge d'écran du système
GAP_2 = 14.4                      # 2 colonnes à 48 % : la place qui reste
GAP_3 = R.S[1]                    # 8 pt — gouttière de la référence

CARD_2 = (SCREEN - 2 * GUTTER) * 0.48          # 171,8 pt… arrondi au code : 48 %
INSET = R.S[5]                    # 24 pt de réserve (logos)
CARD_3 = (SCREEN - 2 * GUTTER - 2 * GAP_3) / 3  # 116,7 pt
CARD_3_H = CARD_3 * 8 / 7                       # ratio mesuré 305:347 ≈ 7:8

INK, MUTED, LINE, SURFACE, SHIMMER = R.INK, R.MUTED, R.LINE, R.SURFACE, R.SHIMMER
VIOLET = R.VIOLET
ANNOT = (0xD1, 0x2C, 0x2C)        # rouge de COTATION — hors interface, comme un plan

PANEL_W = int(SCREEN * S)
PAD = 40                          # marge du plan autour des écrans (px)
HEADER = 150                      # titre du plan


def device_card(top: int, height: int) -> Image.Image:
    """Un écran de 390 pt de large, fond blanc, sans chrome (on cote le contenu)."""
    panel = Image.new("RGBA", (PANEL_W, int(height * S)), SURFACE)
    return panel


def tile(d, canvas, x, y, w, h, photo_key, inset=0, title=None, title_size=14):
    """Une tuile : plaque claire, photo (inset pt de réserve), libellé dessous."""
    R.rounded(d, (x, y, x + w, y + h), R.R["lg"], fill=SHIMMER)
    inner = (x + inset, y + inset, x + w - inset, y + h - inset)
    if photo_key:
        R.paste_cover(canvas, os.path.join(R.ASSETS, "aywebs", R.CATEGORY_PHOTO[photo_key]),
                      inner, R.R["md"] if inset else R.R["lg"])
    if title:
        R.text(d, (x, y + h + 8), title, title_size, "bold", INK)


def arrow_h(d, x0, x1, y, label, above=True):
    """Cote horizontale : deux traits + la valeur au milieu."""
    w = max(1, R.px(1.2))
    d.line([R.px(x0), R.px(y), R.px(x1), R.px(y)], fill=ANNOT, width=w)
    for x in (x0, x1):
        d.line([R.px(x), R.px(y - 4), R.px(x), R.px(y + 4)], fill=ANNOT, width=w)
    mid = (x0 + x1) / 2
    tw = R.text_width(label, 11, "bold")
    R.rounded(d, (mid - tw / 2 - 5, y - (16 if above else -6), mid + tw / 2 + 5, y - (4 if above else -18)),
              3, fill=SURFACE)
    R.text(d, (mid, y - (10 if above else 0)), label, 11, "bold", ANNOT, anchor="mm")


def arrow_v(d, x, y0, y1, label):
    w = max(1, R.px(1.2))
    d.line([R.px(x), R.px(y0), R.px(x), R.px(y1)], fill=ANNOT, width=w)
    for y in (y0, y1):
        d.line([R.px(x - 4), R.px(y), R.px(x + 4), R.px(y)], fill=ANNOT, width=w)
    mid = (y0 + y1) / 2
    tw = R.text_width(label, 11, "bold")
    R.rounded(d, (x - tw / 2 - 5, mid - 8, x + tw / 2 + 5, mid + 8), 3, fill=SURFACE)
    R.text(d, (x, mid), label, 11, "bold", ANNOT, anchor="mm")


def row_tiles(d, canvas, y, columns, card_w, card_h, gap, inset, keys, labels, title_size=14):
    """Une rangée de tuiles, centrée sur la colonne utile."""
    total = columns * card_w + (columns - 1) * gap
    x = GUTTER + ((SCREEN - 2 * GUTTER) - total) / 2
    for index in range(columns):
        tile(d, canvas, x + index * (card_w + gap), y, card_w, card_h,
             keys[index % len(keys)], inset=inset,
             title=labels[index % len(labels)] if labels else None, title_size=title_size)
    return x, total


def panel(titre, sous_titre, cotes, build, screen_h=700) -> Image.Image:
    """
    Un panneau = un écran nu + ses cotes + un cartouche de titre.
    `build(d, canvas)` dessine le contenu ; `cotes(d, canvas, top)` les mesures.
    """
    canvas = Image.new("RGBA", (PANEL_W, int(screen_h * S) + HEADER + 40), (0xFA, 0xFA, 0xFB))
    d = ImageDraw.Draw(canvas)

    # cartouche
    R.text(d, (GUTTER, 46), titre, 15, "bold", INK)
    R.text(d, (GUTTER, 70), sous_titre, 12, "regular", MUTED)
    for index, line in enumerate(cotes):
        R.text(d, (GUTTER, 96 + index * 18), line, 12, "regular", ANNOT)

    # écran
    top = HEADER
    R.rounded(d, (-1, top - 1, SCREEN + 1, top + screen_h + 1), R.R["lg"], fill=SURFACE)
    build(d, canvas, top)
    return canvas


# ─── A / B : deux colonnes ─────────────────────────────────────────────────
CATS = ["electronics", "fashion", "shoes", "home", "beauty", "kitchen",
        "home", "shoes", "fashion"]
LABELS = ["High-tech", "Mode", "Chaussures", "Maison", "Beauté", "Audio",
          "Beauté", "Chaussures", "Mode"]


def build_two_columns(inset):
    def draw(d, canvas, top):
        y = top + 56
        row_h = CARD_2 + 30
        for row in range(2):
            x, total = row_tiles(
                d, canvas, y + row * row_h, 2, CARD_2, CARD_2, GAP_2, inset,
                CATS[row * 2: row * 2 + 2], LABELS[row * 2: row * 2 + 2],
            )
        # cotes
        arrow_h(d, GUTTER, GUTTER + CARD_2, y - 22, f"carte {CARD_2:.0f} pt")
        if inset:
            arrow_h(d, GUTTER + inset, GUTTER + CARD_2 - inset, y + CARD_2 + 54,
                    f"photo {CARD_2 - 2 * inset:.0f} pt")
    return draw


# ─── C : trois colonnes ────────────────────────────────────────────────────
def build_three_columns():
    def draw(d, canvas, top):
        y = top + 56
        row_h = CARD_3_H + 30
        for row in range(3):
            row_tiles(
                d, canvas, y + row * row_h, 3, CARD_3, CARD_3_H, GAP_3, 0,
                CATS[row * 3: row * 3 + 3], LABELS[row * 3: row * 3 + 3],
                title_size=12,
            )
        arrow_h(d, GUTTER, GUTTER + CARD_3, y - 22, f"carte {CARD_3:.0f} pt")
        # la cote de hauteur se pose SUR la troisième tuile : dehors, elle sort de l'écran
        arrow_v(d, GUTTER + 3 * CARD_3 + 2 * GAP_3 - 12, y + 6, y + CARD_3_H - 6, f"{CARD_3_H:.0f}")
    return draw


def main() -> int:
    out = os.path.join(R.OUT, "comparatif-tailles.png")

    panels = [
        panel(
            "A. AUJOURD'HUI",
            "2 colonnes · photo 128 pt dans une plaque de 176",
            ["marge 12 · gouttière 14 · ratio 1:1",
             "24 pt de réserve sur chaque bord",
             "→ 61 % de la plaque est une photo"],
            build_two_columns(INSET), screen_h=470,
        ),
        panel(
            "B. RÉSERVE RETIRÉE",
            "2 colonnes · photo sur toute la plaque",
            ["même grille, même rayon 16",
             "0 pt de réserve : la photo remplit",
             "→ 100 % de la plaque est une photo"],
            build_two_columns(0), screen_h=470,
        ),
        panel(
            "C. RÉFÉRENCE CLIENT",
            "3 colonnes · tuile portrait 7:8",
            ["marge 12 · gouttière 8 · ratio 7:8",
             "photo bord à bord, rayon 16",
             "→ 3 boutiques par rangée au lieu de 2"],
            build_three_columns(), screen_h=700,
        ),
    ]

    width = sum(p.width for p in panels) + PAD * (len(panels) + 1)
    table_h = 300
    height = max(p.height for p in panels) + PAD * 2 + 220 + table_h
    board = Image.new("RGBA", (width, height), (0xFA, 0xFA, 0xFB))
    x = PAD
    for item in panels:
        board.paste(item, (x, PAD + 190))
        x += item.width + PAD

    d = ImageDraw.Draw(board)

    def btxt(x_px: float, y_px: float, value: str, size: int, weight: str = "regular", color=INK) -> None:
        """Texte du PLAN en pixels : le plan n'est pas à l'échelle 2×, lui."""
        R.text(d, (x_px / R.SCALE, y_px / R.SCALE), value, size, weight, color)

    btxt(PAD, 36, "AYWEBs — comparatif de tailles, échelle 1:1 sur un écran de 390 pt", 30, "bold", INK)
    btxt(PAD, 96, "Les trois panneaux sont dessinés avec les jetons du dépôt (rayon 16, marge 12, échelle 4·8·12·16·24).", 22, "regular", MUTED)

    # ── Tableau de synthèse : les chiffres que la maquette ne dit pas
    top = max(p.height for p in panels) + PAD + 190 + 24
    columns = ["", "A. AUJOURD'HUI", "B. RÉSERVE RETIRÉE", "C. RÉFÉRENCE CLIENT"]
    rows = [
        ["Colonnes", "2", "2", "3"],
        ["Carte (l × h)", f"{CARD_2:.0f} × {CARD_2:.0f}", f"{CARD_2:.0f} × {CARD_2:.0f}", f"{CARD_3:.0f} × {CARD_3_H:.0f}"],
        ["Photo dans la carte", "128 pt · 61 %", "172 pt · 100 %", "117 pt · 100 %"],
        ["Boutiques par rangée", "2", "2", "3"],
        ["Visibles d'un coup", "4", "4", "9"],
    ]
    col_x = [PAD, PAD + 560, PAD + 560 + 660, PAD + 560 + 1320]
    for index, label in enumerate(columns):
        btxt(col_x[index], top, label, 24, "bold", INK)
    d.line([PAD, top + 40, width - PAD, top + 40], fill=LINE, width=1)
    for row_index, row in enumerate(rows):
        y = top + 70 + row_index * 56
        for column_index, value in enumerate(row):
            weight = "bold" if column_index == 0 else "regular"
            color = MUTED if column_index == 0 else INK
            btxt(col_x[column_index], y, value, 22, weight, color)

    board.convert("RGB").save(out, optimize=True)
    print("✓ comparatif-tailles.png", board.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
