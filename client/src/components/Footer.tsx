import React, { useEffect, useState } from 'react';
import { Heart, MessageSquare, Package, ShieldCheck, Truck } from './QatafoIcons';
import { FigLogoIcon } from './Icons';
import ratesTransparencyImage from '../assets/rates-transparency.jpg';
import { getCommerceConfig } from '../services/publicApi';

interface FooterProps {
  onOpenAccount?: () => void;
  onOpenAssistant?: () => void;
}

const FacebookGlyph = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}><path d="M13.5 21v-7.6h2.6l.4-2.9h-3V8.6c0-.8.3-1.4 1.5-1.4h1.6V4.6c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 3.9v2.1H7.8v2.9h2.6V21h3.1z" /></svg>
);
const InstagramGlyph = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden {...props}><rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.6" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none" /></svg>
);
const TikTokGlyph = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}><path d="M16.6 3c.4 2 1.9 3.5 4 3.8v2.9c-1.5 0-2.9-.5-4-1.3v6.2c0 3.4-2.4 5.9-5.8 5.9A5.6 5.6 0 0 1 5 14.9c0-3.2 2.5-5.7 5.8-5.7l.8.05v3a2.8 2.8 0 0 0-.8-.13 2.75 2.75 0 0 0-2.7 2.8 2.7 2.7 0 0 0 2.7 2.75c1.6 0 2.7-1.2 2.7-2.9V3h3.1z" /></svg>
);
const WhatsAppGlyph = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}><path d="M12 3.3a8.6 8.6 0 0 0-7.4 12.9L3.4 20.6l4.5-1.2A8.6 8.6 0 1 0 12 3.3zm0 1.9a6.7 6.7 0 1 1-3.4 12.4l-.5-.3-2.2.6.6-2.1-.3-.5A6.7 6.7 0 0 1 12 5.2zm-2.5 3c-.2 0-.5.07-.7.34-.24.27-.94.9-.94 2.2 0 1.3.95 2.56 1.08 2.73.13.17 1.84 2.93 4.54 3.99 2.2.87 2.65.7 3.13.65.48-.04 1.54-.62 1.76-1.23.22-.6.22-1.13.15-1.24-.06-.1-.24-.17-.5-.3-.27-.12-1.55-.75-1.8-.84-.24-.09-.42-.13-.6.14-.17.27-.68.83-.84 1-.15.17-.3.2-.57.07a7.3 7.3 0 0 1-2.12-1.3 7.9 7.9 0 0 1-1.47-1.83c-.15-.27-.02-.41.12-.54.12-.12.26-.3.4-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.58-1.44-.82-1.96-.2-.46-.41-.5-.58-.5l-.5.01z" /></svg>
);

const PayBadge: React.FC<{ label: string; className?: string }> = ({ label, className = '' }) => (
  <span className={`inline-flex h-8 min-w-[62px] items-center justify-center rounded-md px-2.5 text-[11px] font-black italic tracking-wide shadow-sm ${className}`}>{label}</span>
);

