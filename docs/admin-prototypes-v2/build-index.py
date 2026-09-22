#!/usr/bin/env python3
"""
Assemble docs/admin-prototypes-v2/index.html : page de comparaison autonome.

Tout est embarqué (captures en base64 + police Zalando Sans en base64) : la page ne fait
aucune requête réseau, elle s'ouvre aussi bien depuis le dépôt que depuis une pièce jointe.

Usage : python3 docs/admin-prototypes-v2/build-index.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent

FONT = (REPO / "client/public/fonts/editorial/zalando-sans.woff2").read_bytes()
FONT_B64 = base64.b64encode(FONT).decode()

MODELS = [
    {
        "id": "a",
        "letter": "A",
        "file": "a-amazon-console.html",
        "svg": "figma/cadres/modele-1-amazon-commandes.svg",
        "tokens": "Model/Amazon_Seller_Central",
        "title": "Console opérationnelle",
        "reference": "Amazon Seller Central",
        "shot": "evidence/a-amazon-console-desktop.jpg",
        "mobile": "evidence/a-amazon-console-mobile.jpg",
        "idea": "Une console « centre de commandes » : deux bandeaux de navigation, des files d'attente à traiter en haut, une liste filtrable et un panneau de décision à droite.",
        "strengths": [
            "Vue « Unshipped / Pending / Cancelled » : l'équipe ouvre la console et voit ce qu'il reste à faire.",
            "Actions de lot sur la sélection, colonnes configurables, densité compacte.",
            "Panneau latéral de décision : montant, acompte, tarif appliqué, puis Valider / Préparer / Facturer.",
        ],
        "choose": "l'équipe travaille surtout par lots (« valider les 7 acomptes », « préparer les 12 commandes »).",
        "who": "Opérations quotidiennes · logistique · acomptes",
    },
    {
        "id": "b",
        "letter": "B",
        "file": "b-stripe-console.html",
        "svg": "figma/cadres/modele-2-stripe-acomptes.svg",
        "tokens": "Model/Stripe_Dashboard",
        "title": "Console financière",
        "reference": "Stripe Dashboard",
        "shot": "evidence/b-stripe-console-desktop.jpg",
        "mobile": None,
        "idea": "Rail blanc, bandeau de métriques, courbe d'encaissements, onglets de domaine et tiroir de détail avec chronologie des événements.",
        "strengths": [
            "L'argent d'abord : volume, encaissé, acomptes à vérifier, litiges — chiffres en haut de page.",
            "Chronologie par commande : chaque action est datée et attribuée.",
            "Tiroir de détail compact : on décide sans quitter la liste.",
        ],
        "choose": "le pilotage financier (acomptes, encaissements, remboursements) compte plus que le volume traité.",
        "who": "Direction · finances · contrôle des acomptes",
    },
    {
        "id": "c",
        "letter": "C",
        "file": "c-cloud-console.html",
        "svg": "figma/cadres/modele-3-cloud-commandes.svg",
        "tokens": "Model/Cloud_Console",
        "title": "Console technique",
        "reference": "Google Cloud Console / AWS",
        "shot": "evidence/c-cloud-console-desktop.jpg",
        "mobile": None,
        "idea": "Barre d'application, sélecteur d'environnement, navigation de service horizontale, filtres en conditions et inspecteur de ressource.",
        "strengths": [
            "Filtres en conditions cumulables, visibles et retirables une par une — aucune ambiguïté sur ce qui est affiché.",
            "Inspecteur à onglets (Détails · Journal · Liens) : la trace technique à côté de l'objet.",
            "Conventions attendues par un profil technique : journal d'audit, rôles, ressources liées.",
        ],
        "choose": "il faut de la traçabilité et des filtres précis, avec des profils techniques dans l'équipe.",
        "who": "Supervision · audit · support technique",
    },
    {
        "id": "d",
        "letter": "D",
        "file": "d-shopify-console.html",
        "svg": "figma/cadres/modele-4-shopify-index.svg",
        "tokens": "Model/Shopify_Admin",
        "title": "Console commerçant",
        "reference": "Shopify Admin",
        "shot": "evidence/d-shopify-console-desktop.jpg",
        "mobile": "evidence/d-shopify-console-mobile.jpg",
        "idea": "Barre encre, navigation à compteurs, cartes de synthèse, index de commandes et édition du contenu du site sur la même page.",
        "strengths": [
            "Le contenu public (barre sous l'en-tête) s'édite dans l'écran d'index, avec aperçu et enregistrement groupé.",
            "Compteurs dans la navigation : on voit la charge de travail sans ouvrir l'écran.",
            "Barre de sauvegarde contextuelle en bas : impossible d'oublier des modifications non publiées.",
        ],
        "choose": "on veut administrer la boutique et le contenu du site au même endroit, sans jongler entre les écrans.",
        "who": "Administration générale · contenu · boutique",
    },
]


def b64(path: pathlib.Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def model_block(m):
    rows = "".join(
        f'<li>{row}</li>' for row in m["strengths"]
    )
    mobile = (
        f'<figure><img alt="Aperçu mobile — modèle {m["letter"]}" src="data:image/jpeg;base64,{b64(HERE / m["mobile"])}" /><figcaption>Mobile 390 px</figcaption></figure>'
        if m["mobile"]
        else ""
    )
    return f"""
    <section class="model" id="modele-{m['id']}">
      <header>
        <span class="letter">{m['letter']}</span>
        <div>
          <h2>{m['title']} <small>· référence {m['reference']}</small></h2>
          <p class="who">{m['who']}</p>
        </div>
        <nav class="files">
          <a href="{m['file']}">Maquette HTML</a>
          <a href="{m['svg']}">Cadre Figma (SVG)</a>
          <code>tokens.json · {m['tokens']}</code>
        </nav>
      </header>
      <p class="idea">{m['idea']}</p>
      <ul class="strengths">{rows}</ul>
      <p class="choose"><b>À choisir si</b> {m['choose']}</p>
      <div class="shots">
        <figure><img alt="Aperçu bureau — modèle {m['letter']}" src="data:image/jpeg;base64,{b64(HERE / m['shot'])}" /><figcaption>Bureau 1440 px</figcaption></figure>
        {mobile}
      </div>
    </section>
    """


HTML = f"""<!DOCTYPE html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AYROVI — 4 modèles d'administration niveau entreprise (à choisir)</title>
<style>
  @font-face{{font-family:'Zalando Sans';src:url(data:font/woff2;base64,{FONT_B64}) format('woff2');font-weight:100 900;font-display:swap}}
  *{{box-sizing:border-box}}
  html,body{{margin:0;background:#F4F5F6;color:#111110;font-family:'Zalando Sans','Noto Sans Arabic',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.55}}
  a{{color:#B85500}}
  .wrap{{max-width:1240px;margin:0 auto;padding:28px 20px 60px}}
  .top{{background:#111110;color:#fff;border-radius:14px;padding:26px 28px}}
  .top h1{{margin:0 0 8px;font-size:27px;letter-spacing:-.01em}}
  .top p{{margin:0;color:#C9C7C3;max-width:900px;font-size:13.5px}}
  .top .pill{{display:inline-block;margin-top:14px;background:#FF6900;color:#111110;font-weight:800;font-size:12px;padding:5px 12px;border-radius:999px}}
  .common{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:20px 0 6px}}
  .common article{{background:#fff;border:1px solid #E4E6E8;border-radius:12px;padding:14px 16px}}
  .common h3{{margin:0 0 6px;font-size:13px}}
  .common p{{margin:0;color:#5A5F66;font-size:12.5px}}
  .model{{background:#fff;border:1px solid #E4E6E8;border-radius:14px;padding:20px 22px;margin-top:20px}}
  .model>header{{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}}
  .letter{{width:38px;height:38px;border-radius:10px;background:#111110;color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px}}
  .model h2{{margin:0;font-size:19px}}
  .model h2 small{{font-weight:600;color:#5A5F66;font-size:13px}}
  .who{{margin:3px 0 0;color:#5A5F66;font-size:12.5px}}
  .files{{margin-inline-start:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px}}
  .files a{{font-weight:700}}
  .files code{{background:#F1F2F3;border-radius:6px;padding:4px 8px;font-size:11.5px;color:#3C4046}}
  .idea{{margin:14px 0 8px;font-size:13.5px}}
  ul.strengths{{margin:0;padding-inline-start:20px;color:#3C4046;font-size:13px}}
  ul.strengths li{{margin:4px 0}}
  .choose{{margin:12px 0 0;background:#FFF6EE;border:1px solid #FFD9BA;border-radius:10px;padding:10px 14px;font-size:13px}}
  .shots{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:16px}}
  figure{{margin:0}}
  figure img{{width:100%;border:1px solid #E4E6E8;border-radius:10px;display:block}}
  figcaption{{color:#6B7076;font-size:11.5px;margin-top:6px}}
  .figma{{background:#fff;border:1px solid #E4E6E8;border-radius:14px;padding:20px 22px;margin-top:20px}}
  .figma h2{{margin:0 0 10px;font-size:19px}}
  .figma ol{{margin:0;padding-inline-start:22px;font-size:13.5px;color:#3C4046}}
  .figma li{{margin:6px 0}}
  .figma table{{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}}
  .figma th,.figma td{{text-align:start;padding:8px 10px;border-bottom:1px solid #E9EBED;vertical-align:top}}
  .figma th{{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6B7076}}
  .foot{{margin-top:22px;color:#5A5F66;font-size:12.5px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>4 modèles d'administration, niveau entreprise — à choisir</h1>
    <p>Chaque modèle reprend les conventions opérationnelles d'une grande plateforme (Amazon Seller Central, Stripe, Google Cloud / AWS, Shopify Admin) et les applique aux vrais écrans AYROVI : commandes en TND, acomptes à vérifier, arrivages, barre sous l'en-tête. C'est le même contenu dans les quatre : seule la façon de travailler change.</p>
    <p style="margin-top:10px">Livrables Figma par modèle : un cadre SVG à calques nommés et un jeu de jetons (tokens.json, format Tokens Studio). Voir <b>FIGMA.md</b> pour la marche à suivre.</p>
    <span class="pill">Choisis une lettre (A, B, C ou D) — ou dis « A + l'index de D »</span>
  </div>

  <div class="common">
    <article><h3>Contenu réel, pas de faux écran</h3><p>Commandes AYR-TN-10241…10235, acomptes de 82 580 TND, tarif v3 · EUR 1 → 3,412 TND, arrivages et libellés AR (وصلات جديدة · هدايا وبطاقات · مجلة AYROVI).</p></article>
    <article><h3>Links : liste fermée</h3><p>Chaque lien de la barre sous l'en-tête affiche sa destination réelle. On renomme, on réordonne, on masque — jamais d'URL libre, donc pas de lien mort.</p></article>
    <article><h3>Permissions et journal</h3><p>Les actions sensibles (valider un acompte, publier la barre) sont liées à un rôle, et chaque action laisse une ligne datée et nominative.</p></article>
    <article><h3>Autonome</h3><p>Chaque maquette est un fichier HTML unique, police incluse, zéro requête réseau : elle s'ouvre partout, même hors ligne.</p></article>
  </div>
  {''.join(model_block(m) for m in MODELS)}

  <section class="figma">
    <h2>Travailler dans Figma</h2>
    <ol>
      <li>Ouvrir Figma → <b>Import file</b> → glisser un cadre <code>figma/cadres/*.svg</code>. Il arrive sur un cadre nommé « Admin / Modèle n — … », chaque élément gardant son nom de calque (chrome-haut, nav, tableau-commandes, inspecteur…).</li>
      <li>Le texte reste du texte : double-clic pour réécrire un libellé, la barre sous l'en-tête ou un montant. Les formes restent vectorielles (rectangles, filets, étiquettes).</li>
      <li>Pour les couleurs et les typographies, installer le plugin <b>Tokens Studio</b> et importer <code>figma/tokens.json</code> : 4 jeux de jetons (un par modèle) plus le jeu de marque AYROVI.</li>
      <li>Dupliquer un cadre pour dessiner une variante (mobile, état vide, erreur) : la grille et les espacements du modèle restent en place.</li>
      <li>Fonts : <b>Zalando Sans</b> est la police de marque (fichier dans le dépôt, <code>client/public/fonts/editorial/</code>) ; installer aussi <b>Noto Sans Arabic</b> pour les libellés arabes.</li>
    </ol>
    <table>
      <thead><tr><th>Fichier</th><th>Contenu</th><th>Import</th></tr></thead>
      <tbody>
        <tr><td><code>figma/cadres/modele-1-amazon-commandes.svg</code></td><td>Modèle A — console opérationnelle (Amazon Seller Central)</td><td>Glisser-déposer dans Figma</td></tr>
        <tr><td><code>figma/cadres/modele-2-stripe-acomptes.svg</code></td><td>Modèle B — console financière (Stripe)</td><td>Glisser-déposer dans Figma</td></tr>
        <tr><td><code>figma/cadres/modele-3-cloud-commandes.svg</code></td><td>Modèle C — console technique (Google Cloud / AWS)</td><td>Glisser-déposer dans Figma</td></tr>
        <tr><td><code>figma/cadres/modele-4-shopify-index.svg</code></td><td>Modèle D — console commerçant (Shopify Admin)</td><td>Glisser-déposer dans Figma</td></tr>
        <tr><td><code>figma/tokens.json</code></td><td>Marque AYROVI + 4 jeux de jetons (couleurs, densité, rayon, typographie)</td><td>Plugin Tokens Studio → Import</td></tr>
        <tr><td><code>figma/generate.mjs</code></td><td>Générateur des 4 cadres (modifie une valeur, relance, les SVG se régénèrent)</td><td><code>node docs/admin-prototypes-v2/figma/generate.mjs</code></td></tr>
      </tbody>
    </table>
    <p class="foot">Les maquettes HTML servent à juger les écrans en vrai ; les cadres SVG et les jetons servent à produire et décliner dans Figma. Dis-moi la lettre retenue et je convertis l'admin AYROVI sur ce modèle.</p>
  </section>
</div>
</body>
</html>
"""

(HERE / "index.html").write_text(HTML, encoding="utf-8")
size = (HERE / "index.html").stat().st_size / 1024
links = re.findall(r'src="(?!data:)([^"]+)"|href="(?!data:|#)([^"]+)"', HTML)
print(f"index.html écrit — {size:.0f} Ko — {len(MODELS)} modèles — {len(links)} liens de fichiers")
