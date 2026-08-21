#!/usr/bin/env python3
"""نماذج انحف وأرقى بأسلوب Zalando / Apple — 6 أيقونات × 10 أنماط.
المخرجات: docs/ayrovi-icon-thin-styles.html"""

INK = '#111827'
SIG = '#FF6A00'

# أيقونات بإعادة هندسة نظيفة (شبكة 24) — أرقى من المرجع الحالي
STANDARD = {
    'Menu': {
        'paths': ['M5 7.2h14', 'M5 12h14', 'M5 16.8h14'],
        'dot': [(19.9, 12)],
        'accent': 'M5 12h14',
        'geo': ['M5 7.2h14', 'M5 12h14', 'M5 16.8h14'],
    },
    'Search': {
        'paths': ['M10.8 4.9a5.9 5.9 0 1 1 0 11.8 5.9 5.9 0 0 1 0-11.8Z', 'm15.1 15.1 4.2 4.2'],
        'dot': [(19.9, 19.6)],
        'accent': 'm15.1 15.1 4.2 4.2',
        'geo': ['M10.8 4.9a5.9 5.9 0 1 1 0 11.8 5.9 5.9 0 0 1 0-11.8Z', 'm15.1 15.1 4.2 4.2'],
    },
    'User': {
        'paths': ['M12 4.4a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6Z', 'M5 20.4c.9-4.5 3.6-6.9 7-6.9s6.1 2.4 7 6.9'],
        'dot': [(17.4, 19.7)],
        'accent': 'M5 20.4c.9-4.5 3.6-6.9 7-6.9s6.1 2.4 7 6.9',
        'geo': ['M12 4.4a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6Z', 'M5.2 20.2a6.8 6.8 0 0 1 13.6 0'],
    },
    'Bag': {
        'paths': ['M6.9 9h10.2a2.4 2.4 0 0 1 2.4 2.2l.5 7.4a2.5 2.5 0 0 1-2.5 2.7H6.5a2.5 2.5 0 0 1-2.5-2.7l.5-7.4A2.4 2.4 0 0 1 6.9 9Z',
                  'M9.1 9V7.3a2.9 2.9 0 0 1 5.8 0V9'],
        'dot': [(17.2, 18.2)],
        'accent': 'M9.1 9V7.3a2.9 2.9 0 0 1 5.8 0V9',
        'geo': ['M6.9 9h10.2a2.4 2.4 0 0 1 2.4 2.2l.5 7.4a2.5 2.5 0 0 1-2.5 2.7H6.5a2.5 2.5 0 0 1-2.5-2.7l.5-7.4A2.4 2.4 0 0 1 6.9 9Z',
                'M9.1 9V7.3a2.9 2.9 0 0 1 5.8 0V9'],
    },
    'Heart': {
        'paths': ['M12 19.6S4.6 14.7 4.6 10.4a3.9 3.9 0 0 1 7.4-1.9 3.9 3.9 0 0 1 7.4 1.9c0 4.3-7.4 9.2-7.4 9.2Z'],
        'dot': [(14, 17.6)],
        'accent': 'M12 19.6S4.6 14.7 4.6 10.4a3.9 3.9 0 0 1 7.4-1.9',
        'geo': ['M12 19.5 5.7 12.5a3.8 3.8 0 1 1 6.3-4.4 3.8 3.8 0 1 1 6.3 4.4Z'],
    },
    'Home': {
        'paths': ['M5 19.4V11l7-6.4 7 6.4v8.4H5Z', 'M9.8 19.4v-3.3a2.2 2.2 0 0 1 4.4 0v3.3'],
        'dot': [(14.9, 16.4)],
        'accent': 'M12 4.6l7 6.4',
        'geo': ['M4.9 11.1 12 4.7l7.1 6.4v7.9a1.9 1.9 0 0 1-1.9 1.9H6.8a1.9 1.9 0 0 1-1.9-1.9Z',
                'M9.8 19.5v-3.2a2.2 2.2 0 0 1 4.4 0v3.2'],
    },
}

