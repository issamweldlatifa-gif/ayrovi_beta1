#!/usr/bin/env python3
"""جدول الاستنساخ: أيقونات فعلية مستخرجة من المواقع الرسمية + أيقوناتنا الست
معادة الرسم بلغة كل ماركة (Apple / Zalando / Amazon)."""
import json, re, os
from PIL import Image

os.chdir('/tmp/brands')

# ---------- الأيقونات الفعلية ----------
# Apple
a = []
for f in ['apple-icons.json']:
    a += json.load(open(f))
seen = set(); apple_real = []
for s in a:
    # نرفض أحجام الشعارات (44/44) — نريد أيقونات واجهة فقط
    if s.get('vb') == '0 0 44 44': continue
    k = re.sub(r'\s+', '', s['svg'])[:200]
    if k in seen: continue
    seen.add(k); apple_real.append(s)
# 5 متنوعة: نتخطى الأشكال المتشابهة
apple_pick, sigs = [], []
for s in apple_real:
    if len(apple_pick) >= 5: break
    ds = re.findall(r'd="([^"]+)"', s['svg'])
    sig = ''.join(ds[:1])[:80]
    if any(abs(len(sig)-len(q)) < 12 and sum(1 for ch, cq in zip(sig, q) if ch == cq) > max(8, int(0.7*min(len(sig), len(q)))) for q in sigs):
        continue
    sigs.append(sig)
    apple_pick.append(s)

# Zalando
z = json.load(open('zalando-icons.json'))
zseen = set(); zalando_real = []
for s in z:
    k = re.sub(r'\s+', '', s['svg'])[:200]
    if k in zseen: continue
    zseen.add(k); zalando_real.append(s)
# 5 متنوعة
zalando_pick, zsigs = [], []
for s in zalando_real:
    if len(zalando_pick) >= 5: break
    ds = re.findall(r'd="([^"]+)"', s['svg'])
    sig = ''.join(ds[:1])[:80]
    if any(abs(len(sig)-len(q)) < 12 and sum(1 for ch, cq in zip(sig, q) if ch == cq) > max(8, int(0.7*min(len(sig), len(q)))) for q in zsigs):
        continue
    zsigs.append(sig)
    zalando_pick.append(s)

# Amazon: قصّ من الـ sprite
im = Image.open('amazon-sprite.png').convert('L')
W, H = im.size
# مناطق (من المعاينة): x, y, w, h
regions = [
    ('cart', 6, 336, 46, 27),
    ('search', 6, 286, 29, 29),
    ('menu', 132, 251, 30, 26),
    ('user', 133, 336, 33, 33),
    ('pin', 67, 302, 25, 28),
]
im_rgba = Image.open('amazon-sprite.png').convert('RGBA')
amazon_crops = []
for name, x, y, w, h in regions:
    box = im_rgba.crop((x, y, x+w, y+h))
    px = box.load()
    for xx in range(w):
        for yy in range(h):
            r, g, b, al = px[xx, yy]
            if al > 120:  # بكسل أيقونة
                px[xx, yy] = (17, 17, 17, 255)
            else:
                px[xx, yy] = (0, 0, 0, 0)
    bb = box.getbbox()
    if bb:
        box = box.crop(bb)
    amazon_crops.append((name, box))

