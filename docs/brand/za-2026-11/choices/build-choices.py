"""Choice boards (18/11/2026) — real « Za. » geometry from assets/brand/zayrovi-2026-11/logo.json.

Renders 4 boards (SVG + PNG) for the owner to pick from:
  1. social icon « z. » (official account avatar, no circles): ink z vs yellow z;
  2. text links once yellow becomes the action colour;
  3. header logo over coloured hero tints (where pure yellow disappears);
  4. Clean logo in yellow + AYWEBs yellow header (preview).
Run: /tmp/brandv/bin/python docs/brand/za-2026-11/choices/build-choices.py   (needs resvg_py)
"""
import json
import pathlib

import resvg_py

ROOT = pathlib.Path(__file__).resolve().parents[4]
OUT = pathlib.Path(__file__).resolve().parent
LOGO = json.loads((ROOT / 'assets/brand/zayrovi-2026-11/logo.json').read_text())['logo']
FONT_DIR = ROOT / 'apps/mobile/assets/fonts'
FONT = "Zayrovi Extracted Sans, Noto Sans Arabic"
Y, INK, WHITE = '#F2AE00', '#0A0A0A', '#FFFFFF'
W = 1600

# « z. » — the z exactly as cut out of the circle (open contour, long lower bar) + the logo's dot after it,
# sitting on the z's baseline with the logo's own a→dot gap.
Z = LOGO['zOpen']
ZX0, ZY0, ZX1, ZY1 = 336.7, 265.4, 1132.9, 728.5
GAP, R = 1470.2 - 1433.4, LOGO['dotCircle']['r']
DOT_CX, DOT_CY = ZX1 + GAP + R, ZY1 - R
ZD_W, ZD_H = DOT_CX + R - ZX0, ZY1 - ZY0


def lum(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def zdot(x, y, h, z_fill, dot_fill=Y):
    """« z. » with its top-left at (x, y), z height h."""
    s = h / ZD_H
    return (f'<g transform="translate({x:.1f} {y:.1f}) scale({s:.5f}) translate({-ZX0} {-ZY0})">'
            f'<path d="{Z}" fill="{z_fill}"/><circle cx="{DOT_CX:.1f}" cy="{DOT_CY:.1f}" r="{R}" fill="{dot_fill}"/></g>')


def zdot_w(h):
    return ZD_W * h / ZD_H


def logo(x, y, h, a_fill, bg=None):
    """Full « Za. » logo, top-left (x, y), height h. The z is a true cut-out: it shows `bg`."""
    s = h / 1000
    return (f'<g transform="translate({x:.1f} {y:.1f}) scale({s:.5f})">'
            f'<path d="{LOGO["ring"]}" fill="{Y}"/><path d="{LOGO["a"]}" fill="{a_fill}"/>'
            f'<path d="{LOGO["dot"]}" fill="{Y}"/></g>')


def logo_w(h):
    return 1586.6 * h / 1000


def text(x, y, s, size=28, fill=INK, weight=400, anchor='start', extra=''):
    s = s.replace('&', '&amp;').replace('<', '&lt;')
    arabic = any('\u0600' <= ch <= '\u06FF' for ch in s)
    family = 'Noto Sans Arabic, Zayrovi Extracted Sans' if arabic else FONT
    if arabic:
        weight = 700 if weight >= 600 else 400
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>')


def rect(x, y, w, h, fill, r=0, stroke=None):
    st = f' stroke="{stroke}" stroke-width="2"' if stroke else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{st}/>'


def badge(x, y, letter):
    return (f'<circle cx="{x}" cy="{y}" r="30" fill="{INK}"/>'
            + text(x, y + 13, letter, 36, WHITE, 700, 'middle'))


def board(name, h, body, title, subtitle):
    head = (rect(0, 0, W, h, '#F4F4F4') + text(64, 96, title, 52, INK, 700)
            + text(64, 146, subtitle, 26, '#555555'))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}">'
           f'{head}{body}</svg>')
    (OUT / f'{name}.svg').write_text(svg)
    png = resvg_py.svg_to_bytes(svg_string=svg, font_files=[str(FONT_DIR / f'ZayroviExtracted-{w}.ttf')
                                                           for w in ('Regular', 'SemiBold', 'Bold')]
                                + [str(FONT_DIR / f'NotoSansArabic-{w}.ttf') for w in ('Regular', 'Bold')],
                                skip_system_fonts=True)
    (OUT / f'{name}.png').write_bytes(bytes(png))
    print('wrote', name)


