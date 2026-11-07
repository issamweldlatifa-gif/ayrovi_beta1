"""Reconstruct the supplied raster contours, not a replacement font or AI redraw.
Optional tools: pip install -r scripts/requirements-brand.txt. Then run brand:build.
The committed contour JSON is the stable master for normal JS builds.
"""
import hashlib
import json
import re
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageOps
import vtracer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/brand/zayrovi-2026-11'
result = {'version': '6.0', 'description': 'Heart-handshake + supplied lowercase zayrovi, no divider. Raster-derived contours; not an original vector or font identification.'}
for name, filename, white in [('symbol', 'symbol.png', True), ('wordmark', 'wordmark.jpg', False)]:
    source = DEST / 'source' / filename
    image = Image.open(source).convert('L')
    mask = image.point(lambda p: 255 if (p > 180 if white else p < 100) else 0)
    if name == 'wordmark':
        # Exclude the unrelated orange sliver at the left edge of the supplied JPEG.
        mask.paste(0, (0, 0, 30, mask.height))
    crop = mask.getbbox()
    mask = mask.crop(crop)
    with tempfile.TemporaryDirectory() as tmp:
        png, svg = Path(tmp) / 'mask.png', Path(tmp) / 'trace.svg'
        ImageOps.invert(mask).save(png)
        vtracer.convert_image_to_svg_py(str(png), str(svg), colormode='binary', mode='spline', filter_speckle=8,
            corner_threshold=60, length_threshold=4, max_iterations=10, splice_threshold=45, path_precision=2)
        tree = ET.parse(svg)
        pen = SVGPathPen(None, ntos=lambda n: str(round(n, 2)).removesuffix('.0'))
        scale = 1000 / mask.height
        for path in tree.iter('{http://www.w3.org/2000/svg}path'):
            translate = re.fullmatch(r'translate\(([-\d.]+),([-\d.]+)\)', path.get('transform', 'translate(0,0)'))
            if translate is None:
                raise ValueError('Unexpected VTracer transform')
            tx, ty = map(float, translate.groups())
            parse_path(path.attrib['d'], TransformPen(pen, (scale, 0, 0, scale, tx * scale, ty * scale)))
    width = round(mask.width * scale, 2)
    result[name] = {'width': width, 'height': 1000, 'viewBox': f'0 0 {width} 1000', 'd': pen.getCommands(),
        'source': f'source/{filename}', 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'crop': crop}
(DEST / 'logo.json').write_text(json.dumps(result, indent=2) + '\n')
print('Raster-derived contour master written; rebuild runtime assets with npm run brand:build.')
