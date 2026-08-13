# AYROVIX Lens — configuration Anthropic

## Architecture active

AYROVIX Lens utilise **Anthropic uniquement** pour ses fonctions IA et sa recherche externe :

- **Claude Vision** identifie le produit et lit un prix réellement visible dans l’image au cours d’une seule requête structurée.
- **Claude Web Search** découvre des pages produit externes avec une recherche maximum par analyse.
- Le catalogue AYROVI reste une source locale, sans API externe.
- Les QR codes et codes-barres sont décodés localement dans le navigateur, puis leur valeur est envoyée au serveur pour l’analyse de lien ou la recherche Claude.
- Les pages produit sont lues par un fetch HTML sécurisé afin d’obtenir leurs métadonnées et leur prix direct. Claude n’invente pas le prix d’un magasin.

Il n’existe ni cascade vers un autre fournisseur IA, ni moteur de recherche alternatif, ni résultat générique inventé en cas d’échec. Sans clé Anthropic valide, Lens répond explicitement comme indisponible.

## Variables Render

Toutes ces variables sont **serveur uniquement** :

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
AYROVIX_PROVIDER_TIMEOUT_MS=5000
AYROVIX_SEARCH_TIMEOUT_MS=7000
AYROVIX_ANTHROPIC_WEB_SEARCH=true
```

Ne créez jamais de variable `VITE_*` pour la clé. Toute variable préfixée par `VITE_` est intégrée au JavaScript envoyé au navigateur.

## Capacités prises en charge

| Entrée | Traitement |
|---|---|
| Photo produit | Claude Vision → catalogue local → Claude Web Search |
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
- Si la page ne permet pas de vérifier son prix, Lens demande un autre lien direct au lieu de valider un montant non confirmé.

## Diagnostic

1. Vérifiez que `ANTHROPIC_API_KEY` existe dans **Render → Environment** et que le compte Anthropic dispose de crédits.
2. Vérifiez les logs serveur : Vision affiche `Trying Claude` puis `Claude SUCCESS`; la recherche affiche `anthropic-search`.
3. Dans **Admin → Rapports**, les deux badges doivent indiquer `Claude Vision` et `Claude Web Search` configurés.
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
- Les images Lens sont validées et réencodées en mémoire; elles ne sont pas écrites dans les uploads par le flux Lens.
- La résolution DNS, les redirections et les adresses privées sont contrôlées avant la lecture d’un lien.
