"""Reconstruct the supplied raster contours, not a replacement font or AI redraw.

v8 (15 Nov 2026): the owner's new zebra Z (source/z-zebra-black-v8.jpg, 1190 x 896, black background)
replaces the v7 drawing.
- `symbol`      : the white stripes of the supplied Z, cropped to their own bounding box.
- `symbolSolid` : the Z silhouette with no stripes (Android notification icon, tiny sizes). It is derived
                  from the SAME pixels: the convex hull of the top bar, of the bottom bar and of thin
                  horizontal slices of the diagonal, united (shapely), lightly smoothed and simplified into
                  a straight-edged polygon. Every stripe is clipped to it, so both marks share one outline.
- `wordmark`    : the supplied lowercase zayrovi, unchanged algorithm/source.

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
from shapely.geometry import MultiPoint, Polygon
from shapely.ops import unary_union
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/brand/zayrovi-2026-11'
UPSCALE = 3  # trace a 3x Lanczos-resampled, lightly smoothed mask: smoother curves than the JPEG
# Row bands of the v8 drawing, in source pixels (y grows downwards). Exclusive ends; they only touch.
TOP_BAR_END = 368        # the top bar's flat lower edge is row 367
BOTTOM_BAR_START = 686   # the bottom bar's flat upper edge is row 686
DIAGONAL_SLICE = 12      # rows per convex slice of the diagonal: bridges stripe ends, keeps the edge straight
SMOOTH_PX = 6            # close/open radius that removes the slice steps
SIMPLIFY_PX = 1.5        # Douglas-Peucker tolerance of the final outline

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


def band_hull(on: np.ndarray, y_start: int, y_end: int):
    """Convex hull of the white pixels of rows [y_start, y_end), pixel squares as corners."""
    ys, xs = np.nonzero(on[y_start:y_end])
    if xs.size == 0:
        return None
    ys = ys + y_start
    corners = np.concatenate([np.stack([xs + dx, ys + dy], 1) for dx in (0, 1) for dy in (0, 1)])
    return MultiPoint(corners.astype(float)).convex_hull


def solid_z_polygon(on: np.ndarray):
    """Solid silhouette (source pixels) of the binary stripe mask `on`."""
    parts = [band_hull(on, 0, TOP_BAR_END), band_hull(on, BOTTOM_BAR_START, on.shape[0])]
    for y in range(TOP_BAR_END, BOTTOM_BAR_START, DIAGONAL_SLICE):
        parts.append(band_hull(on, y, min(y + DIAGONAL_SLICE, BOTTOM_BAR_START)))
    shape = unary_union([part for part in parts if part is not None and part.area > 0])
    shape = shape.buffer(SMOOTH_PX, join_style='round').buffer(-2 * SMOOTH_PX, join_style='round').buffer(SMOOTH_PX)
    if shape.geom_type != 'Polygon':
        shape = max(shape.geoms, key=lambda geom: geom.area)
    return Polygon(shape.exterior).simplify(SIMPLIFY_PX, preserve_topology=True)


def solid_z_path(polygon, origin, scale):
    """Straight-edged SVG path data (M ... L ... Z) in symbol units."""
    fmt = lambda v: str(round(v, 1) + 0).removesuffix('.0')
    coords = list(polygon.exterior.coords)[:-1]
    pts = [f'{fmt((x - origin[0]) * scale)} {fmt((y - origin[1]) * scale)}' for x, y in coords]
    return 'M' + pts[0] + ''.join('L' + point for point in pts[1:]) + 'Z'


def solid_z_mask(polygon, size, origin, k):
    """Rasterise the outline in the k-times crop frame."""
    sub = 16
    poly = np.array([[(x - origin[0]) * k * sub, (y - origin[1]) * k * sub] for x, y in polygon.exterior.coords]).round()
    mask = np.zeros((size[1], size[0]), np.uint8)
    cv2.fillPoly(mask, [poly.astype(np.int32)], 255, cv2.LINE_AA, 4)
    return np.where(mask > 127, 255, 0).astype(np.uint8)


def source_info(filename: str, crop):
    source = DEST / 'source' / filename
    return {'source': f'source/{filename}', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'crop': list(crop)}


result = {'version': '8.0', 'description': 'Zebra-striped Z v8 (supplied black-background master, 15 Nov 2026) '
          '+ supplied lowercase zayrovi, no divider. Raster-derived contours; not an original vector or font '
          'identification.'}

# ---- Z: stripes + solid silhouette --------------------------------------------------------------
z_file = 'z-zebra-black-v8.jpg'
grey = Image.open(DEST / 'source' / z_file).convert('L')
binary = np.array(grey) > 128
crop = Image.fromarray((binary * 255).astype(np.uint8)).getbbox()
x0, y0, x1, y1 = crop
polygon = solid_z_polygon(binary)
big = grey.crop(crop).resize(((x1 - x0) * UPSCALE, (y1 - y0) * UPSCALE), Image.LANCZOS)
stripes = big.filter(ImageFilter.GaussianBlur(2)).point(lambda p: 255 if p > 128 else 0)
solid = solid_z_mask(polygon, stripes.size, (x0, y0), UPSCALE)
on = np.array(stripes) > 0
outside = int((on & (solid == 0)).sum())
assert outside < 0.005 * on.sum(), f'{outside} stripe pixels fall outside the silhouette'
# Clip the stripes to the silhouette: crisp outer edge, identical for the striped and solid marks.
stripes = Image.fromarray(np.where(on & (solid > 0), 255, 0).astype(np.uint8))
result['symbol'] = {**trace(stripes, 0), **source_info(z_file, crop)}
scale = 1000 / (y1 - y0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
result['symbolSolid'] = {'width': result['symbol']['width'], 'height': 1000,
                         'viewBox': result['symbol']['viewBox'], 'd': solid_z_path(polygon, (x0, y0), scale),
                         'construction': 'union of convex hulls: top bar, bottom bar, diagonal slices of %d rows; '
                         'smoothed %d px, simplified %.1f px' % (DIAGONAL_SLICE, SMOOTH_PX, SIMPLIFY_PX),
                         # Farthest outline point from the centre of the box, in symbol units: lets every
                         # circular placement (loader ring, Android safe zone, round avatars) fit the Z exactly.
                         'maxRadius': round(float(max(np.hypot(px - cx, py - cy)
                                                      for px, py in polygon.exterior.coords)) * scale, 1),
                         **source_info(z_file, crop)}

# ---- Wordmark (unchanged since v6) --------------------------------------------------------------
w_file = 'wordmark.jpg'
image = Image.open(DEST / 'source' / w_file).convert('L')
mask = image.point(lambda p: 255 if p < 100 else 0)
mask.paste(0, (0, 0, 30, mask.height))  # exclude the unrelated orange sliver at the left edge of the JPEG
w_crop = mask.getbbox()
result['wordmark'] = {**trace(mask.crop(w_crop), 2), **source_info(w_file, w_crop)}

(DEST / 'logo.json').write_text(json.dumps(result, indent=2) + '\n')
print('Raster-derived contour master v8 written; rebuild runtime assets with npm run brand:build.')
