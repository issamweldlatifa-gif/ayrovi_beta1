#!/usr/bin/env python3
"""يولّد 10 نماذج (أنماط) لتصميم عائلة أيقونات AYROVI — 5 أيقونات × 10 أنماط.
المخرجات: docs/ayrovi-icon-styles.html + /tmp/icon-styles.png"""
import re
from pathlib import Path

INK = '#111827'
SIG = '#FF6A00'

# الأشكال الأساسية (شبكة 24)
ICONS = {
    'Menu': {
        'paths': ['M4.5 8h11', 'M4.5 12h11', 'M4.5 16h11'],
        'dots': [(18.6, 8), (18.6, 12), (18.6, 16)],
        'solid': 'M4 6.8h11.5v2.6H4zM4 10.7h11.5v2.6H4zM4 14.6h11.5v2.6H4z',
        'pixels': [
            '............', '............', '###o........', '............',
            '............', '###o........', '............', '............',
            '###o........', '............', '............', '............'],
    },
    'User': {
        'paths': ['M12 4.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z',
                  'M4.8 20.4c.8-4.1 3.5-6.3 7.2-6.3s6.4 2.2 7.2 6.3'],
        'dots': [(16.9, 19.6)],
        'solid': 'M12 4.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2ZM4.8 20.4a7.2 7.2 0 0 1 14.4 0Z',
        'pixels': [
            '...####.....', '...####.....', '...####.....', '...####.....',
            '............', '..######....', '.########...', '.#######o...',
            '............', '............', '............', '............'],
    },
    'Bag': {
        'paths': ['M6.6 8.8h10.8a2.3 2.3 0 0 1 2.3 2.2l.45 8.1a2.35 2.35 0 0 1-2.35 2.45H6.2a2.35 2.35 0 0 1-2.35-2.45l.45-8.1a2.3 2.3 0 0 1 2.3-2.2Z',
                  'M8.7 8.8V6.7a3.3 3.3 0 0 1 6.6 0v2.1'],
        'dots': [(16.7, 17.6)],
        'solid': 'M6.6 8.8h10.8a2.3 2.3 0 0 1 2.3 2.2l.45 8.1a2.35 2.35 0 0 1-2.35 2.45H6.2a2.35 2.35 0 0 1-2.35-2.45l.45-8.1a2.3 2.3 0 0 1 2.3-2.2Z',
        'pixels': [
            '............', '...####.....', '..#....#....', '############',
            '#..........#', '#..........#', '#.........o#', '#..........#',
            '############', '............', '............', '............'],
    },
    'Heart': {
        'paths': ['M12 19.4S4.6 14.2 4.6 9.6A3.85 3.85 0 0 1 12 8.1a3.85 3.85 0 0 1 7.4 1.5c0 4.6-7.4 9.8-7.4 9.8Z'],
        'dots': [(13.8, 17.7)],
        'solid': 'M12 19.4S4.6 14.2 4.6 9.6A3.85 3.85 0 0 1 12 8.1a3.85 3.85 0 0 1 7.4 1.5c0 4.6-7.4 9.8-7.4 9.8Z',
        'pixels': [
            '............', '.##....##...', '##########..', '############',
            '############', '..########..', '...######o..', '....####....',
            '.....##.....', '............', '............', '............'],
    },
    'Home': {
        'paths': ['M4.7 19.5V10.9L12 4.5l7.3 6.4v8.6H4.7Z',
                  'M9.7 19.5v-3.7a2.3 2.3 0 0 1 4.6 0v3.7'],
        'dots': [(14.5, 16.7)],
        'solid': 'M4.7 19.5V10.9L12 4.5l7.3 6.4v8.6H4.7ZM9.9 19.5v-3.5a2.1 2.1 0 0 1 4.2 0v3.5H9.9Z',
        'pixels': [
            '.....##.....', '....####....', '...######...', '..########..',
            '############', '#..........#', '#...####...#', '#..##..##o.#',
            '############', '............', '............', '............'],
    },
}

STYLES = [
    ('1', 'Signature AYROVI (المرجع)', 'signature'),
    ('2', 'Duotone (تعبئة خفيفة)', 'duotone'),
    ('3', 'Solid (معبّأة)', 'solid'),
    ('4', 'Orange (برتقالي)', 'orange'),
    ('5', 'Bold (خط 2.8px)', 'bold'),
    ('6', 'Light (خط 1.3px)', 'light'),
    ('7', 'Badge (داخل شارة)', 'badge'),
    ('8', 'Gradient (تدرّج)', 'gradient'),
    ('9', 'Pixel (بكسلي)', 'pixel'),
    ('10', 'Double (خط مزدوج)', 'double'),
]

