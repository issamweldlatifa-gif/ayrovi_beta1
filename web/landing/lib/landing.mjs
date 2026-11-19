import { copy } from '../copy.mjs';
import { brand, documentHtml, escapeHtml as e } from './html.mjs';
const ids = ['lens', 'prix', 'suivi', 'social', 'faq'];
const millimes = [69406, 6500, 51521, 6941, 8000];
const total = millimes.reduce((sum, line) => sum + line, 0);
const amount = value => (value / 1000).toFixed(3).replace('.', ',');
const modeFiles = ['photo', 'link', 'text'];
const idIcons = ['◎','⊞','◷'];
export function landingHtml(locale, origin, { drafts = false } = {}) {
  const t = copy[locale];
  const home = locale === 'ar' ? '/ar/' : '/';
  const language = locale === 'ar' ? '/' : '/ar/';
  const legal = locale === 'ar' ? '/ar' : '';
  const footLinks = drafts ? [[`${legal}/confidentialite`, t.policy], [`${legal}/conditions`, t.terms],
    [`${legal}/retours`, t.returns], [`${legal}/suppression-des-donnees`, t.data], [`${legal}/contact`, t.contact]]
    : [['/privacy.html', t.policy], ['/terms.html', t.terms], ['/data-deletion.html', t.data]];
  return documentHtml({ locale, title: t.title, description: t.desc, canonical: origin + home,
    image: origin + '/site-assets/og.png',
    extra: `<link rel="alternate" hreflang="fr-TN" href="${origin}/"><link rel="alternate" hreflang="ar-TN" href="${origin}/ar/"><link rel="alternate" hreflang="x-default" href="${origin}/"><script src="/site-assets/site.js" defer></script>`,
    body: `<a class="skip" href="#main">${t.skip}</a><header class="top"><div class="wrap bar">
<a class="brand" href="${home}" aria-label="ZAYROVI">${brand}</a><nav aria-label="${locale === 'ar' ? 'الأقسام' : 'Sections'}">${t.nav.map((name,i)=>`<a href="#${ids[i]}">${name}</a>`).join('')}</nav>
<a class="lang" href="${language}" lang="${locale === 'ar' ? 'fr' : 'ar'}">${t.alternate}</a><a class="btn light bar-cta" href="#app">${t.app}</a></div></header>
<main id="main"><section class="hero" id="lens"><div class="wrap hero-grid"><div class="hero-copy"><p class="eyebrow">${t.heroKicker}</p><h1>${t.heroFirst}<br><em>${t.heroAccent}</em></h1><p class="lead">${t.heroBody}</p><div class="actions"><a class="btn light" href="#app">${t.app}</a><a class="btn outline" href="#prix">${t.priceLink}</a></div></div>
<figure class="demo" data-switcher><div class="phone"><div class="screen-tabs" hidden><div role="tablist" aria-label="Z Lens">${t.modes.map((mode,i)=>`<button type="button" role="tab" id="tab-${i}" aria-controls="screen-${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${mode}</button>`).join('')}</div></div>
${modeFiles.map((file,i)=>`<div id="screen-${i}" role="tabpanel" tabindex="0" aria-labelledby="tab-${i}" ${i ? 'hidden' : ''}><img class="lens-shot" src="/site-assets/lens-${file}-${locale}.webp" alt="${e(t.modeAlt[i])}" width="360" height="780" ${i?'loading="lazy"':'fetchpriority="high"'}></div>`).join('')}</div><figcaption>${t.demo}</figcaption></figure></div></section>
<div class="trust"><div class="wrap trust-grid">${t.trust.map(([title,sub])=>`<div><b>${title}</b><span>${sub}</span></div>`).join('')}</div></div>
<section id="prix" class="section"><div class="wrap split"><div><p class="eyebrow">${t.priceKicker}</p><h2>${t.priceTitle}</h2><p class="lead">${t.priceBody}</p><ol class="steps">${t.steps.map(([a,b])=>`<li><strong>${a}</strong><p>${b}</p></li>`).join('')}</ol></div><div class="receipt"><div class="receipt-head"><strong>${t.receipt}</strong><span>ZD / 01</span></div><p>${t.receiptSub}</p><dl>${t.amounts.map((name,i)=>`<div><dt>${name}</dt><dd dir="ltr">${amount(millimes[i])}</dd></div>`).join('')}<div class="amount-total"><dt>${t.total}</dt><dd dir="ltr">${amount(total)} TND</dd></div><div class="amount-deposit"><dt>${t.deposit}</dt><dd dir="ltr">${amount(Math.round(total * 0.2))} TND</dd></div></dl><p class="small">${t.receiptNote}</p></div></div></section>
<section id="suivi" class="section tracking"><div class="wrap split"><div><p class="eyebrow">${t.shipKicker}</p><h2>${t.shipTitle}</h2><p class="lead">${t.shipBody}</p></div><div class="timeline"><h3>${t.timelineLabel}</h3><ol>${t.timeline.map(text=>`<li>${text}</li>`).join('')}</ol><p class="small">${t.timing}</p></div></div></section>
<section class="section payment"><div class="wrap split"><div><p class="eyebrow">${t.payKicker}</p><h2>${t.payTitle}</h2><p class="lead">${t.payBody}</p></div><ul class="payment-notes">${t.payItems.map(item=>`<li>${item}</li>`).join('')}</ul></div></section>
<section id="social" class="section"><div class="wrap"><p class="eyebrow">${t.socialKicker}</p><h2>${t.socialTitle}</h2><p class="lead">${t.socialBody}</p><div class="social-grid">${t.socialCards.map(([name,sub],i)=>`<article class="social-tile tile-${i}"><span aria-hidden="true">${idIcons[i]}</span><h3>${name}</h3><p>${sub}</p></article>`).join('')}</div></div></section>
<section id="faq" class="section faq"><div class="wrap split"><h2>${t.faqTitle}</h2><div>${t.faq.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></div></section>
<section id="app" class="section cta"><div class="wrap split"><div><p class="eyebrow">${t.ctaKicker}</p><h2>${t.ctaTitle}</h2><p class="lead">${t.ctaBody}</p></div><div class="actions"><a class="btn light" href="zayrovi://lens">${t.openLens}</a><a class="btn outline" href="#lens">${t.demoLink}</a></div></div></section></main>
<footer><div class="wrap foot"><div><a class="brand" href="${home}">${brand}</a><p>${t.footer}</p></div><ul>${footLinks.map(([href,label]) => `<li><a href="${href}"${!drafts && locale === 'ar' ? ' hreflang="fr"' : ''}>${label}</a></li>`).join('')}</ul></div></footer>` });
}
