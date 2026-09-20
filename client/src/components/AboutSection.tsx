import React from 'react';
import { ArrowRightLeft, ShieldCheck, Truck } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import aboutImage from '../assets/about-parallax.jpg';

const benefits = [
  { icon: ArrowRightLeft, title: ['Taux fixe & garanti', 'سعر صرف ثابت ومضمون'], description: ['Un taux clair et garanti vous permet de connaître le montant exact en dinars dès la validation de votre panier.', 'سعر صرف واضح ومضمون يتيح لك معرفة المبلغ بالدينار عند تأكيد سلّتك.'] },
  { icon: ShieldCheck, title: ['Dédouanement inclus', 'التخليص الجمركي مشمول'], description: ['Les démarches administratives, taxes d’importation et le dédouanement sont pris en charge.', 'نتولى الإجراءات الإدارية ورسوم الاستيراد والتخليص الجمركي.'] },
  { icon: Truck, title: ['Livraison — 24 gouvernorats', 'التوصيل إلى 24 ولاية'], description: ['Expédition jusqu’à votre domicile partout en Tunisie après validation et préparation de la commande.', 'شحن إلى منزلك في كامل تونس بعد تأكيد الطلب وتجهيزه.'] },
] as const;

export const AboutSection: React.FC<{ coverImage?: string; title?: string; subtitle?: string }> = ({ coverImage, title, subtitle }) => {
  const { tr, isArabic } = useLocale();
  return <section id="about-ayrovi" aria-labelledby="why-ayrovi-title" className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
    <p className="mb-4 flex items-center gap-2 text-sm text-muted"><span className="ay-e-marker" aria-hidden />{tr('Pourquoi choisir AYROVI ?', 'لماذا تختار AYROVI؟')}</p>
    <h2 id="why-ayrovi-title" className="ay-e-display">{title || tr('La simplicité d’un achat local pour vos marques mondiales', 'سهولة الشراء المحلي لعلاماتك العالمية')}</h2>
    <p className="my-6 max-w-2xl text-base leading-8 text-muted">{subtitle || tr('Plus besoin de carte bancaire internationale ni de formalités douanières complexes. AYROVI s’occupe de l’importation de A à Z.', 'لا حاجة إلى بطاقة بنكية دولية أو إجراءات جمركية معقدة. تتولى AYROVI الاستيراد من البداية إلى النهاية.')}</p>
    <img src={coverImage || aboutImage} alt="" className="mb-8 aspect-[3/2] w-full object-cover" loading="lazy" />
    <div className="divide-y divide-line border-y border-line">
      {benefits.map(({ icon: Icon, title, description }, index) => <article key={title[0]} className="grid grid-cols-[32px_minmax(0,1fr)] gap-4 py-6">
        <Icon size={24} aria-hidden />
        <div><span className="ay-e-caption ay-e-number">0{index + 1}</span><h3 className="mb-2 mt-1 text-lg font-medium">{title[isArabic ? 1 : 0]}</h3><p className="text-sm leading-7 text-muted">{description[isArabic ? 1 : 0]}</p></div>
      </article>)}
    </div>
  </section>;
};
