#!/usr/bin/env python3
"""قصّ أيقونات AYROVI من لوحات المرجع (sheets) → ملفات PNG فردية جاهزة للمتتبع.
قاعدة التمييز: الأيقونة = مجموعة أجزاء حبر بسماكة خط (radius≥1.15) تحتوي جزءًا رئيسيًا
(max dim ≥ 25px) أو عدة أجزاء كبيرة موزعة رأسيًا (ارتفاع ≥45) — النصوص أسطر صغيرة من أجزاء <100px."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from skimage.morphology import skeletonize

SHEETS = {
    'file_0000000094c4824386de194eefab7c74.png': {
        'prefix': '01-navigation', 'count': 15,
        'names': ['Menu', 'Retour', 'Fermer', 'Options', 'Accueil',
                  'Recherche', 'Ajouter', 'Modifier', 'Supprimer', 'Partager',
                  'Profil', 'Compte', 'Informations', 'Securite', 'Deconnexion'],
        'header_frac': 0.24, 'footer_frac': 0.06,
    },
    'file_000000007340824691dc26e13cfeb890.png': {
        'prefix': '04-commerce-ai', 'count': 38,
        'names': ['Produits', 'Commandes', 'Arrivages', 'Panier', 'Favoris', 'Paiements', 'Factures', 'Suivi-colis', 'Adresses', 'Notifications',
                  'AYROVI-AI', 'AYROVIX-Lens', 'AYVISI-Vision', 'Recherche-Web', 'Connecteurs', 'Code', 'Flash', 'Capture', 'Lien', 'Ajouter-image',
                  'Chat', 'Support', 'Social', 'Message', 'Appel', 'Email', 'Info', 'Aide', 'Conditions', 'Confidentialite', 'Mentions-legales', 'A-propos',
                  'Langue', 'Mode-sombre', 'Parametres', 'Filtre', 'Tri', 'Localisation'],
        'header_frac': 0.21, 'footer_frac': 0.0,
    },
    'file_00000000b44c81f4bc3bd2376e0af8b9.png': {
        'prefix': '09-paiements-fichiers', 'count': 30,
        'names': ['Carte-bancaire', 'Virement-bancaire', 'Portefeuille', 'Paiement-securise', 'Recu',
                  'Colis', 'Livraison', 'Suivi-temps-reel', 'Estimation-livraison', 'International',
                  'Ecrire', 'Nouveau-document', 'Televerser', 'Dossier', 'Signet',
                  'Fichier', 'Telecharger', 'Cloud', 'Stockage', 'Corbeille',
                  'Graphique', 'Rapports', 'Statistiques', 'Tendance', 'Performance',
                  'Succes', 'Attention', 'Alerte', 'Erreur', 'Rappel'],
        'header_frac': 0.24, 'footer_frac': 0.0,
    },
    'file_0000000004a481f4956589a2570cf822.png': {
        'prefix': '15-nav-compte-ai', 'count': 32,
        'names': ['Menu', 'Retour', 'Fermer', 'Options', 'Chevron', 'Accueil',
                  'Profil', 'Infos-personnelles', 'Securite', 'Parametres', 'Deconnexion',
                  'Produits', 'Commandes', 'Arrivages', 'Panier', 'Favoris', 'Promotions',
                  'AYROVI-AI', 'AYROVIX-Lens', 'AYVISI-Vision', 'Recherche-Web', 'Connecteurs',
                  'Prendre-photo', 'Galerie', 'Lien', 'Flash', 'Code',
                  'Informations', 'Aide', 'Support', 'Conditions', 'Confidentialite'],
        'header_frac': 0.21, 'footer_frac': 0.08,
    },
    'file_00000000a29c81f4b71ec83d36bcfeff.png': {
        'prefix': '21-commerce-langues-v1', 'count': 30,
        'names': ['Paiement', 'Carte-bancaire', 'Transaction', 'Acompte', 'Remboursement', 'Prix-Calcul',
                  'Colis', 'Expedition', 'Livraison', 'Suivi', 'Transporteur', 'Adresse-livraison',
                  'Succes', 'Erreur', 'Attention', 'Information', 'Notification', 'En-attente',
                  'Ajouter', 'Modifier', 'Supprimer', 'Telecharger', 'Partager', 'Copier',
                  'Francais', 'Arabe', 'Globe', 'Mode-clair', 'Mode-sombre', 'Accessibilite'],
        'header_frac': 0.21, 'footer_frac': 0.10,
    },
    'file_0000000099d0820ab324f7555eb91614.png': {
        'prefix': '21-brand', 'count': 37,
        'names': ['Paiement', 'Carte-bancaire', 'Transaction', 'Acompte', 'Remboursement', 'Prix-Calcul',
                  'Colis', 'Expedition', 'Livraison', 'Suivi', 'Transporteur', 'Adresse-livraison',
                  'Succes', 'Erreur', 'Attention', 'Information', 'Notification', 'En-attente',
                  'Ajouter', 'Modifier', 'Supprimer', 'Telecharger', 'Partager', 'Copier',
                  'Francais', 'Arabe', 'Globe', 'Mode-clair', 'Mode-sombre', 'Accessibilite',
                  'AYROVI-AI-brain', 'AYROVIX-Lens', 'AYVISI-Vision', 'AYROVI-Shopping', 'AYROVI-Logo', 'AI-Sparkle', 'Scan-Reconnaissance'],
        'header_frac': 0.21, 'footer_frac': 0.16,
    },
}


def masks(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    r, g, b = rgb[:, :, 0].astype(np.int16), rgb[:, :, 1].astype(np.int16), rgb[:, :, 2].astype(np.int16)
    orange = (h < 22) & (s > 90) & (v > 120) & (r > 160) & (r > g + 30) & (r > b + 40)
    dark = (v < 90) | ((r < 80) & (g < 80) & (b < 90))
    ink = (dark & ~orange).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, k)
    orange = cv2.morphologyEx(orange.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k)
    return ink, orange


def candidates(ink: np.ndarray, min_dim: int = 18, min_area: int = 40) -> list[dict]:
    """مرشّحون = أجزاء كبيرة بما يكفي (أقصى أبعاد ≥18px) — الأحرف النصية <18px."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = map(int, stats[i])
        if area < min_area or max(w, h) < min_dim:
            continue
        out.append({'x': x, 'y': y, 'w': w, 'h': h, 'area': area, 'cx': x + w / 2, 'cy': y + h / 2})
    return out