# ───────────────────────── 1. social icon « z. » ─────────────────────────
def pub_header(x, y, w, bg, ink, sub, z_fill, label):
    h = 150
    out = rect(x, y, w, h, bg, 18, '#DDDDDD' if bg == WHITE else None)
    zh = 30
    out += zdot(x + 32, y + 40, zh, z_fill)
    tx = x + 32 + zdot_w(zh) + 18
    out += text(tx, y + 68, 'zayrovi team', 30, ink, 600) + text(tx + 196, y + 68, '•  Suivi', 28, sub)
    out += text(x + 32, y + 118, 'Sponsorisé  ⓘ', 24, sub)
    out += text(x + w - 24, y + h - 16, label, 18, sub, 400, 'end')
    return out


def board1():
    body = ''
    cols = [(64, 'A', 'z noir (blanc sur fond sombre) + point jaune', lambda dark: WHITE if dark else INK),
            (832, 'B', 'z jaune + point jaune', lambda dark: Y)]
    for x, letter, desc, zf in cols:
        y = 200
        body += badge(x + 30, y + 30, letter) + text(x + 80, y + 42, desc, 30, INK, 700)
        y += 90
        # Big specimen on white and on black
        body += rect(x, y, 704, 260, WHITE, 24, '#DDDDDD') + zdot(x + 352 - zdot_w(120) / 2, y + 70, 120, zf(False))
        y += 280
        body += rect(x, y, 704, 260, INK, 24) + zdot(x + 352 - zdot_w(120) / 2, y + 70, 120, zf(True))
        y += 300
        body += text(x, y, 'Dans la Publication (taille réelle ×2)', 24, '#555555', 600)
        y += 20
        body += pub_header(x, y, 704, WHITE, INK, '#767676', zf(False), 'fond blanc')
        y += 170
        body += pub_header(x, y, 704, '#1E3A5F', WHITE, '#C9D3E0', zf(True), 'bande colorée')
        y += 170
        body += pub_header(x, y, 704, '#2B2B2B', WHITE, '#BDBDBD', zf(True), 'sur vidéo / photo')
        y += 190
        # Story circle / small sizes
        body += text(x, y, 'Petites tailles : 20 · 28 · 40 dp', 24, '#555555', 600)
        y += 24
        body += rect(x, y, 704, 120, WHITE, 18, '#DDDDDD')
        cx = x + 40
        for hh in (20, 28, 40):
            zh = hh * 2 * ZD_H / ZD_W  # icon WIDTH = hh*2 px
            body += zdot(cx, y + 60 - zh / 2, zh, zf(False))
            cx += hh * 2 + 60
        for hh in (20, 28, 40):
            zh = hh * 2 * ZD_H / ZD_W
            body += rect(cx - 16, y + 16, hh * 2 + 32, 88, INK, 14) + zdot(cx, y + 60 - zh / 2, zh, zf(True))
            cx += hh * 2 + 60
    board('1-social-icon-z', 1720, body, '1 · Icône social « z. » — sans cercles',
          'Le z exact découpé dans le logo (barre basse longue) + le point du logo. Choisir A ou B.')


