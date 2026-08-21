#!/usr/bin/env python3
"""AYROVI high-precision icon tracer: PNG/JPG → SVG 24×24 + measurements.

Separates black ink from the orange signature, measures real stroke width
and bounding box, then traces geometry (circles + outline paths).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SIGNATURE = '#FF6A00'
INK = '#111827'
VIEW = 24.0


def load_rgb(path: Path) -> np.ndarray:
    im = Image.open(path).convert('RGB')
    return np.array(im)


def classify(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return ink mask, orange mask (uint8 0/255)."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    r, g, b = rgb[:, :, 0].astype(np.int16), rgb[:, :, 1].astype(np.int16), rgb[:, :, 2].astype(np.int16)
    orange = (h < 22) & (s > 90) & (v > 120) & (r > 160) & (r > g + 30) & (r > b + 40)
    dark = (v < 90) | ((r < 80) & (g < 80) & (b < 90))
    ink = dark & ~orange
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    ink_u = cv2.morphologyEx(ink.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k)
    orange_u = cv2.morphologyEx(orange.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k)
    return ink_u, orange_u


def crop_union(ink: np.ndarray, orange: np.ndarray, pad: int = 8) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    union = cv2.bitwise_or(ink, orange)
    ys, xs = np.where(union > 0)
    if len(xs) == 0:
        raise SystemExit('No ink/orange pixels found.')
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(ink.shape[1], x1 + pad)
    y1 = min(ink.shape[0], y1 + pad)
    return ink[y0:y1, x0:x1], orange[y0:y1, x0:x1], (x0, y0, x1, y1)


def measure_stroke_px(ink: np.ndarray) -> dict:
    from skimage.morphology import skeletonize
    binary = ink > 0
    if binary.sum() < 20:
        return {'strokePx': None, 'samples': 0}
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    skel = skeletonize(binary)
    radii = dist[skel]
    radii = radii[radii > 0.4]
    if radii.size == 0:
        return {'strokePx': None, 'samples': 0}
    stroke = float(np.median(radii) * 2.0)
    return {
        'strokePx': round(stroke, 3),
        'strokePxP25': round(float(np.percentile(radii, 25) * 2), 3),
        'strokePxP75': round(float(np.percentile(radii, 75) * 2), 3),
        'samples': int(radii.size),
    }


def components(mask: np.ndarray) -> list[dict]:
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = map(int, stats[i])
        if area < 6:
            continue
        blob = (labels == i).astype(np.uint8) * 255
        out.append({'x': x, 'y': y, 'w': w, 'h': h, 'area': area, 'mask': blob, 'cx': float(cents[i][0]), 'cy': float(cents[i][1])})
    return out


def fit_circle(mask: np.ndarray) -> tuple[float, float, float, float] | None:
    ys, xs = np.where(mask > 0)
    if len(xs) < 12:
        return None
    pts = np.column_stack([xs.astype(np.float32), ys.astype(np.float32)])
    (cx, cy), r = cv2.minEnclosingCircle(pts)
    # circularity vs enclosing circle
    area = float(len(xs))
    circ_area = math.pi * r * r
    fill = area / max(circ_area, 1e-6)
    # ring: fill of annulus
    return float(cx), float(cy), float(r), float(fill)


def stroke_centerline(mask: np.ndarray) -> np.ndarray | None:
    """Skeleton ordered as an open polyline (for arcs, not rings)."""
    from skimage.morphology import skeletonize
    skel = skeletonize(mask > 0)
    ys, xs = np.where(skel)
    if len(xs) < 8:
        return None
    pts = {(int(x), int(y)) for x, y in zip(xs, ys)}
    nbr = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    def degree(p):
        x, y = p
        return sum(((x + dx, y + dy) in pts) for dx, dy in nbr)

    ends = [p for p in pts if degree(p) == 1]
    if len(ends) < 2:
        return None
    start = min(ends, key=lambda p: p[0])
    ordered = [start]
    prev = None
    cur = start
    seen = {start}
    while True:
        x, y = cur
        cand = [(x + dx, y + dy) for dx, dy in nbr if (x + dx, y + dy) in pts and (x + dx, y + dy) not in seen]
        if not cand:
            break
        nxt = min(cand, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)
        ordered.append(nxt)
        seen.add(nxt)
        prev, cur = cur, nxt
        if len(ordered) > len(pts) + 2:
            break
    if len(ordered) < 8:
        return None
    arr = np.array(ordered, dtype=np.float64)
    # downsample keeping endpoints
    step = max(1, len(arr) // 28)
    slim = np.vstack([arr[0], arr[step:-1:step], arr[-1]])
    return slim


def polyline_d(pts: np.ndarray, mapper) -> str:
    cmds = []
    for i, (x, y) in enumerate(pts):
        X, Y = mapper(x, y)
        cmds.append(('M' if i == 0 else 'L') + f'{X:.3f} {Y:.3f}')
    return ' '.join(cmds)


def contour_paths(mask: np.ndarray, epsilon_ratio: float) -> list[np.ndarray]:
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]
    paths = []
    for i, cnt in enumerate(contours):
        if len(cnt) < 5:
            continue
        peri = cv2.arcLength(cnt, True)
        eps = max(0.35, peri * epsilon_ratio)
        approx = cv2.approxPolyDP(cnt, eps, True)
        pts = approx.reshape(-1, 2).astype(np.float64)
        if len(pts) < 3:
            continue
        parent = int(hierarchy[i][3])
        paths.append((pts, parent == -1))
    return paths


def pts_to_d(pts: np.ndarray, mapper) -> str:
    cmds = []
    for i, (x, y) in enumerate(pts):
        X, Y = mapper(x, y)
        cmds.append(('M' if i == 0 else 'L') + f'{X:.3f} {Y:.3f}')
    cmds.append('Z')
    return ' '.join(cmds)


def make_mapper(w: int, h: int, padding: float = 1.6):
    side = max(w, h)
    scale = (VIEW - 2 * padding) / side
    ox = (VIEW - w * scale) / 2
    oy = (VIEW - h * scale) / 2

    def mapper(x: float, y: float) -> tuple[float, float]:
        return ox + x * scale, oy + y * scale

    return mapper, scale


def trace(path: Path, epsilon: float = 0.0028, padding: float = 1.55) -> tuple[str, dict]:
    rgb = load_rgb(path)
    src_h, src_w = rgb.shape[:2]
    ink, orange = classify(rgb)
    ink, orange, box = crop_union(ink, orange, pad=max(4, min(src_w, src_h) // 30))
    h, w = ink.shape[:2]
    stroke = measure_stroke_px(ink)
    mapper, scale = make_mapper(w, h, padding)
    stroke24 = round(stroke['strokePx'] * scale, 3) if stroke['strokePx'] else None

    # Orange signatures as circles
    orange_svg = []
    orange_meta = []
    for blob in components(orange):
        fit = fit_circle(blob['mask'])
        if not fit:
            continue
        cx, cy, r, fill = fit
        X, Y = mapper(cx, cy)
        R = max(0.7, r * scale)
        orange_svg.append(
            f'<circle cx="{X:.3f}" cy="{Y:.3f}" r="{R:.3f}" fill="{SIGNATURE}" stroke="none" data-ayrovi-signature="true"/>'
        )
        orange_meta.append({'cx': round(X, 3), 'cy': round(Y, 3), 'r': round(R, 3), 'fillRatio': round(fill, 3)})

    # Ink: prefer circle/ring when circular, else even-odd paths
    ink_svg = []
    ink_kind = []
    blobs = components(ink)
    # If a blob is a ring (head), emit two circles
    for blob in blobs:
        m = blob['mask']
        cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hier is None:
            continue
        hier = hier[0]
        # collect outer + holes
        outers, holes = [], []
        for i, cnt in enumerate(cnts):
            if cv2.contourArea(cnt) < 8:
                continue
            (cx, cy), r = cv2.minEnclosingCircle(cnt.astype(np.float32))
            area = cv2.contourArea(cnt)
            circ = area / max(math.pi * r * r, 1e-6)
            rec = {'cnt': cnt, 'cx': cx, 'cy': cy, 'r': r, 'circ': circ, 'area': area}
            if hier[i][3] == -1:
                outers.append(rec)
            else:
                holes.append(rec)
        ring = (
            len(outers) == 1 and len(holes) == 1
            and outers[0]['circ'] > 0.82 and holes[0]['circ'] > 0.75
        )
        if ring:
            o, hi = outers[0], holes[0]
            ox, oy = mapper(o['cx'], o['cy'])
            hx, hy = mapper(hi['cx'], hi['cy'])
            # draw as stroked circle using measured radii
            r_out = o['r'] * scale
            r_in = hi['r'] * scale
            r_mid = (r_out + r_in) / 2
            sw = stroke24 if stroke24 else max(0.6, r_out - r_in)
            ink_svg.append(
                f'<circle cx="{(ox+hx)/2:.3f}" cy="{(oy+hy)/2:.3f}" r="{r_mid:.3f}" fill="none" stroke="{INK}" stroke-width="{sw:.3f}" stroke-linecap="round"/>'
            )
            ink_kind.append('ring')
            continue
        center = stroke_centerline(m)
        if center is not None and len(center) >= 3:
            sw = stroke24 if stroke24 else 1.15
            d = polyline_d(center, mapper)
            ink_svg.append(
                f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{sw:.3f}" '
                f'stroke-linecap="round" stroke-linejoin="round"/>'
            )
            ink_kind.append('stroke')
            continue
        paths = contour_paths(m, epsilon)
        d_parts = []
        for pts, _outer in paths:
            d_parts.append(pts_to_d(pts, mapper))
        if d_parts:
            d = ' '.join(d_parts)
            ink_svg.append(f'<path d="{d}" fill="{INK}" fill-rule="evenodd" stroke="none"/>')
            ink_kind.append('path')

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">',
        f'  <!-- traced from {path.name} | stroke≈{stroke24} in 24-grid -->',
        *[f'  {el}' for el in ink_svg],
        *[f'  {el}' for el in orange_svg],
        '</svg>',
        '',
    ]
    meta = {
        'source': str(path),
        'sourcePx': [src_w, src_h],
        'croppedPx': [w, h],
        'cropBox': list(box),
        'strokePxSource': stroke,
        'strokeIn24': stroke24,
        'viewBox': 24,
        'padding': padding,
        'scaleTo24': round(float(scale), 5),
        'orange': orange_meta,
        'inkKinds': ink_kind,
    }
    return '\n'.join(svg), meta


def main() -> int:
    p = argparse.ArgumentParser(description='Trace an AYROVI icon photo to 24×24 SVG')
    p.add_argument('images', nargs='+', type=Path)
    p.add_argument('-o', '--out-dir', type=Path, default=Path('docs/ayrovi-icon-refs/traced'))
    p.add_argument('--epsilon', type=float, default=0.0028)
    args = p.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    summary = []
    for img in args.images:
        svg, meta = trace(img, epsilon=args.epsilon)
        stem = img.stem
        svg_path = args.out_dir / f'{stem}.svg'
        json_path = args.out_dir / f'{stem}.json'
        svg_path.write_text(svg, encoding='utf-8')
        json_path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
        summary.append({'file': str(svg_path), **{k: meta[k] for k in ('strokeIn24', 'strokePxSource', 'croppedPx', 'orange', 'inkKinds')}})
        print(f'OK  {img.name}')
        print(f'    SVG     {svg_path}')
        print(f'    stroke  {meta["strokePxSource"].get("strokePx")} px source  →  {meta["strokeIn24"]} in 24-grid')
        print(f'    orange  {len(meta["orange"])}  ink={meta["inkKinds"]}')
    (args.out_dir / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
