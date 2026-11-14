"""Reconstruct the supplied raster contours, not a replacement font or AI redraw.

v7 (14 Nov 2026): the zebra-striped Z replaces the heart-handshake symbol.
- `symbol`      : the white stripes of the supplied black-background Z (source/z-zebra-black.jpeg),
                  re-centred on their own bounding box (the supplied file sat ~70 px left / ~150 px right).
- `symbolSolid` : the Z silhouette with no stripes (Android notification icon, tiny sizes). It is the
                  union of the convex hulls of the three strokes (top bar, diagonal, bottom bar), so every
                  stripe is inside it and the outer edges stay straight instead of following stripe ends.
- `wordmark`    : the supplied lowercase zayrovi, unchanged algorithm/source.
The second supplied file (source/z-zebra-white.jpg) has a different stripe drawing; it is kept as the
reference for the light rendering, which is produced from the SAME master in ink on white so both
versions are one identity.

Optional tools: pip install -r scripts/requirements-brand.txt. Then run npm run brand:build.
The committed contour JSON is the stable master for normal JS builds.
"""
import hashlib
import json
import re
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps
import vtracer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/brand/zayrovi-2026-11'
UPSCALE = 3  # trace a 3x Lanczos-resampled, lightly smoothed mask: smoother curves than the 960 px JPEG
# Z geometry measured on z-zebra-black.jpeg (source pixels, continuous edges). The silhouette is drawn
# analytically, not traced: straight bars and parallel diagonal edges, semicircular caps (r = half the bar
# height) at the two free ends, and at the two corners where the diagonal leaves a bar a circle tangent to
# the bar edge, the outer side and the diagonal edge (the measured diagonal edges sit ~9 px outside exact
# tangency with an r = 90.5 cap, so this corner radius comes out ~100 and the join has no step or dent).
TOP_BAR = (93, 169, 813, 350)        # x0, y0, x1, y1
BOTTOM_BAR = (70, 760, 788, 941)
DIAGONAL_SLOPE = -0.895              # dx/dy, both diagonal edges (measured 41.8 degrees)
DIAGONAL_RIGHT_B = 1086.1            # right edge: x = DIAGONAL_SLOPE * y + B (outer envelope, rows 420-700)
DIAGONAL_LEFT_B = 787.0              # left edge

def trace(mask: Image.Image, precision: int):
    """Binary mask (white = shape), already cropped -> path data normalised to height 1000."""
    with tempfile.TemporaryDirectory() as tmp:
        png, svg = Path(tmp) / 'mask.png', Path(tmp) / 'trace.svg'
        ImageOps.invert(mask).save(png)
        vtracer.convert_image_to_svg_py(str(png), str(svg), colormode='binary', mode='spline', filter_speckle=8,
            corner_threshold=60, length_threshold=4, max_iterations=10, splice_threshold=45, path_precision=2)
        tree = ET.parse(svg)
        pen = SVGPathPen(None, ntos=lambda n: str(round(n, precision) + 0).removesuffix('.0'))  # +0: no '-0'
        scale = 1000 / mask.height
        for path in tree.iter('{http://www.w3.org/2000/svg}path'):
            translate = re.fullmatch(r'translate\(([-\d.]+),([-\d.]+)\)', path.get('transform', 'translate(0,0)'))
            if translate is None:
                raise ValueError('Unexpected VTracer transform')
            tx, ty = map(float, translate.groups())
            parse_path(path.attrib['d'], TransformPen(pen, (scale, 0, 0, scale, tx * scale, ty * scale)))
    width = round(mask.width * scale, 2)
    return {'width': width, 'height': 1000, 'viewBox': f'0 0 {width} 1000', 'd': pen.getCommands()}


def solid_z_geometry():
    """Outline segments of the solid Z in source pixels: ('L', point) or ('A', radius, point)."""
    a = DIAGONAL_SLOPE
    norm = np.hypot(1.0, a)
    n = np.array([1.0, -a]) / norm  # outward normal of the right diagonal edge (points right/down)
    tx0, ty0, tx1, ty1 = TOP_BAR
    bx0, by0, bx1, by1 = BOTTOM_BAR
    r_top, r_bottom = (ty1 - ty0) / 2, (by1 - by0) / 2
    # Top-right corner circle: tangent to y = ty0, x = tx1 and the right diagonal edge.
    #   centre inside (left of) the edge:  (tx1 - R) - a (ty0 + R) - B_right = -R * norm
    r1 = (tx1 - a * ty0 - DIAGONAL_RIGHT_B) / (1 + a - norm)
    c1 = np.array([tx1 - r1, ty0 + r1])
    # Bottom-left corner circle: tangent to y = by1, x = bx0 and the left diagonal edge.
    #   centre inside (right of) the edge: (bx0 + R) - a (by1 - R) - B_left = R * norm
    r2 = (bx0 - a * by1 - DIAGONAL_LEFT_B) / (norm - 1 - a)
    c2 = np.array([bx0 + r2, by1 - r2])
    assert 0 < r1 < ty1 - ty0 and 0 < r2 < by1 - by0, (r1, r2)
    edge = lambda b, y: (a * y + b, y)
    return [
        ('M', (tx0 + r_top, ty0)),
        ('L', (c1[0], ty0)),
        ('A', r1, tuple(c1 + r1 * n)),
        ('L', edge(DIAGONAL_RIGHT_B, by0)),
        ('L', (bx1 - r_bottom, by0)),
        ('A', r_bottom, (bx1 - r_bottom, by1)),
        ('L', (c2[0], by1)),
        ('A', r2, tuple(c2 - r2 * n)),
        ('L', edge(DIAGONAL_LEFT_B, ty1)),
        ('L', (tx0 + r_top, ty1)),
        ('A', r_top, (tx0 + r_top, ty0)),
    ], (r1, r2)


