"""Brand board for the official « Za. » logo (v9). Reads the master (assets/brand/zayrovi-2026-11/logo.json) and
writes ZAYROVI-Za-brandbook.svg — every drawing is the master geometry, nothing is redrawn.
Run: python3 docs/brand/za-2026-11/build-brandbook.py  (PNG preview: any SVG renderer, e.g. resvg)."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[3]
M = json.loads((ROOT / 'assets/brand/zayrovi-2026-11/logo.json').read_text())
L, C = M['logo'], M['colors']
Y, K, W = C['yellow'], C['ink'], C['white']
LW = L['width']
FONT = "font-family='Zayrovi Extracted Sans, Helvetica Neue, Arial, sans-serif'"

def logo(x, y, h, tone='light', mono=None):
    s = h / 1000
    a = mono or (W if tone == 'dark' else K)
    d = mono or Y
    return (f"<g transform='translate({x:.1f} {y:.1f}) scale({s:.5f})'><path fill='{d}' d='{L['ring']}'/>"
            f"<path fill='{a}' d='{L['a']}'/><path fill='{d}' d='{L['dot']}'/></g>")
def mark(cx, cy, r, color=Y):
    s = r / 500
    return f"<path transform='translate({cx - r:.1f} {cy - r:.1f}) scale({s:.5f})' fill='{color}' d='{M['mark']['d']}'/>"
def text(x, y, t, size=14, color=K, weight=400, anchor='start'):
    return f"<text x='{x}' y='{y}' {FONT} font-size='{size}' font-weight='{weight}' fill='{color}' text-anchor='{anchor}'>{t}</text>"
def card(x, y, w, h, fill, stroke='#E5E5E5', rx=20):
    return f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{rx}' fill='{fill}' stroke='{stroke}'/>"

Wd, Ht = 1600, 2240
o = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{Wd}' height='{Ht}' viewBox='0 0 {Wd} {Ht}'>",
     f"<rect width='{Wd}' height='{Ht}' fill='{W}'/>"]
o += [text(80, 110, 'ZAYROVI — Identité « Za. »', 44, K, 700), text(80, 150, 'Logo officiel v9 · 18/11/2026 · un seul master, deux versions, aucune déformation', 18, '#666666')]

# 01 Versions
o += [text(80, 230, '01 — Les deux versions officielles', 22, K, 700)]
o += [card(80, 260, 700, 380, W), logo(80 + (700 - 1.6 * 200) / 2 - 10, 350, 200, 'light'),
      text(110, 610, 'Sur fond clair : z blanc (évidé) · a noir · cercle et point jaunes', 15, '#333333')]
o += [card(820, 260, 700, 380, K, K), logo(820 + (700 - 1.6 * 200) / 2 - 10, 350, 200, 'dark'),
      text(850, 610, 'Sur fond sombre : z noir (évidé) · a blanc · cercle et point jaunes', 15, '#BDBDBD')]

# 02 Construction / z rule + clear space
o += [text(80, 720, '02 — Construction, zone de protection, règle du z', 22, K, 700)]
o += [card(80, 750, 1440, 420, '#F7F7F7', '#E5E5E5')]
h = 240; s = h / 1000; x0, y0 = 300, 840
pad = M['logo']['dotCircle']['r'] * 2 * s  # clear space = dot diameter
o += [f"<rect x='{x0 - pad:.1f}' y='{y0 - pad:.1f}' width='{LW * s + 2 * pad:.1f}' height='{h + 2 * pad:.1f}' fill='none' stroke='#0A63F5' stroke-dasharray='6 6'/>",
      f"<rect x='{x0:.1f}' y='{y0:.1f}' width='{LW * s:.1f}' height='{h}' fill='none' stroke='#9BBDF9' stroke-width='1'/>",
      logo(x0, y0, h, 'light')]
bar_x = 985.8 * s + x0; bar_y = (618.4 + 728.5) / 2 * s + y0
o += [f"<circle cx='{bar_x:.1f}' cy='{bar_y:.1f}' r='22' fill='none' stroke='#D92D20' stroke-width='3'/>",
      text(900, 850, 'Le z est TOUJOURS évidé : il prend la couleur du fond.', 17, K, 600),
      text(900, 880, 'Sa barre basse sort toujours du cercle (cercle rouge) —', 16, '#333333'),
      text(900, 905, 'elle n’est jamais refermée à l’intérieur.', 16, '#333333'),
      text(900, 960, 'Zone de protection (pointillés bleus) : le diamètre du point', 16, '#333333'),
      text(900, 985, 'tout autour — aucun texte, bord ou image dedans.', 16, '#333333'),
      text(900, 1040, 'Le a reste détaché du cercle (un espace, jamais de contact).', 16, '#333333'),
      text(900, 1095, 'Proportions fixes : largeur = 1,587 × hauteur.', 16, '#333333')]

# 03 Sizes & symbol
o += [text(80, 1250, '03 — Tailles et symbole seul', 22, K, 700), card(80, 1280, 1440, 300, W)]
xx = 130
for hh, label in [(40, 'Connexion 40'), (32, 'Accueil 32'), (28, 'En-têtes 28'), (20, 'Minimum 20')]:
    o += [logo(xx, 1380 - hh / 2, hh, 'light'), text(xx, 1450, label, 14, '#666666')]
    xx += LW * hh / 1000 + 110
o += [f"<line x1='{xx}' y1='1310' x2='{xx}' y2='1550' stroke='#E5E5E5'/>"]
xx += 60
for r, label in [(30, 'Avatar'), (16, 'Favicon'), (10, 'Notification')]:
    o += [mark(xx + 30, 1380, r, Y if label != 'Notification' else '#666666'), text(xx, 1450, label, 14, '#666666')]
    xx += 150
o += [text(130, 1530, 'Sous 20 px de haut, le a se ferme : on utilise le symbole seul (cercle jaune + z évidé).', 15, '#333333')]

# 04 Placements
o += [text(80, 1660, '04 — Applications', 22, K, 700)]
# app icon
o += [f"<rect x='80' y='1690' width='220' height='220' rx='48' fill='{K}'/>", logo(80 + (220 - LW * 0.09) / 2, 1690 + 110 - 45, 90, 'dark'), text(80, 1940, 'Icône d’application', 14, '#666666')]
# phone header light
o += [card(340, 1690, 380, 220, W), f"<rect x='340' y='1690' width='380' height='56' rx='20' fill='{W}' stroke='#E5E5E5'/>", logo(360, 1702, 32, 'light'),
      text(360, 1790, 'En-tête d’accueil : version claire, 32 px', 14, '#666666')]
# splash
o += [f"<rect x='760' y='1690' width='160' height='220' rx='20' fill='{K}'/>", logo(760 + (160 - LW * 0.05) / 2, 1800 - 25, 50, 'dark'), text(760, 1940, 'Ouverture', 14, '#666666')]
# email band
o += [card(960, 1690, 300, 220, W), f"<rect x='960' y='1690' width='300' height='70' rx='20' fill='{K}'/>", logo(960 + (300 - LW * 0.036) / 2, 1707, 36, 'dark'),
      text(980, 1800, 'E-mails : bandeau noir', 14, '#666666')]
# invoice
o += [card(1300, 1690, 220, 220, W), logo(1320, 1710, 28, 'light'), f"<rect x='1320' y='1750' width='180' height='3' fill='{K}'/>",
      text(1320, 1800, 'Factures', 14, '#666666')]

# 05 Colours + misuse
o += [text(80, 2010, '05 — Couleurs', 22, K, 700)]
for i, (name, hexv, role) in enumerate([('Jaune ZAYROVI', Y, 'cercle + point du logo, uniquement'), ('Encre', K, 'texte, boutons, fonds sombres'), ('Blanc', W, 'toile, a sur fond sombre'), ('Bleu d’action', '#0A63F5', 'liens et action principale')]):
    x = 80 + i * 370
    o += [f"<rect x='{x}' y='2040' width='60' height='60' rx='12' fill='{hexv}' stroke='#E5E5E5'/>", text(x + 76, 2064, name, 16, K, 600), text(x + 76, 2088, f'{hexv} · {role}', 13, '#666666')]
o += [text(80, 2170, 'Interdits : étirer ou pencher le logo · recolorer le cercle (hors masques monochromes) · refermer le z dans le cercle ·', 15, '#D92D20'),
      text(80, 2195, 'coller le a au cercle · poser le jaune sur un fond jaune ou photo chargée sans voile · ajouter ombres, contours ou dégradés.', 15, '#D92D20')]
o.append('</svg>')
(pathlib.Path(__file__).parent / 'ZAYROVI-Za-brandbook.svg').write_text('\n'.join(o))
print('ZAYROVI-Za-brandbook.svg written')
