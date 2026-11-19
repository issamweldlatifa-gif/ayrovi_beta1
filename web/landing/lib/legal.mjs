import { copy } from '../copy.mjs';
import { brand, documentHtml } from './html.mjs';

// Editorial drafts for review, not a replacement for the currently effective terms.
const sections = {
  fr: {
    confidentialite: ['policy', [
      ['Données liées au service', 'Les recherches Lens peuvent traiter les photos, liens et codes que vous choisissez d’utiliser. Le compte et la commande peuvent nécessiter des coordonnées, une adresse de livraison et des informations de commande.'],
      ['Vos droits', 'Consultez la version actuellement disponible pour le détail des finalités, des prestataires, de la conservation et des droits. Les demandes liées à un compte peuvent être faites depuis l’application.'],
    ], '/privacy.html'],
    conditions: ['terms', [
      ['Avant confirmation', 'Le récapitulatif indique le produit et les montants. Si le prix ou la disponibilité doit être vérifié manuellement, cette vérification intervient avant l’achat définitif.'],
      ['Confirmation et suivi', 'Une commande enregistrée n’est confirmée qu’après validation de l’acompte. Le suivi se trouve dans l’espace client.'],
    ], '/terms.html'],
    retours: ['returns', [
      ['Indisponibilité avant achat', 'Le texte actuel prévoit le remboursement de l’acompte correspondant si ZAYROVI ne peut pas valider ou acheter l’article, selon le moyen convenu avec le client.'],
      ['Retour après achat', 'La situation dépend notamment de l’état du produit, des règles du marchand et des frais déjà engagés. Contactez le support depuis votre compte pour demander l’examen de votre commande.'],
    ], '/terms.html'],
    contact: ['contact', [['Une question sur une commande ?', 'Ouvrez votre compte dans ZAYROVI et utilisez les canaux d’assistance indiqués dans l’application. Ne communiquez pas de numéro de carte ni de mot de passe.']]],
    'suppression-des-donnees': ['data', [['Depuis l’application', 'Ouvrez Mon compte → Profil → Supprimer mon compte. La politique de confidentialité explique quels documents peuvent être conservés lorsque la conservation est nécessaire.']], '/data-deletion.html'],
  },
  ar: {
    confidentialite: ['policy', [
      ['البيانات المستعملة للخدمة', 'بحث Lens ينجم يعالج الصور والروابط والرموز اللي تختار تستعملها. الحساب والطلب ينجموا يستحقّوا بيانات التواصل والتوصيل ومعلومات الطلب.'],
      ['حقوقك', 'راجع النص الحالي باش تعرف تفاصيل الأغراض والمزوّدين ومدّة الاحتفاظ وحقوقك. الطلبات المرتبطة بحسابك تتقدّم من التطبيق.'],
    ], '/privacy.html'],
    conditions: ['terms', [
      ['قبل التأكيد', 'ملخّص الطلب يبيّن المنتج والمبالغ. إذا السعر أو التوفّر يستحقّ تثبّت يدوي، يصير التثبّت قبل الشراء النهائي.'],
      ['التأكيد والمتابعة', 'الطلب المسجّل يتأكّد بعد التحقّق من العربون. تنجم تتابع طلبك من حسابك.'],
    ], '/terms.html'],
    retours: ['returns', [
      ['عدم التوفّر قبل الشراء', 'النص الحالي ينصّ على إرجاع العربون المعني إذا تعذّر التحقّق من المنتج أو شراؤه، بالطريقة المتّفق عليها مع الحريف.'],
      ['الإرجاع بعد الشراء', 'الإرجاع يعتمد على حالة المنتج وشروط التاجر والمصاريف المدفوعة. اتصل بالدعم من حسابك لطلب مراجعة طلبيتك.'],
    ], '/terms.html'],
    contact: ['contact', [['عندك سؤال على طلبية؟', 'افتح حسابك في ZAYROVI واستعمل قنوات الدعم الموجودة في التطبيق. ما تبعثش رقم بطاقتك ولا كلمة السر.']]],
    'suppression-des-donnees': ['data', [['من التطبيق', 'افتح حسابي ← الملف الشخصي ← حذف الحساب. سياسة الخصوصية تفسّر شنوّة الوثائق اللي تنجم تبقى وقت يلزم الاحتفاظ بيها.']], '/data-deletion.html'],
  },
};
export const legalPaths = Object.keys(sections.fr);
export function legalHtml(locale, slug, origin) {
  const t = copy[locale], ar = locale === 'ar';
  const [key, blocks, original] = sections[locale][slug];
  const draft = ar ? 'ملخّص للمراجعة، لا يعوّض النص الحالي.' : 'Résumé à valider. Il ne remplace pas le texte actuellement applicable.';
  return documentHtml({ locale, title: `${t[key]} · ZAYROVI`, description: draft, robots: 'noindex,follow',
    canonical: origin + (ar ? '/ar/' : '/') + slug,
    body: `<header class="top"><div class="wrap bar"><a class="brand" href="${ar ? '/ar/' : '/'}">${brand}</a><a class="lang" href="${ar ? '/' : '/ar/'}${slug}">${t.alternate}</a></div></header><main class="paper-page"><h1>${t[key]}</h1><p class="small">${draft}</p>${blocks.map(([h,p])=>`<h2>${h}</h2><p>${p}</p>`).join('')}${original ? `<p><a href="${original}">${ar ? 'اقرأ النص الحالي (بالفرنسية)' : 'Lire le texte actuellement disponible'}</a></p>` : ''}</main>` });
}