def solid_z_path(origin, scale):
    """Exact SVG path data (clockwise arcs, all < 180 degrees or exact semicircles)."""
    fmt = lambda v: str(round(v, 2) + 0).removesuffix('.0')
    pt = lambda p: f'{fmt((p[0] - origin[0]) * scale)} {fmt((p[1] - origin[1]) * scale)}'
    out = []
    for seg in solid_z_geometry()[0]:
        if seg[0] == 'A':
            r = fmt(seg[1] * scale)
            out.append(f'A{r} {r} 0 0 1 {pt(seg[2])}')
        else:
            out.append(f'{seg[0]}{pt(seg[1])}')
    return ''.join(out) + 'Z'


def solid_z_points():
    """The outline as a dense polygon in source pixels (arcs sampled every ~0.7 degrees)."""
    points, current = [], None
    for seg in solid_z_geometry()[0]:
        if seg[0] == 'A':
            r, end = seg[1], np.array(seg[2])
            # centre on the right of the chord for a clockwise (sweep=1) minor arc in y-down space
            mid, chord = (current + end) / 2, end - current
            h = np.sqrt(max(r * r - (np.linalg.norm(chord) / 2) ** 2, 0.0))
            centre = mid + h * np.array([-chord[1], chord[0]]) / np.linalg.norm(chord)
            a0 = np.arctan2(*(current - centre)[::-1])
            a1 = np.arctan2(*(end - centre)[::-1])
            if a1 <= a0:
                a1 += 2 * np.pi
            for t in np.linspace(a0, a1, 200)[1:]:
                points.append(centre + r * np.array([np.cos(t), np.sin(t)]))
            current = end
        else:
            current = np.array(seg[1], float)
            points.append(current)
    return points


def solid_z_mask(size, origin, k):
    """Rasterise the same outline in the k-times crop frame."""
    sub = 16
    points = solid_z_points()
    poly = np.array([[(x - origin[0]) * k * sub, (y - origin[1]) * k * sub] for x, y in points]).round()
    mask = np.zeros((size[1], size[0]), np.uint8)
    cv2.fillPoly(mask, [poly.astype(np.int32)], 255, cv2.LINE_AA, 4)
    return np.where(mask > 127, 255, 0).astype(np.uint8)


def source_info(filename: str, crop):
    source = DEST / 'source' / filename
    return {'source': f'source/{filename}', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'crop': list(crop)}


result = {'version': '7.0', 'description': 'Zebra-striped Z (supplied black-background master, re-centred) '
          '+ supplied lowercase zayrovi, no divider. Raster-derived contours; not an original vector or font '
          'identification.'}

# ---- Z: stripes + solid silhouette --------------------------------------------------------------
z_file = 'z-zebra-black.jpeg'
grey = Image.open(DEST / 'source' / z_file).convert('L')
crop = grey.point(lambda p: 255 if p > 128 else 0).getbbox()
x0, y0, x1, y1 = crop
big = grey.crop(crop).resize(((x1 - x0) * UPSCALE, (y1 - y0) * UPSCALE), Image.LANCZOS)
stripes = big.filter(ImageFilter.GaussianBlur(2)).point(lambda p: 255 if p > 128 else 0)
solid = solid_z_mask(stripes.size, (x0, y0), UPSCALE)
on = np.array(stripes) > 0
outside = int((on & (solid == 0)).sum())
assert outside < 0.005 * on.sum(), f'{outside} stripe pixels fall outside the measured silhouette'
# Clip the stripes to the silhouette: crisp outer edge, identical for the striped and solid marks.
stripes = Image.fromarray(np.where(on & (solid > 0), 255, 0).astype(np.uint8))
result['symbol'] = {**trace(stripes, 0), **source_info(z_file, crop)}
scale = 1000 / (y1 - y0)
result['symbolSolid'] = {'width': result['symbol']['width'], 'height': 1000,
                         'viewBox': result['symbol']['viewBox'], 'd': solid_z_path((x0, y0), scale),
                         'construction': 'analytic: bars + parallel diagonal + caps r=%.1f, corner circles r=%.1f/%.1f'
                         % ((TOP_BAR[3] - TOP_BAR[1]) / 2, *solid_z_geometry()[1]),
                         # Farthest outline point from the centre of the box, in symbol units: lets every
                         # circular placement (loader ring, Android safe zone, round avatars) fit the Z exactly.
                         'maxRadius': round(float(max(np.hypot(px - (x0 + x1) / 2, py - (y0 + y1) / 2)
                                                      for px, py in solid_z_points())) * scale, 1),
                         **source_info(z_file, crop)}

# ---- Wordmark (unchanged since v6) --------------------------------------------------------------
w_file = 'wordmark.jpg'
image = Image.open(DEST / 'source' / w_file).convert('L')
mask = image.point(lambda p: 255 if p < 100 else 0)
mask.paste(0, (0, 0, 30, mask.height))  # exclude the unrelated orange sliver at the left edge of the JPEG
w_crop = mask.getbbox()
result['wordmark'] = {**trace(mask.crop(w_crop), 2), **source_info(w_file, w_crop)}

(DEST / 'logo.json').write_text(json.dumps(result, indent=2) + '\n')
print('Raster-derived contour master v7 written; rebuild runtime assets with npm run brand:build.')
