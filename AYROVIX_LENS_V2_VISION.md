# AYROVIX Lens V2 — architecture et expérience

## Objectif

Lens offre une expérience de recherche produit unifiée à partir d’une photo, d’une capture d’écran, d’un lien, d’un QR code ou d’un code-barres. L’interface reste simple, tandis que le serveur applique des règles strictes de provenance, de prix et de sécurité.

## Architecture active

### 1. Entrées locales

- La caméra capture une image ou décode localement les QR, EAN, UPC et Code128.
- Les captures contenant du texte sont envoyées en PNG, jusqu’à 1600 px, sans filtres colorimétriques qui pourraient modifier les chiffres.
- Les photos produit sont redimensionnées et compressées en JPEG jusqu’à 1280 px.
- Le serveur décode, valide et réencode l’image en mémoire avec `sharp`; le flux Lens ne la sauvegarde pas dans les uploads.

### 2. Claude Vision

Une seule requête Anthropic structurée renvoie :

- type probable de l’entrée;
- catégorie, marque, modèle, variante et codes visibles;
- textes et couleurs utiles;
- confiance de l’identification;
- prix visible, devise, type du prix et confiance.

Claude doit décrire uniquement ce qui est visible. Il ne doit inventer ni marque, ni référence, ni prix. Un prix barré est signalé comme ancien prix et n’est pas utilisé pour commander.

### 3. Découverte produit

- Le catalogue AYROVI est interrogé localement en premier.
- Claude Web Search est le seul mécanisme de recherche externe de Lens.
- Chaque requête autorise au maximum une recherche Web, avec cache cinq minutes et regroupement des demandes identiques.
- Les résultats sont dédupliqués et classés selon la référence, la marque, le modèle et les couleurs.

### 4. Liens et prix

- Tous les liens passent par une protection SSRF : protocoles, credentials, DNS, IP privées/réservées, taille, redirections et délais sont contrôlés.
- Le serveur extrait les métadonnées, JSON-LD et prix de la page produit sans lancer de navigateur complet.
- Le prix direct d’une fiche magasin est prioritaire. Claude peut aider à trouver la page, mais ne génère pas son prix.
- Une commande fondée initialement sur un prix visible dans une image exige que le lien direct soit vérifié et fournisse un prix exploitable.

## Contrat API

- `POST /api/ayrovix/analyze-image` — image → identification, `detectedPrice`, candidats.
- `POST /api/ayrovix/analyze-url` — lien/QR URL → produit et candidats.
- `POST /api/ayrovix/analyze-code` — texte QR ou référence alphanumérique → candidats.
- `POST /api/ayrovix/analyze-barcode` — code numérique 6–14 chiffres → candidats.
- `POST /api/ayrovix/choose` — enregistre anonymement le choix du candidat.

Les réponses utilisent `detectedPrice`; l’ancien nom de champ lié à une implémentation OCR n’appartient plus au contrat Lens.

## UX

### Caméra

- viseur à coins et ligne de balayage;
- capture directe, import de galerie et mode code;
- torche si l’appareil la permet;
- repli propre si la caméra est refusée;
- arrêt de toutes les pistes vidéo à la fermeture.

### Résultats

- plusieurs candidats avec score de correspondance;
- distinction entre collection locale et marché externe;
- prix repéré dans l’image affiché comme indication;
- conversion et total AYROVI calculés par le moteur tarifaire existant;
- champ de vérification du lien avant commande lorsque le prix vient de l’image.

### Messages

Le client affiche des formulations utiles à l’acheteur : analyse, prix repéré, référence produit, lien direct et résultat vérifié. Les détails de fournisseur restent dans les diagnostics Admin et les logs serveur.

## Confidentialité et sécurité

- La clé Anthropic reste exclusivement côté serveur et ne porte jamais de préfixe `VITE_`.
- Lens n’appelle aucun autre fournisseur IA ou moteur de recherche externe.
- Les données analytiques sont anonymisées et les images Lens ne sont pas conservées par ce flux.
- Les résultats IA restent indicatifs; le prix du marchand doit être vérifié à la source.

## Vérifications avant livraison

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
git diff --check
```

Le déploiement doit aussi être testé avec une image, un lien produit, un QR URL, un QR texte et un code-barres réel, sans jamais imprimer ni enregistrer la clé Anthropic.