CELL = 150
SCALE = 4.6  # 24 → ~110px
COLS = 5
ROWS = len(STYLES)
W = COLS * CELL + 260
H = ROWS * CELL + 60


def stroke_icon(key, sw, color):
    ic = ICONS[key]
    s = ''.join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" '
               f'stroke-linecap="round" stroke-linejoin="round"/>' for d in ic['paths'])
    return s


def dots(key, r=1.85):
    return ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{SIG}"/>' for x, y in ICONS[key]['dots'])


def icon_svg(key, style):
    ic = ICONS[key]
    if style == 'signature':
        return stroke_icon(key, 2, INK) + dots(key)
    if style == 'duotone':
        fill = ''.join(f'<path d="{d}" fill="rgba(17,24,39,0.13)" stroke="none"/>' for d in ic['paths'])
        return fill + stroke_icon(key, 2, INK) + dots(key)
    if style == 'solid':
        return f'<path d="{ic["solid"]}" fill="{INK}" fill-rule="evenodd" stroke="none"/>' + dots(key, 2.0)
    if style == 'orange':
        return stroke_icon(key, 2, SIG) + dots(key, 1.6)
    if style == 'bold':
        return stroke_icon(key, 2.8, INK) + dots(key)
    if style == 'light':
        return stroke_icon(key, 1.3, INK) + dots(key, 1.5)
    if style == 'badge':
        inner = f'<g transform="translate(3.4,3.4) scale(0.72)">' + stroke_icon(key, 2, INK) + '</g>'
        return f'<rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#FFF1E6"/>' + inner
    if style == 'gradient':
        return stroke_icon(key, 2, 'url(#ayGrad)') + dots(key, 1.6)
    if style == 'pixel':
        cells = ''
        for ry, row in enumerate(ic['pixels']):
            for rx, ch in enumerate(row):
                if ch == '#':
                    cells += f'<rect x="{rx}" y="{ry}" width="1.06" height="1.06" fill="{INK}"/>'
                elif ch == 'o':
                    cells += f'<rect x="{rx}" y="{ry}" width="1.06" height="1.06" fill="{SIG}"/>'
        return f'<g transform="scale(2) translate(0.2,0.2)">{cells}</g>'
    if style == 'double':
        main = stroke_icon(key, 2, INK)
        ghost = f'<g transform="translate(3.36,3.36) scale(0.72)" opacity="0.35">' + stroke_icon(key, 2, INK) + '</g>'
        return ghost + main + dots(key, 1.5)
    return ''


def build():
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" font-family="Inter,Helvetica,Arial,sans-serif">']
    parts.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    parts.append('<defs><linearGradient id="ayGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">'
                 f'<stop offset="0" stop-color="{SIG}"/><stop offset="1" stop-color="{INK}"/>'
                 '</linearGradient></defs>')
    parts.append(f'<text x="20" y="34" font-size="20" font-weight="700" fill="{INK}">AYROVI Icon Styles — 10 نماذج للاختيار</text>')
    # ترويسة الأعمدة
    for c, key in enumerate(ICONS):
        parts.append(f'<text x="{260 + c * CELL + CELL / 2}" y="56" font-size="14" font-weight="700" '
                     f'fill="{INK}" text-anchor="middle">{key}</text>')
    for r, (num, label, style) in enumerate(STYLES):
        y = 70 + r * CELL
        if r % 2 == 0:
            parts.append(f'<rect x="0" y="{y-14}" width="{W}" height="{CELL}" fill="#FAFAF9"/>')
        parts.append(f'<text x="16" y="{y+38}" font-size="13" font-weight="700" fill="{INK}">{num}.</text>')
        parts.append(f'<text x="16" y="{y+58}" font-size="11.5" fill="#555">{label}</text>')
        for c, key in enumerate(ICONS):
            x = 260 + c * CELL + (CELL - 24 * SCALE) / 2
            parts.append(f'<g transform="translate({x},{y+4}) scale({SCALE})">{icon_svg(key, style)}</g>')
            # خلفية خفيفة لكل خلية
    parts.append('</svg>')
    return '\n'.join(parts)


def main():
    svg = build()
    out = Path('/home/user/ayrovi_beta1/docs/ayrovi-icon-styles.html')
    html = ('<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"/>'
            '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
            '<title>AYROVI Icon Styles — 10 نماذج</title>'
            '<style>body{margin:0;background:#fff;padding:16px}'
            '.wrap{max-width:1240px;margin:0 auto}</style></head><body><div class="wrap">'
            + svg + '</div></body></html>')
    out.write_text(html, encoding='utf-8')
    # PNG
    open('/tmp/icon-styles.svg', 'w').write(svg)
    print('HTML →', out)


if __name__ == '__main__':
    main()
