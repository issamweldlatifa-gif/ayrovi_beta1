import React from 'react';
import { Search, ShieldCheck, Tag, Zap } from './QatafoIcons';

/**
 * SECTION 02 — AYROVI LENS (تحت LENS مباشرة)
 *
 * إعادة بناء نفس الـ composition المرجعي (4 Features بأيقونات ناعمة وفاصلات
 * رقيقة وخلفية بيضاء) لكن Mobile-first: على الهاتف عمود واحد واسع بفاصلات
 * أفقية رفيعة، وعلى Desktop العودة إلى 4 أعمدة جنب بعض كما في المرجع.
 *
 * العنوان الرئيسي للقسم خارج الـ Features وفي الأعلى — ليس داخل Card.
 * Editorial / Premium، لا Shadows قوية ولا Cards ضخمة، Orange كـ accent فقط.
 */

interface LensFeature {
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
}

const FEATURES: LensFeature[] = [
  {
    icon: Search,
    title: 'Analyse intelligente',
    description: 'LENS détecte le produit, les caractéristiques et les détails importants.',
  },
  {
    icon: Tag,
    title: 'Compare les prix',
    description: 'Trouvez les meilleures offres parmi plusieurs boutiques fiables.',
  },
  {
    icon: ShieldCheck,
    title: 'Fiable & sécurisé',
    description: 'Vos données sont protégées. Achats 100% sécurisés.',
  },
  {
    icon: Zap,
    title: 'Rapide & précis',
    description: 'Obtenez des résultats clairs en quelques secondes seulement.',
  },
];

export const LensFeaturesSection: React.FC = () => (
  <section aria-label="Pourquoi LENS" className="lens-features">
    {/* Heading block — خارج الـ Features وفي أعلى القسم */}
    <div className="lens-features__head">
      <h2 className="lens-features__title">LENS, simplement plus intelligent.</h2>
      <p className="lens-features__subtitle">L’œil intelligent d’AYROVI analyse, compare et sécurise chaque achat.</p>
    </div>

    <div className="lens-features__grid">
      {FEATURES.map((feature) => {
        const Icon = feature.icon;
        return (
          <article key={feature.title} className="lens-feature">
            <span className="lens-feature__icon" aria-hidden><Icon size={20} /></span>
            <h3 className="lens-feature__title">{feature.title}</h3>
            <p className="lens-feature__desc">{feature.description}</p>
          </article>
        );
      })}
    </div>
  </section>
);
