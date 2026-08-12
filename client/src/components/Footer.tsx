import React, { useEffect, useState } from 'react';
import { Heart } from './QatafoIcons';
import { FigLogoIcon } from './Icons';
import ratesTransparencyImage from '../assets/rates-transparency.jpg';

export const Footer: React.FC = () => {
  const [exchangeRates, setExchangeRates] = useState<string[]>(['Tarifs AYROVI en cours de synchronisation…']);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/commerce-config', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Configuration indisponible.');
        const rates = payload.data?.pricing?.rates || {};
        const lines = ['EUR', 'USD', 'GBP'].flatMap((currency) =>
          Number.isFinite(Number(rates[currency])) ? [`1 ${currency} = ${Number(rates[currency]).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} DT`] : [],
        );
        if (Number.isFinite(Number(rates.JPY))) lines.push(`100 JPY = ${(Number(rates.JPY) * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} DT`);
        const governorateCount = Array.isArray(payload.data?.governorates) ? payload.data.governorates.length : 0;
        if (governorateCount) lines.push(`Livraison dans ${governorateCount} gouvernorats`);
        setExchangeRates(lines.length ? lines : ['Tarifs momentanément indisponibles']);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setExchangeRates(['Tarifs momentanément indisponibles']);
      });
    return () => controller.abort();
  }, []);

  return (
    <footer className="mt-16 border-t border-[#e2e8f0] bg-white pb-8 pt-12 text-[#6b7280]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-9 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#673de6] text-white shadow-xs">
              <FigLogoIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-[#1d2130]">AYROVI</span>
          </div>
          <p className="max-w-xl leading-relaxed text-[#6b7280]">
            La plateforme unifiée pour vos achats internationaux en Dinars Tunisiens. Commandez facilement depuis SHEIN, Amazon, TEMU et AliExpress en toute transparence et sans carte bancaire internationale.
          </p>
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

        <div className="flex flex-col items-center justify-between gap-3 border-t border-[#f1f3f9] pt-6 text-center text-[11px] text-[#9ca3af] sm:flex-row sm:text-left">
          <p>© {new Date().getFullYear()} AYROVI. Tous droits réservés — Tunisie.</p>
          <p className="flex items-center gap-1">
            Conçu avec <Heart className="h-3 w-3 fill-[#673de6] text-[#673de6]" /> pour faciliter vos achats en Tunisie.
          </p>
        </div>
      </div>
    </footer>
  );
};
