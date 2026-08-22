import React, { useEffect, useState } from 'react';
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp } from 'react-icons/fa6';
import { Heart, MessageSquare, Package, ShieldCheck, Truck } from './QatafoIcons';
import { getCommerceConfig } from '../services/publicApi';

interface FooterProps {
  onOpenAccount?: () => void;
  onOpenAssistant?: () => void;
  logoUrl?: string;
  introTitle?: string;
  introText?: string;
}

const PayBadge: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <span className={`inline-flex h-8 min-w-[62px] items-center justify-center rounded-md px-2.5 text-[11px] font-black italic tracking-wide shadow-sm ${className}`}>{label}</span>
);

export const Footer: React.FC<FooterProps> = ({ onOpenAccount, onOpenAssistant, logoUrl = '/media/logo-ayrovi.png', introTitle, introText }) => {
  const [channels, setChannels] = useState({ facebook: '', instagram: '', tiktok: '', whatsapp: '' });
  const [footerAbout, setFooterAbout] = useState('La plateforme unifiée pour vos achats internationaux en Dinars Tunisiens. Commandez facilement depuis SHEIN, Amazon, TEMU et AliExpress en toute transparence et sans carte bancaire internationale.');

  useEffect(() => {
    let active = true;
    getCommerceConfig()
      .then((payload) => {
        if (!active) return;
        const ch = payload.data?.channels;
        if (ch && typeof ch === 'object') setChannels({ facebook: String(ch.facebook || ''), instagram: String(ch.instagram || ''), tiktok: String(ch.tiktok || ''), whatsapp: String(ch.whatsapp || '') });
        if (payload.data?.footerAbout) setFooterAbout(String(payload.data.footerAbout));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const socials = [
    { id: 'facebook', url: channels.facebook, label: 'Facebook', Glyph: FaFacebookF },
    { id: 'instagram', url: channels.instagram, label: 'Instagram', Glyph: FaInstagram },
    { id: 'tiktok', url: channels.tiktok, label: 'TikTok', Glyph: FaTiktok },
    { id: 'whatsapp', url: channels.whatsapp, label: 'WhatsApp', Glyph: FaWhatsapp },
  ].filter((item) => item.url && /^https?:\/\//i.test(item.url));

  const groups: Array<{ title: string; links: Array<{ label: string; href?: string; onClick?: () => void }> }> = [
    {
      title: 'Découvrez AYROVI',
      links: [
        { label: 'Accueil', href: '/' },
        { label: 'Assistant AYROVI', onClick: onOpenAssistant },
        { label: 'Nos canaux officiels', href: '#nos-canaux' },
      ],
    },
    {
      title: 'Magasins et services',
      links: [
        { label: 'Commander depuis SHEIN', href: '/' },
        { label: 'Commander depuis Amazon', href: '/' },
        { label: 'Commander depuis TEMU', href: '/' },
        { label: 'Commander depuis AliExpress', href: '/' },
      ],
    },
    {
      title: 'Besoins d’aide ?',
      links: [
        ...(channels.whatsapp ? [{ label: 'WhatsApp direct', href: channels.whatsapp }] : []),
        { label: 'Poser une question à l’assistant', onClick: onOpenAssistant },
        { label: 'contact@ayrovi.tn', href: 'mailto:contact@ayrovi.tn' },
        { label: 'Vérifier mon acompte', onClick: onOpenAccount },
      ],
    },
    {
      title: 'Top catégories',
      links: [
        { label: 'Mode femme', href: '/' },
        { label: 'Mode homme', href: '/' },
        { label: 'Enfants', href: '/' },
        { label: 'Sport & lifestyle', href: '/' },
      ],
    },
    {
      title: 'Espace client',
      links: [
        { label: 'Mon compte', onClick: onOpenAccount },
        { label: 'Mes commandes & acomptes', onClick: onOpenAccount },
        { label: 'Mes favoris', onClick: onOpenAccount },
        { label: 'Suivi de colis', onClick: onOpenAccount },
      ],
    },
  ];

  const trustBadges = [
    { Icon: ShieldCheck, title: 'Acompte 20 % sécurisé', text: 'Commande confirmée après vérification du reçu' },
    { Icon: Package, title: 'Produits authentiques', text: 'Achetés directement auprès des boutiques officielles' },
    { Icon: MessageSquare, title: 'Service client à l’écoute', text: 'Assistant AYROVI + équipe humaine 7j/7' },
    { Icon: Truck, title: 'Suivi après expédition', text: 'Visible uniquement après la remise réelle au transporteur' },
  ];

  return (
    <footer className="mt-16 border-t border-line bg-white pb-8 pt-12 text-muted">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-9 space-y-3 text-xs">
          <div className="flex items-center gap-2.5">
            <img src={logoUrl} alt="" className="h-11 w-11 object-contain" />
            <span className="text-lg font-extrabold tracking-[-0.04em] text-ink">{introTitle || 'AYROVI'}</span>
          </div>
          <p className="max-w-xl leading-relaxed text-muted">{introText || footerAbout}</p>
        </div>

        {/* شارات الثقة */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {trustBadges.map(({ Icon, title, text }) => (
            <div key={title} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-5 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/10 text-brand"><Icon className="h-7 w-7" /></span>
              <strong className="text-[13px] font-black leading-tight text-ink">{title}</strong>
              <span className="text-[11px] leading-4 text-muted">{text}</span>
            </div>
          ))}
        </div>

        {/* قنواتنا الرسمية */}
        {socials.length > 0 && (
          <div id="nos-canaux" className="mb-10 flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-6 text-center">
            <strong className="text-sm font-black uppercase tracking-[0.18em] text-ink">Nos canaux officiels</strong>
            <div className="flex items-center gap-3">
              {socials.map(({ id, url, label, Glyph }) => (
                <a key={id} href={url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
                  className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink transition hover:border-brand hover:text-brand">
                  <Glyph className="h-6 w-6" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* مجموعات الروابط — أكورديون على الجوال، أعمدة على الشاشات الكبيرة */}
        <nav className="mb-10 grid grid-cols-1 gap-0 border-t border-line sm:grid-cols-2 sm:gap-6 sm:border-t-0 lg:grid-cols-5" aria-label="Pied de page">
          {groups.map((group) => (
            <details key={group.title} className="group border-b border-line sm:border-b-0" open={false}>
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[15px] font-bold text-ink sm:cursor-default sm:py-0 sm:pb-3 [&::-webkit-details-marker]:hidden">
                {group.title}
                <span className="text-xl font-light text-muted transition group-open:rotate-45 sm:hidden">+</span>
              </summary>
              <ul className="hidden space-y-2.5 pb-5 group-open:block sm:block sm:pb-0">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a href={link.href} className="text-[13px] font-medium text-muted transition hover:text-brand">{link.label}</a>
                    ) : (
                      <button type="button" onClick={link.onClick} className="text-[13px] font-medium text-muted transition hover:text-brand">{link.label}</button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </nav>

        {/* وسائل الدفع + الحقوق */}
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-ink px-4 py-6 text-center sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <PayBadge label="VISA" className="bg-white text-brand-deep" />
            <PayBadge label="Mastercard" className="bg-white not-italic text-danger" />
            <PayBadge label="Flouci" className="bg-brand not-italic text-white" />
            <PayBadge label="D17" className="bg-danger not-italic text-white" />
            <PayBadge label="Mandat postal" className="bg-accent not-italic text-ink" />
          </div>
          <p className="text-[11px] font-semibold text-white/70">
            <a href="/privacy.html" className="hover:text-white">Politique de confidentialité</a>
            <span className="mx-2 text-white/35">|</span>
            <a href="/data-deletion.html" className="hover:text-white">Suppression des données</a>
            <span className="mx-2 text-white/35">|</span>
            <a href="mailto:contact@ayrovi.tn?subject=CGV" className="hover:text-white">CGV</a>
          </p>
          <p className="text-[11px] text-white/60">© AYROVI — Tous droits réservés {new Date().getFullYear()}</p>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 text-center text-[11px] text-muted sm:flex-row sm:text-left">
          <p>Commandes confirmées après vérification de l’acompte — facture après émission et suivi après expédition.</p>
          <p className="flex items-center gap-1">
            Conçu avec <Heart className="h-3 w-3 fill-cta text-cta" /> pour faciliter vos achats en Tunisie.
          </p>
        </div>
      </div>
    </footer>
  );
};