def group(parts: list[dict], gap: float = 40) -> list[list[dict]]:
    parent = list(range(len(parts)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(len(parts)):
        for j in range(i + 1, len(parts)):
            if abs(parts[i]['cx'] - parts[j]['cx']) <= gap and abs(parts[i]['cy'] - parts[j]['cy']) <= gap:
                union(i, j)
    groups: dict[int, list[dict]] = {}
    for i, p in enumerate(parts):
        groups.setdefault(find(i), []).append(p)
    return list(groups.values())


def icon_cluster(group: list[dict]) -> dict | None:
    if not group:
        return None
    x0 = min(p['x'] for p in group); y0 = min(p['y'] for p in group)
    x1 = max(p['x'] + p['w'] for p in group); y1 = max(p['y'] + p['h'] for p in group)
    return {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2}


def main() -> int:
    src = Path('/home/user/uploads')
    out_root = Path('/home/user/ayrovi_beta1/docs/ayrovi-icon-refs/sheets-cropped')
    out_root.mkdir(parents=True, exist_ok=True)
    report = {}
    for fname, spec in SHEETS.items():
        img = Image.open(src / fname).convert('RGB')
        rgb = np.array(img)
        H, W = rgb.shape[:2]
        ink, orange = masks(rgb)
        y_top = int(H * spec['header_frac'])
        y_bot = int(H * (1 - spec['footer_frac'])) if spec['footer_frac'] else H
        for arr in (ink, orange):
            arr[:y_top, :] = 0
            arr[y_bot:, :] = 0
        parts = candidates(ink)
        all_comps = []
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(ink, 8)
        for i in range(1, n2):
            x, y, w, h, area = map(int, st2[i])
            if area >= 15:
                all_comps.append({'x': x, 'y': y, 'w': w, 'h': h, 'area': area, 'cx': x + w / 2, 'cy': y + h / 2})
        # أيقونات برتقالية كاملة (مثل AYROVI Logo): مكوّن برتقالي كبير عمودي (الشعارات مسطّحة)
        n3, lab3, st3, _ = cv2.connectedComponentsWithStats(orange, 8)
        for i in range(1, n3):
            x, y, w, h, area = map(int, st3[i])
            if area >= 700 and h >= w >= 35:
                parts.append({'x': x, 'y': y, 'w': w, 'h': h, 'area': area, 'cx': x + w / 2, 'cy': y + h / 2})
        # نمط Options: 3 نقاط متماثلة متصافة رأسيًا
        small = [p for p in all_comps if 40 <= p['area'] and 8 <= max(p['w'], p['h']) <= 17]
        used = set()
        for i in range(len(small)):
            if i in used: continue
            chain = [i]
            for j in range(len(small)):
                if j == i or j in used: continue
                a, b = small[i], small[j]
                if abs(a['cx'] - b['cx']) < 7 and 14 <= abs(a['cy'] - b['cy']) <= 48 and abs(a['w'] - b['w']) <= 5:
                    chain.append(j)
            if len(chain) == 3:
                pts = [small[k] for k in chain]
                used.update(chain)
                x0 = min(q['x'] for q in pts); y0 = min(q['y'] for q in pts)
                x1 = max(q['x'] + q['w'] for q in pts); y1 = max(q['y'] + q['h'] for q in pts)
                parts.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'area': sum(q['area'] for q in pts),
                              'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2, 'pattern': True})
        # نمط Options البديل: نقطتان داكنتان متباعدتان رأسيًا (النقطة الوسطى برتقالية)
        for i in range(len(small)):
            if i in used: continue
            for j in range(len(small)):
                if j <= i or j in used: continue
                a, b = small[i], small[j]
                if (abs(a['cx'] - b['cx']) < 7 and 35 <= abs(a['cy'] - b['cy']) <= 70
                        and abs(a['w'] - b['w']) <= 5 and abs(a['h'] - b['h']) <= 5
                        and 8 <= a['w'] <= 17):
                    used.update((i, j))
                    x0 = min(a['x'], b['x']); y0 = min(a['y'], b['y'])
                    x1 = max(a['x'] + a['w'], b['x'] + b['w']); y1 = max(a['y'] + a['h'], b['y'] + b['h'])
                    parts.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'area': a['area'] + b['area'],
                                  'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2, 'pattern': True})
                    break
        # نمط شبكة مدمجة (QR / قوسات AYROVIX Lens): 3+ أجزاء صغيرة في bbox مدمج متعدد الأعمدة/الصفوف
        sg_groups = group(small, gap=40)
        for g in sg_groups:
            if len(g) < 3:
                continue
            gx0 = min(q['x'] for q in g); gy0 = min(q['y'] for q in g)
            gx1 = max(q['x'] + q['w'] for q in g); gy1 = max(q['y'] + q['h'] for q in g)
            gw, gh = gx1 - gx0, gy1 - gy0
            if not (25 <= gw <= 72 and 25 <= gh <= 72):
                continue
            if not (0.55 <= gw / gh <= 1.8):
                continue  # شريط نصي وليس شبكة أيقونة
            cols = {round(q['cx'] / 20) for q in g}
            rows_ = {round(q['cy'] / 20) for q in g}
            if len(cols) >= 2 and len(rows_) >= 2:
                parts.append({'x': gx0, 'y': gy0, 'w': gx1 - gx0, 'h': gy1 - gy0,
                              'area': sum(q['area'] for q in g),
                              'cx': (gx0 + gx1) / 2, 'cy': (gy0 + gy1) / 2, 'pattern': True})
        groups = group(parts)
        clusters = []
        for g in groups:
            c = icon_cluster(g)
            if c is None:
                continue
            if any(p.get('pattern') for p in g):
                c['pattern'] = True
            clusters.append(c)
        # استيعاب كل الأجزاء القريبة (قوسان صغيران، أشعة الشمس، علامات QR…)
        for c in clusters:
            for _ in range(3):
                x0, y0 = c['x'] - 14, c['y'] - 14
                x1, y1 = c['x'] + c['w'] + 14, c['y'] + c['h'] + 14
                grow = None
                for q in all_comps:
                    if q['x'] >= x0 and q['y'] >= y0 and q['x'] + q['w'] <= x1 and q['y'] + q['h'] <= y1:
                        grow = q
                        break
                if grow is None:
                    break
                nx0 = min(c['x'], grow['x']); ny0 = min(c['y'], grow['y'])
                nx1 = max(c['x'] + c['w'], grow['x'] + grow['w']); ny1 = max(c['y'] + c['h'], grow['y'] + grow['h'])
                c['x'], c['y'], c['w'], c['h'] = nx0, ny0, nx1 - nx0, ny1 - ny0
                c['cx'], c['cy'] = (nx0 + nx1) / 2, (ny0 + ny1) / 2
        # شمول النقاط البرتقالية القريبة
        for c in clusters:
            ox0, oy0 = max(0, c['x'] - 12), max(0, c['y'] - 12)
            ox1, oy1 = min(W, c['x'] + c['w'] + 12), min(H, c['y'] + c['h'] + 12)
            patch = orange[oy0:oy1, ox0:ox1]
            if (patch > 0).any():
                ys, xs = np.where(patch > 0)
                ax0, ax1 = ox0 + int(xs.min()), ox0 + int(xs.max())
                ay0, ay1 = oy0 + int(ys.min()), oy0 + int(ys.max())
                nx0, ny0 = min(c['x'], ax0), min(c['y'], ay0)
                nx1, ny1 = max(c['x'] + c['w'], ax1), max(c['y'] + c['h'], ay1)
                c['x'], c['y'], c['w'], c['h'] = nx0, ny0, nx1 - nx0, ny1 - ny0
                c['cx'], c['cy'] = (nx0 + nx1) / 2, (ny0 + ny1) / 2
        clusters = [c for c in clusters if c.get('pattern') or (24 <= c['w'] <= 210 and 24 <= c['h'] <= 210)]
        # التسمية تقع مباشرة تحت أيقونتها — عنقود يوجد فوقه عنقود آخر = تسمية
        def is_label(c, others):
            for o in others:
                if o is c: continue
                ov_x = max(0, min(c['x'] + c['w'], o['x'] + o['w']) - max(c['x'], o['x']))
                if ov_x < min(c['w'], o['w']) * 0.3: continue
                gap = c['y'] - (o['y'] + o['h'])
                if 4 <= gap <= 45:
                    return True
            return False
        if os.environ.get('CROP_DEBUG'):
            for c in clusters:
                if is_label(c, clusters):
                    print(f"  [DEBUG] {spec['prefix']} LABEL-killed: ({int(c['x'])},{int(c['y'])}) {int(c['w'])}x{int(c['h'])}", file=sys.stderr)
        clusters = [c for c in clusters if not is_label(c, clusters)]
        clusters.sort(key=lambda c: c['cy'])
        rows: list[list[dict]] = []
        for c in clusters:
            if rows and abs(c['cy'] - rows[-1][0]['cy']) < 40:
                rows[-1].append(c)
            else:
                rows.append([c])
        for r in rows:
            r.sort(key=lambda c: c['cx'])
        flat = [c for r in rows for c in r]
        status = 'OK' if len(flat) == spec['count'] else f'MISMATCH (found {len(flat)} / expected {spec["count"]})'
        report[spec['prefix']] = {'file': fname, 'count': len(flat), 'expected': spec['count'],
                                  'rows': [len(r) for r in rows], 'status': status, 'size': [W, H]}
        for i, (c, name) in enumerate(zip(flat, spec['names'])):
            pad = 12
            x0 = max(0, c['x'] - pad); y0 = max(0, c['y'] - pad)
            x1 = min(W, c['x'] + c['w'] + pad); y1 = min(H, c['y'] + c['h'] + pad)
            Image.fromarray(rgb[y0:y1, x0:x1]).save(out_root / f"{spec['prefix']}__{i:02d}__{name}.png")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
