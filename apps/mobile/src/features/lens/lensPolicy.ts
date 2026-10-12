/**
 * سياسة استعمال AYROVI Lens — النص المعتمد من المالك (مسودة `docs/LENS_POLICY_DRAFT.md`).
 *
 * تُعرض في شاشة المساعدة بلغة التطبيق الحالية فقط. أي تعديل على النص يمرّ
 * عبر المالك أولاً، وليس عبر الكود.
 */
export type LensPolicySection = { title: string; items?: readonly string[]; body?: string };

export type LensPolicy = {
  title: string;
  intro: string;
  sections: readonly LensPolicySection[];
};

export const LENS_POLICY: Readonly<Record<'ar' | 'fr', LensPolicy>> = {
  ar: {
    title: 'مساعدة Lens',
    intro: 'Lens يساعدك على البحث عن منتج عبر صورة أو رابط أو رمز. النتائج تأتي من المتاجر المنشورة، والأسعار تُعرض بالدينار التونسي كما يرسلها الخادم.',
    sections: [
      {
        title: 'مسموح',
        items: [
          'تصوير منتج أو اختيار صورة من معرض جهازك.',
          'مسح رمز QR أو رمز شريطي (باركود) لمنتج.',
          'إدخال رابط منتج أو نص للبحث.',
        ],
      },
      {
        title: 'ممنوع',
        items: [
          'رفع صور لأشخاص دون إذنهم، أو صور تكشف معلومات خاصة أو حساسة.',
          'رفع محتوى غير قانوني أو مسيء أو يحرّض على العنف.',
          'رفع صور أو روابط لا تملك حق استعمالها.',
          'محاولة استغلال الخدمة (إرسال طلبات آلية كثيرة، أو تجاوز حدودها).',
        ],
      },
      {
        title: 'الأسعار والتوفّر',
        body: 'الأسعار والتوفّر والعروض تأتي من المتاجر عبر الخادم وقد تتغيّر. AYROVI لا تضمن دقتها في كل لحظة؛ تحقّق من المتجر قبل الشراء.',
      },
      {
        title: 'البيانات',
        body: 'تُحفظ الصور والروابط والرموز التي تستعملها مع طلباتك، لتشغيل الميزة التي تستعملها (انظر سياسة الخصوصية).',
      },
    ],
  },
  fr: {
    title: 'Aide Lens',
    intro: 'Lens vous aide à trouver un produit à partir d’une photo, d’un lien ou d’un code. Les résultats proviennent des boutiques publiées ; les prix sont affichés en dinars tunisiens tels que transmis par le serveur.',
    sections: [
      {
        title: 'Autorisé',
        items: [
          'Photographier un produit ou choisir une image dans votre galerie.',
          'Scanner un QR code ou un code-barres de produit.',
          'Saisir un lien de produit ou un texte de recherche.',
        ],
      },
      {
        title: 'Interdit',
        items: [
          'Importer des images de personnes sans leur consentement, ou des images révélant des informations privées ou sensibles.',
          'Importer du contenu illégal, offensant ou incitant à la violence.',
          'Importer des images ou liens dont vous n’avez pas le droit d’usage.',
          'Détourner le service (envoi automatisé massif, contournement des limites).',
        ],
      },
      {
        title: 'Prix et disponibilité',
        body: 'Les prix, stocks et offres proviennent des boutiques via le serveur et peuvent changer. AYROVI ne garantit pas leur exactitude à tout moment ; vérifiez auprès de la boutique avant d’acheter.',
      },
      {
        title: 'Données',
        body: 'Les images, liens et codes que vous envoyez sont conservés pour faire fonctionner la fonctionnalité utilisée (voir la politique de confidentialité).',
      },
    ],
  },
};
