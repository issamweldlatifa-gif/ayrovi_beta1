# AYROVIX Lens — configuration Claude + Google Lens

## Architecture active

AYROVIX Lens sépare compréhension et recherche visuelle :

- **Claude Vision** identifie le produit et lit un prix réellement visible dans l’image au cours d’une seule requête structurée.
- **SerpApi Google Lens** recherche la photo elle-même et renvoie des produits visuellement correspondants avec images, liens et prix éventuels.
- **Claude Web Search** reste le fallback texte lorsque Google Lens ne renvoie aucun produit, ainsi que pour les liens, QR et codes-barres.
- Le catalogue AYROVI reste une source locale.
- Les QR codes et codes-barres sont décodés localement dans le navigateur.
- Les pages produit sont lues par un fetch HTML sécurisé afin d’obtenir leurs métadonnées et leur prix direct. Aucun modèle n’invente le prix d’un magasin.

Claude et Google Lens sont lancés en parallèle pour éviter d'additionner leurs latences. Sans clé Anthropic valide, la compréhension/prix est indisponible; sans clé SerpApi, la recherche d'image revient automatiquement au texte Claude.

## Variables Render

Toutes ces variables sont **serveur uniquement** :

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
AYROVIX_PROVIDER_TIMEOUT_MS=12000
SERPAPI_KEY=
AYROVIX_VISUAL_SEARCH_TIMEOUT_MS=10000
AYROVIX_LENS_COUNTRY=fr
AYROVIX_SEARCH_TIMEOUT_MS=7000
AYROVIX_ANTHROPIC_WEB_SEARCH=true
# Optionnel pour les boutiques protégées par Akamai/Cloudflare
SCRAPERAPI_KEY=
AYROVIX_SCRAPER_COUNTRY=fr
```

Ne créez jamais de variable `VITE_*` pour la clé. Toute variable préfixée par `VITE_` est intégrée au JavaScript envoyé au navigateur.

## Capacités prises en charge

| Entrée | Traitement |
|---|---|
| Photo produit | Claude Vision + SerpApi Google Lens en parallèle → catalogue → Claude Web Search si aucun match visuel |
| Capture avec prix | Claude Vision lit uniquement le prix visible avec type et confiance |
| Lien produit | Validation SSRF → métadonnées/prix direct → catalogue + Claude Web Search |
| QR URL | Décodage local → même analyse sécurisée que le lien |
| QR texte | Décodage local → `/api/ayrovix/analyze-code` → catalogue + Claude Web Search |
| EAN/UPC/Code128 | Décodage local → `/api/ayrovix/analyze-barcode` → catalogue + Claude Web Search |

## Règles de prix

- Un prix issu d’une image n’est conservé que s’il correspond à un prix produit actuel ou au total d’un panier, avec une confiance d’au moins `0.65`.
- Un ancien prix barré ne devient jamais un prix de commande.
- Avant une commande fondée sur un prix lu dans une image, le client doit fournir puis vérifier le lien direct de la fiche produit.
- Le prix direct extrait de la page du magasin remplace le prix visuel dès qu’il est disponible.
- Quand la page publie des variantes, seules les tailles/couleurs disponibles sont proposées et leur prix propre remplace le prix général après sélection.
- Si la page ne permet pas de vérifier son prix, Lens propose de revenir aux autres résultats; aucun montant Lens non confirmé ne devient un prix de commande.
- `SCRAPERAPI_KEY` peut activer le fallback optionnel des boutiques protégées. Sans cette clé, le fetch HTML sécurisé normal reste utilisé.

## Diagnostic

1. Vérifiez que `ANTHROPIC_API_KEY` et `SERPAPI_KEY` existent dans **Render → Environment**.
2. Vérifiez les logs : Vision affiche `Claude SUCCESS`, Google Lens affiche `serpapi-lens`, et le fallback texte `anthropic-search`.
3. Dans **Admin → Rapports**, les badges doivent indiquer `Claude Vision`, `Google Lens` et `Claude Web Search` configurés.
4. Après une modification :

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

## Sécurité

- Ne copiez jamais une clé réelle dans ce fichier, dans Git, dans un ticket ou dans le chat.
- Faites tourner immédiatement toute clé déjà exposée.
- Les images Lens sont validées et réencodées en mémoire; elles ne sont pas écrites dans les uploads AYROVI. Une copie JPEG de 500 Ko maximum est envoyée à l'Image API SerpApi pour obtenir un identifiant temporaire.
- La résolution DNS, les redirections et les adresses privées sont contrôlées avant la lecture d’un lien.