# ---------- أيقوناتنا الست بلغة كل ماركة ----------
# Apple: وزن 2.1، لون #1d1d1f، هندسة نظيفة، بدون نقاط
APPLE = {
    'Menu':   ['M4 7.2h16', 'M4 12h16', 'M4 16.8h16'],
    'Search': ['M10.5 4.6a5.9 5.9 0 1 1 0 11.8 5.9 5.9 0 0 1 0-11.8Z', 'm14.9 14.9 4.9 4.9'],
    'User':   ['M12 4.2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z', 'M5 20.6c.9-4.4 3.6-6.8 7-6.8s6.1 2.4 7 6.8'],
    'Bag':    ['M6.5 8.6h11a2.5 2.5 0 0 1 2.5 2.3l.5 7.4a2.7 2.7 0 0 1-2.7 2.9H5.7a2.7 2.7 0 0 1-2.7-2.9l.5-7.4a2.5 2.5 0 0 1 2.5-2.3Z', 'M9.1 8.6V7a2.9 2.9 0 0 1 5.8 0v1.6'],
    'Heart':  ['M12 19.6S4.6 14.8 4.6 10.5a3.9 3.9 0 0 1 7.4-1.9 3.9 3.9 0 0 1 7.4 1.9c0 4.3-7.4 9.1-7.4 9.1Z'],
    'Home':   ['M4.9 10.9 12 4.3l7.1 6.6v8.7a1.7 1.7 0 0 1-1.7 1.7H6.6a1.7 1.7 0 0 1-1.7-1.7Z', 'M9.7 21.3v-3.9a2.3 2.3 0 0 1 4.6 0v3.9'],
}
# Zalando: وزن 1.5، لون #0f0f0f، هندسة حادة أنحف
ZALANDO = {
    'Menu':   ['M4.5 7.5h15', 'M4.5 12h15', 'M4.5 16.5h15'],
    'Search': ['M10.6 4.9a5.7 5.7 0 1 1 0 11.4 5.7 5.7 0 0 1 0-11.4Z', 'm14.9 14.9 4.6 4.6'],
    'User':   ['M12 4.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z', 'M5.2 20.3c.9-4.2 3.5-6.5 6.8-6.5s5.9 2.3 6.8 6.5'],
    'Bag':    ['M6.8 8.8h10.4a2.3 2.3 0 0 1 2.3 2.1l.5 7.2a2.5 2.5 0 0 1-2.5 2.7H6.5a2.5 2.5 0 0 1-2.5-2.7l.5-7.2a2.3 2.3 0 0 1 2.3-2.1Z', 'M9.2 8.8V7.2a2.8 2.8 0 0 1 5.6 0v1.6'],
    'Heart':  ['M12 19.4S4.8 14.7 4.8 10.6a3.7 3.7 0 0 1 7.2-1.8 3.7 3.7 0 0 1 7.2 1.8c0 4.1-7.2 8.8-7.2 8.8Z'],
    'Home':   ['M5.1 11.2 12 4.8l6.9 6.4v8.3H5.1Z', 'M9.9 21v-3.5a2.1 2.1 0 0 1 4.2 0V21'],
}
# Amazon: وزن 2.3، ممتلئ ودافئ، أشكال مميزة (السيارة المفتوحة بعجلات نقطية)
AMAZON = {
    'Menu':   ['M4 7h16', 'M4 12h16', 'M4 17h16'],
    'Search': ['M10.4 4.4a6.1 6.1 0 1 1 0 12.2 6.1 6.1 0 0 1 0-12.2Z', 'm15 15 4.8 4.8'],
    'User':   ['M12 4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z', 'M4.8 20.8c1-4.6 3.8-7 7.2-7s6.2 2.4 7.2 7'],
    # سلة أمازون المميزة: خط مقبض + انسياب + عجلتان نقطيتان
    'Bag':    ['M4.2 8.4h2.6l2.1 9.6h10.8', 'M6.8 8.4l1.9 9.6', 'M17.9 8.4l1.3 4.9'],
    'Heart':  ['M12 19.8S4.4 14.9 4.4 10.5a4 4 0 0 1 7.6-2 4 4 0 0 1 7.6 2c0 4.4-7.6 9.3-7.6 9.3Z'],
    'Home':   ['M4.7 11 12 4.2l7.3 6.8v9H4.7Z', 'M9.6 20.8v-4a2.4 2.4 0 0 1 4.8 0v4'],
}
AMAZON_DOTS = {
    'Bag': [(10.2, 20.9, 1.7), (17.4, 20.9, 1.7)],
}

INK_A, INK_Z, INK_M = '#1d1d1f', '#0f0f0f', '#111111'

def clone_icon(paths, sw, color, dots=()):
    s = ''.join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>' for d in paths)
    for (x, y, r) in dots:
        s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'
    return s

