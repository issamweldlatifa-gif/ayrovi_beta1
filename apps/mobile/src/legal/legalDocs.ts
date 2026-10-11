/**
 * Textes des pages légales, lus par l’application (écrans dans l’application,
 * avec retour — jamais une page du navigateur).
 *
 * Source : `public/terms.html` et `public/privacy.html` du site. Le texte est repris
 * À L’IDENTIQUE (même contenu, même ordre), seule la mise en forme change : on
 * l’affiche avec la police de l’application. À RESYNCHRONISER si le texte du site
 * change — c’est le seul endroit où ces pages vivent côté application.
 *
 * `kind` : h2 = titre de section · p = paragraphe · li = élément de liste
 *          · notice = encadré « résumé ».
 */

export type LegalBlockKind = 'h2' | 'p' | 'li' | 'notice';

export interface LegalBlock {
  kind: LegalBlockKind;
  text: string;
}

export interface LegalVersion {
  title: string;
  /** Date de version affichée sous le titre (facultative). */
  meta?: string;
  blocks: LegalBlock[];
}

export type LegalDocId = 'terms' | 'privacy';

/** Une version par langue ; une langue absente retombe sur le français. */
export const LEGAL_DOCS: Record<LegalDocId, Partial<Record<'fr' | 'ar', LegalVersion>>> = {
  terms: {
    fr: {
  "title": "Conditions de vente et politique de retour",
  "meta": "Version opérationnelle — 17 août 2026",
  "blocks": [
    {
      "kind": "p",
      "text": "AYROVI agit comme service d’accompagnement à l’achat. Le récapitulatif présenté avant confirmation détaille le produit, les frais, l’acompte et le solde."
    },
    {
      "kind": "h2",
      "text": "Commande et vérification"
    },
    {
      "kind": "p",
      "text": "La commande est enregistrée après validation du formulaire. Lorsqu’un prix ou une disponibilité doit être vérifié manuellement, l’équipe AYROVI effectue ce contrôle avant l’achat définitif. La commande n’est confirmée qu’après réception et validation de l’acompte."
    },
    {
      "kind": "h2",
      "text": "Acompte et article indisponible"
    },
    {
      "kind": "p",
      "text": "Le montant et le pourcentage de l’acompte sont affichés avant confirmation. Si AYROVI ne peut pas valider ou acheter l’article demandé, l’acompte correspondant est remboursé selon le moyen convenu avec le client. Aucun numéro de carte ne doit être envoyé par message."
    },
    {
      "kind": "h2",
      "text": "Annulation et retour"
    },
    {
      "kind": "p",
      "text": "Une demande d’annulation doit être transmise au support le plus tôt possible. Avant l’achat marchand, elle peut être traitée après vérification. Après l’achat, les possibilités de retour dépendent de l’état du produit, des règles du marchand et des frais déjà engagés. AYROVI communique au client la décision et les montants applicables avant toute opération complémentaire."
    },
    {
      "kind": "h2",
      "text": "Livraison et suivi"
    },
    {
      "kind": "p",
      "text": "Le client doit fournir des coordonnées exactes. La position géographique est facultative et sert uniquement à faciliter la livraison. Le suivi de la commande est disponible dans l’espace client."
    },
    {
      "kind": "h2",
      "text": "Données et contact"
    },
    {
      "kind": "p",
      "text": "Consultez la politique de confidentialité. Pour une commande, utilisez l’espace client ou les canaux de contact officiels affichés par AYROVI."
    }
  ]
},
    ar: {
  "title": "شروط البيع وسياسة الإرجاع",
    "blocks": [
    {
      "kind": "p",
      "text": "تعمل AYROVI كخدمة مرافقة للشراء. يعرض ملخص الطلب المنتج والمصاريف والعربون والمبلغ المتبقي قبل التأكيد."
    },
    {
      "kind": "h2",
      "text": "الطلب والتحقق"
    },
    {
      "kind": "p",
      "text": "يُسجل الطلب بعد اعتماد النموذج. عندما يحتاج السعر أو التوفر إلى مراجعة يدوية، يتحقق فريق AYROVI قبل الشراء النهائي. لا يصبح الطلب مؤكدًا إلا بعد استلام العربون والتحقق منه."
    },
    {
      "kind": "h2",
      "text": "العربون وتعذر شراء المنتج"
    },
    {
      "kind": "p",
      "text": "تظهر قيمة العربون ونسبته قبل التأكيد. إذا تعذر على AYROVI التحقق من المنتج أو شراؤه، يُرجع العربون المتعلق به بالطريقة المتفق عليها مع العميل. لا ترسل رقم بطاقتك البنكية عبر الرسائل."
    },
    {
      "kind": "h2",
      "text": "الإلغاء والإرجاع"
    },
    {
      "kind": "p",
      "text": "يجب إرسال طلب الإلغاء إلى الدعم في أقرب وقت. قبل شراء المنتج من المتجر يمكن النظر في الإلغاء بعد التحقق. بعد الشراء تعتمد إمكانية الإرجاع على حالة المنتج وشروط المتجر والمصاريف التي تم دفعها، ويبلّغ فريق AYROVI العميل بالقرار والتكاليف قبل أي إجراء إضافي."
    },
    {
      "kind": "h2",
      "text": "التوصيل والمتابعة"
    },
    {
      "kind": "p",
      "text": "يجب تقديم بيانات توصيل صحيحة. مشاركة الموقع الجغرافي اختيارية وتُستعمل لتسهيل التوصيل فقط. يمكن متابعة الطلب داخل حساب العميل."
    },
    {
      "kind": "h2",
      "text": "البيانات والتواصل"
    },
    {
      "kind": "p",
      "text": "راجع سياسة الخصوصية، واستعمل حساب العميل أو قنوات AYROVI الرسمية لأي استفسار عن الطلب."
    }
  ]
},
  },
  privacy: {
    fr: {
  "title": "Politique de confidentialité",
  "meta": "Version du 16 août 2026",
  "blocks": [
    {
      "kind": "notice",
      "text": "Résumé : AYROVI collecte uniquement les données nécessaires à la connexion, au panier, aux commandes, à la livraison, au support et à la sécurité. Le mot de passe Google ou Facebook n’est jamais communiqué à AYROVI."
    },
    {
      "kind": "h2",
      "text": "1. Données traitées"
    },
    {
      "kind": "li",
      "text": "Données de compte : nom, adresse e-mail, téléphone facultatif, photo de profil et identifiant technique du fournisseur de connexion."
    },
    {
      "kind": "li",
      "text": "Données de commande : panier, adresses de livraison, téléphone de livraison, articles, montants, statut, facture et preuve d’acompte."
    },
    {
      "kind": "li",
      "text": "Données AYROVIX Lens et Assistant : images, liens, codes lus, demandes, réponses et feedback nécessaires à la fonctionnalité utilisée."
    },
    {
      "kind": "li",
      "text": "Données de sécurité : session, adresse IP, agent utilisateur, identifiants de requête, limites de débit et journaux d’erreurs."
    },
    {
      "kind": "h2",
      "text": "2. Finalités"
    },
    {
      "kind": "p",
      "text": "Ces données servent à authentifier le client, synchroniser son panier, calculer et exécuter les commandes, livrer les articles, émettre les factures, traiter les acomptes, répondre au support, prévenir la fraude et maintenir la sécurité de la plateforme."
    },
    {
      "kind": "h2",
      "text": "3. Connexion Google et Facebook"
    },
    {
      "kind": "p",
      "text": "AYROVI utilise un flux OAuth côté serveur. Google ou Meta peut transmettre un identifiant de compte, un nom, une adresse e-mail et une photo selon les autorisations accordées. AYROVI ne stocke pas le mot de passe du fournisseur et ne conserve pas le jeton Facebook après la connexion. L’adresse e-mail Facebook, lorsqu’elle est disponible, n’est pas utilisée seule pour fusionner automatiquement deux comptes."
    },
    {
      "kind": "h2",
      "text": "4. Prestataires techniques"
    },
    {
      "kind": "p",
      "text": "Selon les fonctionnalités activées, des données strictement nécessaires peuvent être traitées par l’hébergeur Render, Google, Meta, Anthropic, SerpApi, Groq, le prestataire d’e-mail transactionnel et le prestataire SMS. Les clés de ces services restent côté serveur."
    },
    {
      "kind": "h2",
      "text": "5. Conservation"
    },
    {
      "kind": "p",
      "text": "Les sessions et défis de connexion expirent automatiquement. Les données de profil restent jusqu’à leur modification ou suppression par le client. Les commandes, paiements, factures et éléments nécessaires à la preuve d’une transaction peuvent être conservés séparément pendant la durée requise pour l’exécution du service, la comptabilité, la prévention des litiges et les obligations légales applicables."
    },
    {
      "kind": "h2",
      "text": "6. Sécurité"
    },
    {
      "kind": "p",
      "text": "AYROVI utilise HTTPS, des cookies HttpOnly, une protection CSRF, des limites de débit, des contrôles d’accès, une séparation des sessions Admin/client et une base de données côté serveur. Aucun système n’étant infaillible, tout incident confirmé doit être traité et documenté."
    },
    {
      "kind": "h2",
      "text": "7. Suppression et droits du client"
    },
    {
      "kind": "p",
      "text": "Un client connecté peut ouvrir Mon compte → Profil → Supprimer mon compte. Cette action supprime le profil, les identités Google/Facebook, les sessions, les adresses, favoris et données personnelles liées au compte. Les documents de commande déjà créés restent archivés sans accès au compte lorsqu’une conservation opérationnelle ou légale est nécessaire."
    },
    {
      "kind": "p",
      "text": "Les instructions détaillées sont disponibles sur la page Suppression des données."
    },
    {
      "kind": "h2",
      "text": "8. Contact"
    },
    {
      "kind": "p",
      "text": "Demandes relatives aux données : contact@ayrovi.tn. Cette adresse doit être rendue opérationnelle avant l’ouverture publique générale."
    }
  ]
},
  },
};