STYLES = [
    ('1', 'Hairline 1.25 — زلاندو', 'hairline'),
    ('2', 'Thin 1.5 — Apple SF Thin', 'thin'),
    ('3', 'Regular 1.75 — Apple SF', 'regular'),
    ('4', '1.5 + نقطة دقيقة', 'thin-dot'),
    ('5', '1.25 + لمسة برتقالية', 'hairline-accent'),
    ('6', 'Geometric 1.5 — هندسة نظيفة', 'geo'),
    ('7', 'Optical 1.5 — حجم بصري أكبر', 'optical'),
    ('8', 'Ultra-light 1.1', 'ultralight'),
    ('9', '1.5 + ظل 8%', 'tint'),
    ('10', '1.75 + نقطة — موزون', 'regular-dot'),
]

CELL = 132
SCALE = 3.55
COLS = 6
ROWS = len(STYLES)
W = 250 + COLS * CELL
H = 70 + ROWS * CELL


def stroke(key, paths, sw, color, fill='none'):
    return ''.join(f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{sw}" '
                   f'stroke-linecap="round" stroke-linejoin="round"/>' for d in paths)


def dot(key, r=1.35, color=SIG):
    x, y = STANDARD[key]['dot'][0]
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'


def icon_svg(key, style):
    ic = STANDARD[key]
    p = ic['paths']
    if style == 'hairline':
        return stroke(key, p, 1.25, INK)
    if style == 'thin':
        return stroke(key, p, 1.5, INK)
    if style == 'regular':
        return stroke(key, p, 1.75, INK)
    if style == 'thin-dot':
        return stroke(key, p, 1.5, INK) + dot(key, 1.3)
    if style == 'hairline-accent':
        base = [d for d in p if d != ic['accent']]
        return stroke(key, base, 1.25, INK) + stroke(key, [ic['accent']], 1.25, SIG) + dot(key, 1.2)
    if style == 'geo':
        return stroke(key, ic['geo'], 1.5, INK)
    if style == 'optical':
        return f'<g transform="translate(-1.44,-1.44) scale(1.12)">' + stroke(key, p, 1.5, INK) + '</g>'
    if style == 'ultralight':
        return stroke(key, p, 1.1, INK)
    if style == 'tint':
        fill = ''.join(f'<path d="{d}" fill="rgba(17,24,39,0.08)" stroke="none"/>' for d in p)
        return fill + stroke(key, p, 1.5, INK)
    if style == 'regular-dot':
        return stroke(key, p, 1.75, INK) + dot(key, 1.4)
    return ''


def build():
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" font-family="Inter,Helvetica,Arial,sans-serif">']
    parts.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    parts.append(f'<text x="20" y="34" font-size="19" font-weight="700" fill="{INK}">AYROVI — نماذج راقية انحف (Zalando / Apple)</text>')
    parts.append(f'<text x="20" y="54" font-size="12" fill="#666">الهندسة أُعيد رسمها نظيفة — اختر الوزن/النمط المفضل وسيُطبَّق على العائلة كاملة</text>')
    for c, key in enumerate(STANDARD):
        parts.append(f'<text x="{250 + c * CELL + CELL / 2}" y="66" font-size="13" font-weight="700" '
                     f'fill="{INK}" text-anchor="middle">{key}</text>')
    for r, (num, label, style) in enumerate(STYLES):
        y = 84 + r * CELL
        if r % 2 == 0:
            parts.append(f'<rect x="0" y="{y-16}" width="{W}" height="{CELL}" fill="#FAFAF9"/>')
        parts.append(f'<text x="16" y="{y+40}" font-size="13" font-weight="700" fill="{INK}">{num}.</text>')
        parts.append(f'<text x="16" y="{y+60}" font-size="11.5" fill="#555">{label}</text>')
        for c, key in enumerate(STANDARD):
            x = 250 + c * CELL + (CELL - 24 * SCALE) / 2
            parts.append(f'<g transform="translate({x},{y+6}) scale({SCALE})">{icon_svg(key, style)}</g>')
    parts.append('</svg>')
    return '\n'.join(parts)


def main():
    svg = build()
    html = ('<!DOCTYPE html><html lang="ar" dir="ltr"><head><meta charset="utf-8"/>'
            '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
            '<title>AYROVI — Thin Icon Styles</title>'
            '<style>body{margin:0;background:#fff;padding:16px}.wrap{max-width:1180px;margin:0 auto}</style>'
            '</head><body><div class="wrap">' + svg + '</div></body></html>')
    out = '/home/user/ayrovi_beta1/docs/ayrovi-icon-thin-styles.html'
    with open(out, 'w') as f:
        f.write(html)
    print('OK →', out)


if __name__ == '__main__':
    main()