def brand_block(title, source, real_items, clones, sw, color, dots_map=None, real_is_svg=True, y0=0, h=330):
    out = [f'<g transform="translate(0,{y0})">']
    out.append(f'<rect x="0" y="0" width="1280" height="{h-14}" rx="14" fill="#FAFAF8"/>')
    out.append(f'<text x="24" y="34" font-size="17" font-weight="800" fill="#111">{title}</text>')
    out.append(f'<text x="24" y="52" font-size="11" fill="#666">{source}</text>')
    # الأيقونات الفعلية (5)
    out.append(f'<text x="24" y="78" font-size="11" font-weight="700" fill="#888">الأيقونات الفعلية المستخرجة من الموقع:</text>')
    cx0, cy0, cw = 30, 92, 108
    for i in range(5):
        x = cx0 + i * cw
        out.append(f'<rect x="{x}" y="{cy0}" width="92" height="92" rx="10" fill="#fff" stroke="#e5e5e5"/>')
        if real_is_svg:
            s = real_items[i]
            inner = re.sub(r'<title[^>]*>.*?</title>', '', s['svg'], flags=re.S)
            inner = re.sub(r'<text[^>]*>.*?</text>', '', inner, flags=re.S)
            inner = re.sub(r'^<svg[^>]*>', '<svg x="0" y="0" width="72" height="72">', inner, count=1)
            inner = inner.replace('width="1em" height="1em"', 'width="72" height="72"')
            out.append(f'<g transform="translate({x+10},{cy0+10})">{inner}</g>')
        else:
            nm, box = real_items[i]
            box2 = box.convert('RGBA')
            bb = box2.getbbox()
            if bb: box2 = box2.crop(bb)
            sz = 72
            box2 = box2.resize((sz, sz), Image.LANCZOS)
            import io, base64
            buf = io.BytesIO()
            box2.save(buf, format='PNG')
            uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
            out.append(f'<image x="{x+10}" y="{cy0+10}" width="{sz}" height="{sz}" href="{uri}"/>')
    # أيقوناتنا الست بالنمط
    out.append(f'<text x="590" y="78" font-size="11" font-weight="700" fill="#FF6A00">نفس أيقوناتنا الست بلغة {title.split(" — ")[0]} (Menu · Search · User · Bag · Heart · Home):</text>')
    names = list(clones.keys())
    for i, nm in enumerate(names):
        x = 590 + i * 118
        out.append(f'<rect x="{x}" y="{cy0}" width="100" height="92" rx="10" fill="#fff" stroke="#f0d9c8"/>')
        out.append(f'<g transform="translate({x+14},{cy0+12}) scale(3)">' + clone_icon(clones[nm], sw, color, (dots_map or {}).get(nm, ())) + '</g>')
        out.append(f'<text x="{x+50}" y="{cy0+110}" font-size="11" font-weight="600" fill="#333" text-anchor="middle">{nm}</text>')
    # مقارنة مباشرة: نفس الأيقونة بالمرجع الحالي vs النمط
    out.append('</g>')
    return '\n'.join(out)

CELL = 1280
H = 60 + 3 * 330
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{CELL}" height="{H}" viewBox="0 0 {CELL} {H}" font-family="Inter,Helvetica,Arial,sans-serif">']
svg.append(f'<rect width="{CELL}" height="{H}" fill="#ffffff"/>')
svg.append('<text x="24" y="34" font-size="20" font-weight="800" fill="#111">استنساخ حقيقي من المواقع الرسمية — كل ماركة بلغة مختلفة</text>')
svg.append('<text x="24" y="54" font-size="12" fill="#666">أيقونات فعلية سُحبت من كود الموقع (Apple مباشر، Zalando وAmazon من أرشيف رسمي) + إعادة رسم أيقونات AYROVI الست بلغة كل ماركة</text>')

svg.append(brand_block('Apple', 'مستخرج من apple.com مباشرة (SF Symbols: وزن موحد، هندسة دقيقة، أسود #1d1d1f، بدون زخرفة)', apple_pick, APPLE, 2.1, INK_A, y0=70))
svg.append(brand_block('Zalando', 'مستخرج من en.zalando.de (نظام zds-icon: خط 1.5، هندسة حادة أنحف، أحادي اللون)', zalando_pick, ZALANDO, 1.5, INK_Z, y0=400))
svg.append(brand_block('Amazon', 'مستخرج من sprite الرسمي في amazon.com (أشكال ممتلئة مميزة: سلة مفتوحة بعجلات نقطية، وزن 2.3)', amazon_crops[:5], AMAZON, 2.3, INK_M, dots_map=AMAZON_DOTS, real_is_svg=False, y0=730))

svg.append('<text x="24" y="1255" font-size="11" fill="#999">ملاحظة: Zara وFarfetch يحظران الخوادم (Akamai) — يمكن المحاولة من شبكتك أو لاحقًا.</text>')
svg.append('</svg>')

out_svg = '\n'.join(svg)
html = ('<!DOCTYPE html><html lang="ar" dir="ltr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>'
        '<title>AYROVI — Brand Clone Study</title><style>body{margin:0;background:#fff;padding:12px}.wrap{max-width:1280px;margin:0 auto}</style></head>'
        '<body><div class="wrap">' + out_svg + '</div></body></html>')
open('/home/user/ayrovi_beta1/docs/ayrovi-brand-clones.html', 'w').write(html)
open('/tmp/brand-clones.svg', 'w').write(out_svg)
print('OK')
