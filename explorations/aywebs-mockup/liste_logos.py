#!/usr/bin/env python3
"""Liste des boutiques qui n'ont PAS encore de logo officiel — 27/10/2026.

Source de vérité : `shared/aywebsStores.ts` (registre) + `shared/aywebsStoreCatalog.ts`
(catalogue), filtrés par `apps/mobile/src/features/aywebs/storeLogoIds.ts`.
Le CSV `logos-manquants-2026-10-27.csv` est l'instantané de ce calcul ; ce script
le relit et écrit la fiche lisible dans `docs/`.

    python3 explorations/aywebs-mockup/liste_logos.py
"""
from __future__ import annotations

import collections
import csv
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CSV_PATH = os.path.join(HERE, 'logos-manquants-2026-10-27.csv')
OUT_PATH = os.path.join(ROOT, 'docs', 'AYWEBS_LOGOS_MANQUANTS_2026-10-27.md')

# 19 logos livrés le 27/10/2026 (voir apps/mobile/assets/aywebs/brands/).
DONE = 19
TOTAL = 390

# ── Priorité 2 : les marques qu'un client reconnaît d'un coup d'œil ─────────
# Choix éditorial, PAS une mesure : ce sont les enseignes qui reviennent dans
# une conversation courante et qui donnent son air « vrai » à un annuaire.
# Chacune est déjà une boutique du catalogue (aucune ligne à créer).
PRIORITY = [
    ('ikea', 'Le premier nom que le client cherche dans « Maison »'),
    ('decathlon', 'Sport : la référence en Tunisie et en France'),
    ('apple', 'High-tech : le logo le plus attendu de la catégorie'),
    ('samsung', 'High-tech / smartphones'),
    ('sony', 'High-tech / photo / jeux'),
    ('ebay', 'Marketplace historique'),
    ('uniqlo', 'Mode'),
    ('mango', 'Mode'),
    ('bershka', 'Mode jeune'),
    ('pull-bear', 'Mode jeune'),
    ('stradivarius', 'Mode'),
    ('foot-locker', 'Chaussures'),
    ('jd-sports', 'Chaussures'),
    ('skechers', 'Chaussures'),
    ('crocs', 'Chaussures'),
    ('dr-martens', 'Chaussures'),
    ('douglas', 'Beauté'),
    ('notino', 'Parfums'),
    ('the-body-shop', 'Beauté'),
    ('lush', 'Beauté'),
    ('kiko-milano', 'Beauté'),
    ('wayfair', 'Maison'),
    ('conforama', 'Maison : présent au Maghreb'),
    ('maisons-du-monde', 'Maison'),
    ('leroy-merlin', 'Bricolage / jardin'),
    ('fnac', 'High-tech / livres'),
    ('darty', 'High-tech'),
    ('steam', 'Jeux vidéo'),
    ('playstation-direct', 'Jeux vidéo'),
    ('xbox', 'Jeux vidéo'),
    ('nintendo-store', 'Jeux vidéo'),
    ('farfetch', 'Luxe'),
    ('mytheresa', 'Luxe'),
    ('net-a-porter', 'Luxe'),
    ('ssense', 'Luxe'),
    ('boots', 'Beauté / santé'),
    ('ulta-beauty', 'Beauté'),
]


