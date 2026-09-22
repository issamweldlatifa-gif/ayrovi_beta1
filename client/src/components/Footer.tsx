import React, { useEffect, useState } from 'react';
import { FacebookBrandIcon, InstagramBrandIcon, TiktokBrandIcon, WhatsappBrandIcon } from '../design/BrandIcon';
import { Info, MessageSquare, MapPin, User } from './QatafoIcons';
import { getCommerceConfig } from '../services/publicApi';
import { useLocale } from '../i18n/LocaleContext';

interface FooterProps {
  onOpenAccount?: () => void;
  onOpenAssistant?: () => void;
  onOpenAbout?: () => void;
  logoUrl?: string;
  introTitle?: string;
  introText?: string;
}
/**
 * Public links must not execute scripts or point at unconfigured accounts.
 * Décision produit du 2026-09-22 : la copie du sommaire de pages (Arrivage / Gift & Cards /
 * Magazine) a été retirée du pied de page — ces destinations vivent désormais dans la barre
 * sous l'en-tête, pilotée depuis l'Admin. Le pied de page redevient une signature de marque :
 * identité, canaux officiels, accès utiles et documents légaux.
 */
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

/**
 * Canaux réellement publiables : seules les adresses https valides venues de l'Admin.
 * Un canal non renseigné (ou refusé par `safeChannelUrl`) reste inerte dans le pied de page —
 * jamais un faux compte, jamais un lien `javascript:`.
 */
export function footerChannelLinks(channels: unknown): Array<{ id: (typeof socialDefinitions)[number]['id']; label: string; href: string }> {
  if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return [];
  const values = channels as Record<string, unknown>;
  return socialDefinitions.flatMap(({ id, label }) => {
    const href = safeChannelUrl(values[id]);
    return href ? [{ id, label, href }] : [];
  });
}

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
  const publishedChannels = footerChannelLinks(channels);
  return <footer className="public-site-footer" data-site-footer>
    <div className="public-footer-inner">
      <div className="public-footer-message">
        {/* Le pied de page est noir : la marque inverse est forcée (le logo du thème est sombre). */}
        <img className="public-footer-logo" src="/media/logo-ayrovi-light.png" alt="AYROVI" width={132} height={40} />
        <h2>{introTitle || tr('Vos envies, notre point de départ.', 'رغباتك، نقطة البداية.')}</h2>
        <p dir="auto">{introText || footerAbout || tr('Nos espaces et les informations utiles, au même endroit.', 'أقسامنا والمعلومات اللي تستحقّها، في بلاصة واحدة.')}</p>
      </div>
      <nav className="public-footer-socials" id="nos-canaux" aria-label={tr('Nos canaux officiels', 'قنواتنا الرسمية')}>
        <span className="public-footer-social-title">{tr('Nos canaux officiels', 'قنواتنا الرسمية')}</span>
        {socialDefinitions.map(({ id, label, Icon }) => {
          const href = publishedChannels.find((channel) => channel.id === id)?.href;
          const content = <><span className="public-footer-social-mark"><Icon /></span><span>{label}</span></>;
          return href
            ? <a key={id} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${tr('AYROVI sur', 'AYROVI على')} ${label}`}>{content}</a>
            : <span key={id} className="public-footer-social-unavailable" aria-label={tr(`${label} : lien non renseigné`, `${label}: الرابط غير مضبوط`)} title={tr('Lien non renseigné', 'الرابط غير مضبوط')}>{content}</span>;
        })}
      </nav>
      <div className="public-footer-contacts">
        <button type="button" onClick={onOpenAssistant} disabled={!onOpenAssistant}><MessageSquare size={22} /><span><strong>{tr('Parlons de votre commande', 'نحكيو على طلبك')}</strong><small>{tr('Contact et accompagnement', 'تواصل ومساعدة')}</small></span></button>
        <button type="button" onClick={onOpenAccount} disabled={!onOpenAccount}><User size={22} /><span><strong>{tr('Votre espace', 'فضاءك')}</strong><small>{tr('Commandes et favoris', 'الطلبات والمفضلة')}</small></span></button>
        <div><MapPin size={22} /><span><strong>{tr('En Tunisie', 'في تونس')}</strong><small>{tr('Vos achats en dinars tunisiens', 'مشترياتك بالدينار التونسي')}</small></span></div>
        {onOpenAbout && <button type="button" onClick={onOpenAbout}><Info size={22} /><span><strong>{tr('À propos d’AYROVI', 'عن AYROVI')}</strong><small>{tr('Notre maison, nos engagements', 'قصتنا والتزاماتنا')}</small></span></button>}
      </div>
    </div>
    <div className="public-footer-bottom">
      <span>© {new Date().getFullYear()} AYROVI — {tr('Tous droits réservés', 'جميع الحقوق محفوظة')}</span>
      <a href="/privacy.html">{tr('Confidentialité', 'الخصوصية')}</a>
      <a href="/terms.html">{tr('Conditions d’utilisation', 'شروط الاستخدام')}</a>
      <a href="/data-deletion.html">{tr('Suppression des données', 'حذف البيانات')}</a>
    </div>
  </footer>;
};