# ───────────────────────── 2. text links ─────────────────────────
def board2():
    gold = '#8A6100'
    opts = [('A', 'Texte noir + soulignement jaune', INK, True, Y),
            ('B', f'Texte or foncé {gold}', gold, False, Y),
            ('C', 'Jaune pur #F2AE00', Y, False, Y)]
    body = ''
    cw = 470
    for i, (letter, desc, color, underline, dark_color) in enumerate(opts):
        x = 64 + i * (cw + 31)
        y = 200
        body += badge(x + 30, y + 30, letter) + text(x + 76, y + 42, desc, 26, INK, 700)
        y += 80
        cr = contrast(color, WHITE)
        ok = 'lisible ✓' if cr >= 4.5 else 'difficile à lire ✗'
        body += text(x, y + 10, f'Contraste sur blanc : {cr:.1f}:1 — {ok}', 22, '#236044' if cr >= 4.5 else '#D92D20', 600)
        y += 34
        # light card
        body += rect(x, y, cw, 470, WHITE, 24, '#DDDDDD')
        body += text(x + 28, y + 66, 'Nouveautés', 34, INK, 700)
        lx = x + cw - 28
        body += text(lx, y + 64, 'Voir tout ›', 24, color, 650, 'end')
        if underline:
            body += rect(lx - 118, y + 72, 118, 4, Y, 2)
        body += rect(x + 28, y + 96, cw - 56, 140, '#F2F2F2', 16)
        body += text(x + 28, y + 290, 'Bienvenue,', 26, INK)
        body += text(x + 172, y + 290, 'se connecter ?', 26, color, 650)
        if underline:
            body += rect(x + 172, y + 298, 178, 4, Y, 2)
        # primary button — same in all options
        body += rect(x + 28, y + 340, cw - 56, 64, Y, 32) + text(x + cw / 2, y + 382, 'Ajouter au panier', 26, INK, 650, 'middle')
        body += text(x + cw / 2, y + 446, 'Bouton principal : jaune + texte noir (partout)', 18, '#767676', 400, 'middle')
        y += 500
        # dark card
        body += rect(x, y, cw, 200, INK, 24)
        body += text(x + 28, y + 66, 'Nouveautés', 34, WHITE, 700)
        body += text(lx, y + 64, 'Voir tout ›', 24, dark_color, 650, 'end')
        body += rect(x + 28, y + 110, cw - 56, 64, Y, 32) + text(x + cw / 2, y + 152, 'Ajouter au panier', 26, INK, 650, 'middle')
        body += text(x, y + 236, 'Mode sombre : liens jaunes dans les 3 cas', 20, '#555555')
    board('2-text-links', 1000, body, '2 · Liens texte quand le jaune devient la couleur d’action',
          'Boutons : jaunes, texte noir. La question porte sur les petits liens (Voir tout, se connecter) sur blanc.')


# ───────────────────────── 3. header over hero tints ─────────────────────────
def header(x, y, w, bg, mode):
    h = 120
    out = rect(x, y, w, h, bg, 0)
    lh = 40
    lx, ly = x + 28, y + (h - lh) / 2
    if mode == 'tile':
        pad = 10
        out += rect(lx - pad, ly - pad, logo_w(lh) + 2 * pad + 6, lh + 2 * pad, INK, 12)
        out += logo(lx + 3, ly, lh, WHITE)
    elif mode == 'pill':
        pad = 10
        out += rect(lx - pad, ly - pad, logo_w(lh) + 2 * pad + 6, lh + 2 * pad, WHITE, 12)
        out += logo(lx + 3, ly, lh, INK)
    else:
        out += logo(lx, ly, lh, INK)
    ink = INK
    out += rect(x + w - 330, y + 38, 180, 44, 'none', 22, ink) + text(x + w - 240, y + 68, 'Plus ★ Light', 20, ink, 600, 'middle')
    out += f'<circle cx="{x + w - 110}" cy="{y + 60}" r="14" fill="none" stroke="{ink}" stroke-width="3"/>'
    out += rect(x + w - 64, y + 46, 30, 30, 'none', 6, ink)
    return out


