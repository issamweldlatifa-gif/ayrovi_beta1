import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Info, X } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { getPublicHome } from '../services/publicApi';

interface TopAnnouncementBarProps { onLearnMore?: () => void; }
export interface PublishedCampaign { title: string; description: string; href: string; }
/** Only published, currently valid provider data; never invent a discount. */
export function publishedCampaign(rows: unknown, now: number): PublishedCampaign | null {
  if (!Array.isArray(rows)) return null;
  const active = rows.find(row => row && typeof row.name === 'string' && row.name.trim()
    && row.status === 'ACTIVE' && Number.isFinite(Date.parse(row.starts_at)) && Date.parse(row.starts_at) <= now
    && Number.isFinite(Date.parse(row.ends_at)) && Date.parse(row.ends_at) > now);
  return active ? { title: active.name.trim(), description: typeof active.description === 'string' ? active.description : '', href: '/gift-cards' } : null;
}

/** Advertising block below Navbar. Original service messages remain available in Info. */
export const TopAnnouncementBar: React.FC<TopAnnouncementBarProps> = () => {
  const { tr } = useLocale();
  const [campaign, setCampaign] = useState<PublishedCampaign | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const infoId = useId();
  useEffect(() => {
    let active = true;
    getPublicHome().then(payload => {
      if (active) setCampaign(publishedCampaign(payload.data?.promotions, Date.parse(payload.serverTime || '') || Date.now()));
    }).catch(() => { /* Neutral discovery banner, not a fabricated offer. */ });
    const controller = new AbortController();
    fetch('/api/public/announcement-messages', { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(payload => {
      if (active && payload?.success && Array.isArray(payload.data)) setMessages(payload.data.map((row: { text?: unknown }) => typeof row?.text === 'string' ? row.text.trim() : '').filter(Boolean));
    }).catch(() => { /* Existing CMS content remains untouched on the server. */ });
    return () => { active = false; controller.abort(); };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (!infoOpen || !node) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => { document.body.style.overflow = overflow; if (node.open) node.close(); };
  }, [infoOpen]);
  const title = campaign?.title || tr('Découvrez les nouveautés AYROVI.', 'اكتشف جديد AYROVI.');
  const description = campaign?.description || tr('Vos prochaines découvertes commencent ici.', 'اختياراتك الجديدة تبدأ من هنا.');
  return <>
    <section className="public-campaign relative z-10" aria-labelledby={titleId} data-public-campaign>
      <div className="public-campaign-inner">
        <button type="button" className="public-campaign-info" onClick={() => setInfoOpen(true)} aria-label={tr('Informations et conditions', 'المعلومات والشروط')} aria-haspopup="dialog"><Info size={24} /></button>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <a href={campaign?.href || '/arrivage'}>{tr('Découvrir', 'اكتشف')}<ArrowRight size={24} /></a>
      </div>
    </section>
    <dialog ref={dialog} className="public-campaign-dialog" aria-labelledby={infoId} onClose={() => setInfoOpen(false)}>
      <header><h2 id={infoId}>{tr('Informations et conditions', 'المعلومات والشروط')}</h2><button type="button" onClick={() => setInfoOpen(false)} aria-label={tr('Fermer', 'إغلاق')}><X size={24} /></button></header>
      <p>{description}</p>
      {messages.length > 0 && <ul>{messages.map((message, index) => <li key={index} dir="auto">{message}</li>)}</ul>}
      <a href={campaign?.href || '/arrivage'}>{tr('Voir les détails', 'اطّلع على التفاصيل')}<ArrowRight size={20} /></a>
    </dialog>
  </>;
};
