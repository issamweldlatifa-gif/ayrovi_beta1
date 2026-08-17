import React from 'react';

export type ContentCardVariant = 'arrival' | 'promo' | 'magazine';

interface ContentCardProps {
  variant: ContentCardVariant;
  image: string;
  imageAlt?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: string;
  children?: React.ReactNode;
  dir?: 'ltr' | 'rtl';
}

const variantClasses: Record<ContentCardVariant, { body: string; eyebrow: string; description: string }> = {
  arrival: { body: 'bg-surface-alt text-ink', eyebrow: 'text-brand', description: 'text-muted' },
  promo: { body: 'bg-surface-base text-ink', eyebrow: 'text-brand', description: 'text-muted' },
  magazine: { body: 'bg-white text-ink', eyebrow: 'text-brand', description: 'text-muted' },
};

/** One content-card geometry with token-driven variants for all discovery tabs. */
export const ContentCard: React.FC<ContentCardProps> = ({ variant, image, imageAlt = '', eyebrow, title, description, badge, children, dir }) => {
  const styles = variantClasses[variant];
  return (
    <article className="overflow-hidden rounded-card border border-line bg-white shadow-card" dir={dir}>
      <div className="relative aspect-[16/10] overflow-hidden bg-surface">
        <img src={image} alt={imageAlt} className="h-full w-full object-cover" loading="lazy" />
        {badge && <span className="absolute start-3 top-3 rounded-full bg-brand px-2.5 py-1 text-[10px] font-black text-white">{badge}</span>}
      </div>
      <div className={`flex min-h-52 flex-col p-6 ${styles.body}`}>
        {eyebrow && <p className={`text-xs font-black uppercase tracking-[0.16em] ${styles.eyebrow}`}>{eyebrow}</p>}
        <h2 className="mt-2 font-display text-2xl font-black tracking-tight">{title}</h2>
        {description && <p className={`mt-3 text-sm leading-6 ${styles.description}`}>{description}</p>}
        {children && <div className="mt-auto pt-5">{children}</div>}
      </div>
    </article>
  );
};