def board3():
    tints = [('#EAAC73', 'orange (Beauté)'), ('#F970C2', 'rose (Montres)'), ('#C9E3F5', 'ciel (Mode)'), (WHITE, 'blanc (après défilement)')]
    opts = [('now', 'Actuel — le logo disparaît sur l’orange et le rose', None),
            ('tile', 'A · Tuile noire officielle (version « sur noir ») sur les fonds colorés', 'A'),
            ('pill', 'B · Tuile blanche (version « sur blanc ») sur les fonds colorés', 'B')]
    body = ''
    y = 200
    for mode, desc, letter in opts:
        if letter:
            body += badge(94, y + 22, letter)
        body += text(140 if letter else 64, y + 34, desc, 28, '#D92D20' if mode == 'now' else INK, 700)
        y += 60
        for i, (bg, label) in enumerate(tints):
            x = 64 + (i % 2) * 768
            yy = y + (i // 2) * 180
            m = 'plain' if bg == WHITE else ('plain' if mode == 'now' else mode)
            body += header(x, yy, 704, bg, m)
            body += text(x + 4, yy + 150, label, 20, '#555555')
        y += 380
    body += text(64, y + 10, 'A et B : le logo ne change pas — ce sont les 2 versions officielles. Sur blanc : sans tuile.', 24, '#555555')
    board('3-header-logo', y + 60, body, '3 · Logo du header sur les teintes du Hero',
          'Le jaune se perd sur orange / rose. Solution sans toucher au logo : une tuile derrière.')


# ───────────────────────── 4. Clean + AYWEBs ─────────────────────────
CLEAN = ['M12 3H9A8 8 0 0 0 5 18V22L9 19H12Z', 'M12 3H15A8 8 0 0 1 15 19H12Z',
         'M18 9C17.4 13 16.5 13.8 13 14.5C16.5 15.1 17.4 15.9 18 20C18.6 15.9 19.5 15.1 23 14.5C19.5 13.8 18.6 13 18 9Z',
         'M20.5 10A6.5 6.5 0 0 0 15 4.4H9A6.5 6.5 0 0 0 5.9 16.6L6.2 19.4L8.6 17.6H14']


def clean(x, y, size, left, right, shine=WHITE):
    s = size / 24
    return (f'<g transform="translate({x} {y}) scale({s})"><path d="{CLEAN[0]}" fill="{left}"/>'
            f'<path d="{CLEAN[1]}" fill="{right}"/><path d="{CLEAN[2]}" fill="{shine}"/>'
            f'<path d="{CLEAN[3]}" fill="none" stroke="{shine}" stroke-width="0.8" stroke-linecap="round" '
            f'stroke-linejoin="round"/></g>')


def board4():
    body = ''
    y = 200
    opts = [('A', 'Jaune 2 tons (garde la coupure et l’éclat)', Y, '#FFC72E'),
            ('B', 'Jaune uni', Y, Y)]
    body += text(64, y + 30, 'Actuel :', 28, '#767676', 700) + clean(200, y - 10, 64, '#35BED0', '#FF8127')
    y += 90
    for i, (letter, desc, l, r) in enumerate(opts):
        x = 64 + i * 768
        body += badge(x + 30, y + 30, letter) + text(x + 76, y + 42, desc, 28, INK, 700)
        body += rect(x, y + 80, 340, 240, WHITE, 24, '#DDDDDD') + clean(x + 90, y + 120, 160, l, r)
        body += rect(x + 364, y + 80, 340, 240, INK, 24) + clean(x + 454, y + 120, 160, l, r)
        # bottom nav preview
        ny = y + 350
        body += rect(x, ny, 704, 110, WHITE, 0, '#DDDDDD')
        for j in range(5):
            cx = x + 70 + j * 141
            if j == 2:
                body += clean(cx - 26, ny + 29, 52, l, r)
            else:
                body += f'<circle cx="{cx}" cy="{ny + 55}" r="18" fill="none" stroke="{INK}" stroke-width="3"/>'
        body += text(x, ny + 150, 'Barre de navigation (app + site)', 22, '#555555')
    y += 560
    body += text(64, y, 'Icônes de conversation dans Clean :', 28, INK, 700)
    y += 30
    body += rect(64, y, 1472, 170, WHITE, 24, '#DDDDDD')
    body += clean(100, y + 40, 72, Y, '#FFC72E') + rect(196, y + 46, 520, 60, '#F2F2F2', 30) + text(226, y + 86, 'Bonjour ! Je cherche pour vous…', 24, INK)
    body += rect(860, y + 46, 520, 60, '#FFF3CC', 30) + text(890, y + 86, 'Un casque sans fil, svp', 24, INK) + clean(1400, y + 40, 72, INK, '#3A3A3A')
    body += text(100, y + 150, 'Clean = jaune', 20, '#555555') + text(1400, y + 150, 'Client = noir', 20, '#555555')
    y += 220
    body += text(64, y, 'Header AYWEBs : du bleu au jaune', 28, INK, 700)
    y += 30
    body += rect(64, y, 1472, 200, Y, 24)
    body += text(110, y + 80, 'AYWEBs', 46, INK, 800) + rect(1360, y + 50, 40, 40, 'none', 8, INK)
    body += f'<circle cx="1300" cy="{y + 70}" r="18" fill="none" stroke="{INK}" stroke-width="3"/>'
    body += rect(110, y + 112, 1380, 64, WHITE, 32) + text(150, y + 154, 'Rechercher sur Amazon, Shein, AliExpress…', 24, '#767676')
    y += 230
    body += text(64, y + 10, 'Sur jaune : texte et icônes en noir (le blanc sur jaune est illisible).', 24, '#555555')
    board('4-clean-aywebs', y + 60, body, '4 · Clean en jaune + header AYWEBs en jaune',
          'Choisir A ou B pour Clean. Le header est un aperçu.')


board1()
board2()
board3()
board4()
