import React, { useEffect, useState } from 'react';
import { FacebookBrandIcon, InstagramBrandIcon, TiktokBrandIcon, WhatsappBrandIcon } from '../design/BrandIcon';
import { MessageSquare, MapPin, User } from './QatafoIcons';
import { getCommerceConfig } from '../services/publicApi';
import { useLocale } from '../i18n/LocaleContext';
import { PUBLIC_PAGES } from '../navigation/publicPages';

interface FooterProps {
  onOpenAccount?: () => void;
  onOpenAssistant?: () => void;
  onOpenAbout?: () => void;
  logoUrl?: string;
  introTitle?: string;
  introText?: string;
}
/** Public links must not execute scripts or point at unconfigured accounts. */
export function safeChannelUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return null;
  try { const url = new URL(value.trim()); return url.username || url.password ? null : url.href; } catch { return null; }
}
const socialDefinitions = [
  { id: 'facebook', label: 'Facebook', Icon: FacebookBrandIcon },
  { id: 'instagram', label: 'Instagram', Icon: InstagramBrandIcon },
  { id: 'tiktok', label: 'TikTok', Icon: TiktokBrandIcon },
  { id: 'whatsapp', label: 'WhatsApp', Icon: WhatsappBrandIcon },
] as const;

export const Footer: React.FC<FooterProps> = ({ onOpenAccount, onOpenAssistant, onOpenAbout, introTitle, introText }) => {
  const { tr } = useLocale();
  const [channels, setChannels] = useState<Record<string, unknown>>({});
  const [footerAbout, setFooterAbout] = useState('');
  useEffect(() => {
    let active = true;
    getCommerceConfig().then(payload => {
      if (!active) return;
      const values = payload.data?.channels;
      if (values && typeof values === 'object' && !Array.isArray(values)) setChannels(values);
      if (typeof payload.data?.footerAbout === 'string') setFooterAbout(payload.data.footerAbout);
    }).catch(() => { /* No made-up contact details on API failure. */ });
    return () => { active = false; };
  }, []);
  return <footer className="public-site-footer" data-site-footer>
    <nav className="public-footer-nav" aria-label={tr('Navigation de bas de page', 'روابط أسفل الصفحة')}>
      {PUBLIC_PAGES.map(page => <a key={page.id} href={page.href} dir="ltr">{page.label}</a>)}
      {onOpenAbout && <button type="button" onClick={onOpenAbout}>{tr('À propos', 'عن AYROVI')}</button>}
      {onOpenAssistant && <button type="button" onClick={onOpenAssistant}>{tr('Contact', 'تواصل معنا')}</button>}
    </nav>
    <div className="public-footer-socials" id="nos-canaux" aria-label={tr('Nos canaux officiels', 'قنواتنا الرسمية')}>
      {socialDefinitions.map(({ id, label, Icon }) => {
        const href = safeChannelUrl(channels[id]);
        const content = <><span className="public-footer-social-mark"><Icon /></span><span>{label}</span></>;
        return href
          ? <a key={id} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>{content}</a>
          : <span key={id} className="public-footer-social-unavailable" aria-label={tr(`${label} : lien non renseigné`, `${label}: الرابط غير مضبوط`)} title={tr('Lien non renseigné', 'الرابط غير مضبوط')}>{content}</span>;
      })}
    </div>
    <div className="public-footer-message">
      <h2>{introTitle || tr('Vos envies, notre point de départ.', 'رغباتك، نقطة البداية.')}</h2>
      <p dir="auto">{introText || footerAbout || tr('Nos espaces et les informations utiles, au même endroit.', 'أقسامنا والمعلومات اللي تستحقّها، في بلاصة واحدة.')}</p>
    </div>
    <div className="public-footer-contacts">
      <button type="button" onClick={onOpenAssistant} disabled={!onOpenAssistant}><MessageSquare size={22} /><span><strong>{tr('Parlons de votre commande', 'نحكيو على طلبك')}</strong><small>{tr('Contact et accompagnement', 'تواصل ومساعدة')}</small></span></button>
      <button type="button" onClick={onOpenAccount} disabled={!onOpenAccount}><User size={22} /><span><strong>{tr('Votre espace', 'فضاءك')}</strong><small>{tr('Commandes et favoris', 'الطلبات والمفضلة')}</small></span></button>
      <div><MapPin size={22} /><span><strong>{tr('En Tunisie', 'في تونس')}</strong><small>{tr('Vos achats en dinars tunisiens', 'مشترياتك بالدينار التونسي')}</small></span></div>
    </div>
    <div className="public-footer-bottom">
      <span>© {new Date().getFullYear()} AYROVI — {tr('Tous droits réservés', 'جميع الحقوق محفوظة')}</span>
      <a href="/privacy.html">{tr('Confidentialité', 'الخصوصية')}</a>
      <a href="/terms.html">{tr('Conditions d’utilisation', 'شروط الاستخدام')}</a>
      <a href="/data-deletion.html">{tr('Suppression des données', 'حذف البيانات')}</a>
    </div>
  </footer>;
};
