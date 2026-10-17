# Z Lens — rétablissement des résultats SerpApi (17/10/2026)

## Diagnostic des journaux Render

Les erreurs `SERPAPI_TIMEOUT` sont intermittentes, pas une panne totale : un appel a bien rendu **24 correspondances en 10 065 ms**. Le blocage principal venait ensuite : Bright Data n'a pas pu lire la plupart des pages marchandes, puis le filtre d'achat a masqué **23 fiches** (`22 page_non_lue`, `1 prix_non_lu`) et n'en a laissé qu'une. Cela donnait l'impression que SerpApi n'avait rien trouvé.

## Comportement corrigé

- SerpApi reste l'unique entrée de la recherche visuelle Lens. Aucun repli silencieux vers Anthropic.
- La recherche complète interroge les marchés majeurs `fr,de,it,es,uk,us,ca,tr,ae` en parallèle; France est toujours incluse et `tn` est filtré. Les résultats sont fusionnés/dédoublonnés par URL. L'ancien `AYROVIX_LENS_COUNTRY` reste accepté sans remplacer la liste; `AYROVIX_LENS_COUNTRIES` permet de la régler (plafond de 9 pays).
- Le mode Live, qui répète les recherches pendant l'ouverture de la caméra, utilise seulement `fr,uk,us` pour borner le coût et le délai.
- `POST /detect` renvoie des correspondances visuelles (titre, vignette, lien, marchand), jamais des boîtes. Le viseur/cadre de sélection reste manuel.
- `/analyze-image` émet d'abord les correspondances SerpApi sûres, puis émet une mise à jour pour la même URL après lecture réussie de la page marchande. Le client remplace la carte existante, sans doublon.
- Un échec de scraping n'efface plus une correspondance : le titre, l'image et le lien restent visibles; les prix/snippets non vérifiés et les indices de stock SerpApi sont retirés. Une rupture confirmée par la page marchande reste exclue.
- Les fiches strictement prouvées restent prioritaires. Les compteurs d'exclusion ne comptent plus comme « masquées » les matches visuels conservés sans prix.
- Le budget SerpApi est de 24 s par défaut (18 s réservées à `search.json`) et l'échéance `MATCHES` est de 26 s; l'échéance totale du pipeline reste la limite supérieure.

## Vérifications

Les tests de route vérifient les cartes de découverte sans prix/tokens non prouvés et le remplacement des cartes SSE par URL source. Les tests mobiles vérifient que le cadre demeure manuel et que `/detect` ne reçoit/produit aucun prix.