export const Footer: React.FC<FooterProps> = ({ onOpenAccount, onOpenAssistant }) => {
  const [exchangeRates, setExchangeRates] = useState<string[]>(['Tarifs AYROVI en cours de synchronisation…']);
  const [channels, setChannels] = useState({ facebook: '', instagram: '', tiktok: '', whatsapp: '' });
  const [footerAbout, setFooterAbout] = useState('La plateforme unifiée pour vos achats internationaux en Dinars Tunisiens. Commandez facilement depuis SHEIN, Amazon, TEMU et AliExpress en toute transparence et sans carte bancaire internationale.');

  useEffect(() => {
    let active = true;
    getCommerceConfig()
      .then((payload) => {
        if (!active) return;
        const rates = payload.data?.pricing?.rates || {};
        const lines = ['EUR', 'USD', 'GBP'].flatMap((currency) =>
          Number.isFinite(Number(rates[currency])) ? [`1 ${currency} = ${Number(rates[currency]).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} DT`] : [],
        );
        if (Number.isFinite(Number(rates.JPY))) lines.push(`100 JPY = ${(Number(rates.JPY) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} DT`);
        const governorateCount = Array.isArray(payload.data?.governorates) ? payload.data.governorates.length : 0;
        if (governorateCount) lines.push(`Livraison dans ${governorateCount} gouvernorats`);
        setExchangeRates(lines.length ? lines : ['Tarifs momentanément indisponibles']);
        const ch = payload.data?.channels;
        if (ch && typeof ch === 'object') setChannels({ facebook: String(ch.facebook || ''), instagram: String(ch.instagram || ''), tiktok: String(ch.tiktok || ''), whatsapp: String(ch.whatsapp || '') });
        if (payload.data?.footerAbout) setFooterAbout(String(payload.data.footerAbout));
      })
      .catch(() => { if (active) setExchangeRates(['Tarifs momentanément indisponibles']); });
    return () => { active = false; };
  }, []);

  const socials = [
    { id: 'facebook', url: channels.facebook, label: 'Facebook', Glyph: FacebookGlyph },
    { id: 'instagram', url: channels.instagram, label: 'Instagram', Glyph: InstagramGlyph },
    { id: 'tiktok', url: channels.tiktok, label: 'TikTok', Glyph: TikTokGlyph },
    { id: 'whatsapp', url: channels.whatsapp, label: 'WhatsApp', Glyph: WhatsAppGlyph },
  ].filter((item) => item.url && /^https?:\/\//i.test(item.url));

  const groups: Array<{ title: string; links: Array<{ label: string; href?: string; onClick?: () => void }> }> = [
    {
      title: 'Découvrez AYROVI',
      links: [
        { label: 'Accueil', href: '/' },
        { label: 'Taux & transparence', href: '#rates-title' },
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
    { Icon: Truck, title: 'Suivi en temps réel', text: 'Code de suivi AYR-TN dès la confirmation' },
  ];

  return (
    <footer className="mt-16 border-t border-line bg-white pb-8 pt-12 text-muted">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-9 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white shadow-xs">
              <FigLogoIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-ink">AYROVI</span>
          </div>
          <p className="max-w-xl leading-relaxed text-muted">{footerAbout}</p>
        </div>

        {/* Transparent text is placed directly over the supplied rectangular image. */}
        <section
          className="relative mb-10 min-h-[410px] overflow-hidden rounded-[28px] border border-[#d8e8ef] shadow-[0_24px_70px_-30px_rgba(20,82,112,0.45)] sm:min-h-[360px] sm:rounded-[34px]"
          aria-labelledby="rates-title"
        >
          <img
            src={ratesTransparencyImage}
            alt="Symboles du dollar, de l’euro et du yen illustrant les taux de change AYROVI"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#071525]/82 via-[#071525]/38 to-transparent" />

          <div className="relative z-10 flex min-h-[410px] items-center px-6 py-8 text-white sm:min-h-[360px] sm:px-10 lg:px-14">
            <div className="w-full bg-transparent sm:max-w-[470px]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#c9f0ff] drop-shadow-md sm:text-xs">
                AYROVI · Tunisie
              </p>
              <h4 id="rates-title" className="mt-2 text-2xl font-extrabold tracking-tight drop-shadow-lg sm:text-3xl">
                Taux &amp; Transparence
              </h4>

              <ul className="mt-6 divide-y divide-white/30 border-y border-white/30 drop-shadow-md">
                {exchangeRates.map((rate) => (
                  <li key={rate} className="py-3 text-sm font-semibold tracking-wide text-white sm:text-base">
                    {rate}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* شارات الثقة */}
        <div className="mb-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {trustBadges.map(({ Icon, title, text }) => (
            <div key={title} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-5 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand/10 text-brand"><Icon className="h-5 w-5" /></span>
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
                  <Glyph className="h-5 w-5" />
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
            <PayBadge label="VISA" className="bg-white text-[#1a1f71]" />
            <PayBadge label="Mastercard" className="bg-white not-italic text-[#eb001b]" />
            <PayBadge label="Flouci" className="bg-[#5b2be0] not-italic text-white" />
            <PayBadge label="D17" className="bg-[#e30613] not-italic text-white" />
            <PayBadge label="Mandat postal" className="bg-[#f5c518] not-italic text-[#3d3d3d]" />
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
          <p>Commandes confirmées par acompte de 20 % — facture électronique et suivi inclus.</p>
          <p className="flex items-center gap-1">
            Conçu avec <Heart className="h-3 w-3 fill-brand text-brand" /> pour faciliter vos achats en Tunisie.
          </p>
        </div>
      </div>
    </footer>
  );
};