def main() -> int:
    with open(CSV_PATH, newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))

    by_id = {row['id']: row for row in rows}
    registry = [row for row in rows if row['source'] == 'registre']
    catalog = [row for row in rows if row['source'] == 'catalogue']

    # Regroupement par catégorie PRINCIPALE (la première déclarée) : une
    # boutique n'apparaît qu'une fois, même si elle en couvre plusieurs.
    groups: dict[str, list[dict]] = collections.OrderedDict()
    for row in sorted(catalog, key=lambda r: (r['categories'].split('|')[0], r['nom'].lower())):
        groups.setdefault(row['categories'].split('|')[0], []).append(row)

    missing_priority = [pid for pid, _ in PRIORITY if pid not in by_id]

    lines: list[str] = []
    add = lines.append

    add('# Boutiques sans logo officiel — état au 27/10/2026')
    add('')
    add('**19 logos livrés** (voir `apps/mobile/assets/aywebs/brands/`) sur **390 boutiques** : '
        f'**{len(rows)} marques attendent encore le leur**.')
    add('')
    add('| | Boutiques | Sans logo | Ce que ça change à l\'écran |')
    add('| --- | --- | --- | --- |')
    add(f'| **Registre** (`AYWEBS_STORES`) | 33 | **{len(registry)}** | Boutiques **ouvertes** : capture, panier, visite. '
        'Leur carte affiche l\'initiale du nom. |')
    add(f'| **Catalogue** (`AYWEBS_CATALOG_STORES`) | 357 | **{len(catalog)}** | Boutiques **affichées** mais non capturables. '
        'Leur carte affiche aussi l\'initiale. |')
    add('')
    add('> Ce que voit le client aujourd\'hui quand un logo manque : **la première lettre du nom**, '
        'sur la plaque grise du design system — jamais un cadre d\'image cassée. '
        'Dès qu\'un fichier arrive, la carte prend le logo sans autre changement.')
    add('')
    add('---')
    add('')
    add(f'## 1. Les {len(registry)} boutiques du registre — à demander en premier')
    add('')
    add('Ce sont les seules qui **s\'ouvrent vraiment** (bouton « Visiter », capture de fiche, panier) : '
        'un logo leur manque plus qu\'à n\'importe quelle boutique du catalogue.')
    add('')
    add('| Boutique | Fichier à fournir | Catégories | Adresse |')
    add('| --- | --- | --- | --- |')
    for row in sorted(registry, key=lambda r: r['nom'].lower()):
        add(f'| **{row["nom"]}** | `{row["id"]}.png` | {row["categories"].replace("|", " · ")} | {row["adresse"]} |')
    add('')
    add('---')
    add('')
    add(f'## 2. Les {len(PRIORITY)} marques à demander en une fois (suggestion)')
    add('')
    add('Choix éditorial, pas une mesure : les enseignes que le client reconnaît d\'un coup d\'œil. '
        'Elles sont **déjà** des boutiques du catalogue — aucun ajout à faire, seulement un fichier.')
    add('')
    add('| Boutique | Pourquoi |')
    add('| --- | --- |')
    for pid, why in PRIORITY:
        row = by_id.get(pid)
        if row:
            add(f'| **{row["nom"]}** (`{pid}.png`) | {why} |')
        else:
            add(f'| _{pid}_ | {why} |')
    if missing_priority:
        add('')
        add('> Identifiants absents du catalogue (à vérifier avant de les réclamer) : '
            + ', '.join(f'`{pid}`' for pid in missing_priority) + '.')
    add('')
    add('---')
    add('')
    add('## 3. La liste complète, par catégorie')
    add('')
    add(f'Une boutique = une ligne, rangée sous sa **catégorie principale** (elle peut en couvrir '
        'plusieurs). Le fichier `explorations/aywebs-mockup/logos-manquants-2026-10-27.csv` '
        'porte les mêmes données avec l\'adresse, le statut et toutes les catégories.')
    add('')
    for category, items in groups.items():
        add(f'### {category} — {len(items)}')
        add('')
        for row in items:
            add(f'- {row["nom"]} — `{row["id"]}.png`')
        add('')
    add('---')
    add('')
    add('## Comment envoyer un logo')
    add('')
    add('1. **PNG à fond transparent**, 400 px minimum sur le grand côté (les cartes '
        'font 176 pt, donc 3× pour les écrans denses).')
    add('2. **Un fichier par marque**, nommé avec l\'identifiant ci-dessus : `ikea.png`, `decathlon.png`, '
        '`apple.png`… Un logo de marque ne se partage jamais entre deux boutiques.')
    add('3. **Variante blanche** si la marque est monochrome (trait noir) : elle sert le thème sombre. '
        'Si elle manque, l\'application garde la version noire et pose une plaque blanche.')
    add('4. Les marques en **couleurs officielles** (orange TEMU, rouge AliExpress…) ne sont jamais '
        'recoloriées : c\'est la charte de la marque qui gagne.')
    add('')
    add('Techniquement, il suffit ensuite de déposer le fichier dans '
        '`apps/mobile/assets/aywebs/brands/`, d\'ajouter la ligne dans '
        '`apps/mobile/src/features/aywebs/storeLogos.ts` et l\'identifiant dans `storeLogoIds.ts` : '
        'la carte d\'accueil et la carte de la liste lisent la même table, il n\'y a rien d\'autre à toucher.')
    add('')

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(lines))
    print(f'✓ {os.path.relpath(OUT_PATH, ROOT)} — {len(rows)} boutiques sans logo')
    print(f'   registre {len(registry)} · catalogue {len(catalog)} · priorité {len(PRIORITY)}')
    if missing_priority:
        print('   ! identifiants absents :', ', '.join(missing_priority))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
