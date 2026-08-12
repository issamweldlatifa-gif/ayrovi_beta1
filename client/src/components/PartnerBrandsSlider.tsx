import React, { useEffect, useMemo, useState } from 'react';
import adidasLogo from '../assets/brands/adidas.jpg';
import burberryLogo from '../assets/brands/burberry.jpg';
import chanelLogo from '../assets/brands/chanel.jpg';
import diorLogo from '../assets/brands/dior.jpg';
import dolceGabbanaLogo from '../assets/brands/dolce-gabbana.jpg';
import ellesseLogo from '../assets/brands/ellesse.jpg';
import hermesLogo from '../assets/brands/hermes.jpg';
import jordanLogo from '../assets/brands/jordan.jpg';
import nikeLogo from '../assets/brands/nike.jpg';
import pradaLogo from '../assets/brands/prada.jpg';
import sheinLogo from '../assets/brands/shein.jpg';
import theNorthFaceLogo from '../assets/brands/the-north-face.jpg';
import versaceLogo from '../assets/brands/versace.jpg';
import yslLogo from '../assets/brands/ysl.jpg';
import zaraLogo from '../assets/brands/zara.jpg';

interface BrandItem { id: string; name: string; category: string; logo: string; surface: 'dark' | 'light'; fallback: string; }
const localLogos: Record<string, string> = {
  jordan: jordanLogo, ellesse: ellesseLogo, 'the north face': theNorthFaceLogo, adidas: adidasLogo, nike: nikeLogo, shein: sheinLogo,
  'saint laurent': yslLogo, prada: pradaLogo, hermès: hermesLogo, hermes: hermesLogo, burberry: burberryLogo,
  'dolce & gabbana': dolceGabbanaLogo, versace: versaceLogo, chanel: chanelLogo, dior: diorLogo, zara: zaraLogo,
};
const fallbackBrands: BrandItem[] = [
  ['Jordan','Sport & Sneakers',jordanLogo,'dark'], ['Ellesse','Sportswear italien',ellesseLogo,'dark'], ['The North Face','Outdoor & Exploration',theNorthFaceLogo,'dark'],
  ['adidas','Sport & Lifestyle',adidasLogo,'dark'], ['Nike','Sport & Sneakers',nikeLogo,'dark'], ['SHEIN','Mode & Tendances',sheinLogo,'dark'],
  ['Saint Laurent','Luxe parisien',yslLogo,'light'], ['Prada','Mode italienne',pradaLogo,'light'], ['Hermès','Maison de luxe',hermesLogo,'light'],
  ['Burberry','Luxe britannique',burberryLogo,'light'], ['Dolce & Gabbana','Mode italienne',dolceGabbanaLogo,'light'], ['Versace','Luxe italien',versaceLogo,'dark'],
  ['Chanel','Haute couture',chanelLogo,'dark'], ['Dior','Haute couture',diorLogo,'dark'], ['Zara','Mode internationale',zaraLogo,'dark'],
].map(([name, category, logo, surface], index) => ({ id: `fallback-${index}`, name, category, logo, fallback: logo, surface })) as BrandItem[];
const categoryLabels: Record<string, string> = { FASHION: 'Mode internationale', SPORT_LIFESTYLE: 'Sport & Lifestyle', BEAUTY: 'Beauté', TECH: 'Technologie', HOME: 'Maison', OTHER: 'Marque partenaire' };

export const PartnerBrandsSlider: React.FC = () => {
  const [managed, setManaged] = useState<any[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/brands').then((response) => response.ok ? response.json() : Promise.reject()).then((payload) => {
      if (!cancelled && payload.success && Array.isArray(payload.data) && payload.data.length) setManaged(payload.data);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const brands = useMemo<BrandItem[]>(() => managed.length ? managed.map((brand, index) => {
    const fallback = localLogos[String(brand.name).toLowerCase()] || fallbackBrands[index % fallbackBrands.length].fallback;
    return { id: brand.id, name: brand.name, category: categoryLabels[brand.category] || brand.category, logo: brand.logo || fallback, fallback, surface: index % 4 === 2 ? 'light' : 'dark' };
  }) : fallbackBrands, [managed]);
  const allBrands = [...brands, ...brands];
  return (
    <section className="w-full bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5 pb-10 text-center sm:px-8 sm:pb-14">
        <div className="mb-4 inline-flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[#673de6] sm:text-sm"><span className="h-[2px] w-7 bg-[#facc15]" />Marques partenaires<span className="h-[2px] w-7 bg-[#facc15]" /></div>
        <h2 className="text-3xl font-black leading-tight tracking-[-0.045em] text-[#17131f] sm:text-5xl">Vos marques préférées, réunies au même endroit.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-600 sm:text-base">Découvrez les enseignes disponibles avec AYROVI. Chaque carte présente le logo correspondant à la marque affichée.</p>
      </div>
      <div className="relative w-full overflow-hidden bg-black py-10 shadow-[0_30px_80px_-35px_rgba(0,0,0,0.65)] sm:py-14">
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[70%] -translate-x-1/2 rounded-full bg-[#673de6]/20 blur-[100px]" /><div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-gradient-to-r from-black to-transparent sm:w-28" /><div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-black to-transparent sm:w-28" />
        <div className="relative mb-8 flex items-center justify-between gap-4 px-6 sm:px-12"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/55">Explorez les marques</p><span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-bold text-white/65">Défilement automatique</span></div>
        <div className="relative w-full overflow-hidden"><div className="brands-marquee-track px-5 sm:px-8">{allBrands.map((brand, index) => {
          const isDark = brand.surface === 'dark';
          return <article key={`${brand.id}-${index}`} aria-hidden={index >= brands.length} className={`group relative h-[330px] w-[270px] flex-shrink-0 overflow-hidden rounded-[28px] border shadow-2xl transition duration-500 hover:-translate-y-2 sm:h-[400px] sm:w-[340px] sm:rounded-[32px] ${isDark ? 'border-white/15 bg-black hover:border-white/35' : 'border-black/10 bg-[#f7f7f7] hover:border-[#673de6]/40'}`}>
            <span className={`absolute left-5 top-5 z-10 rounded-full px-3 py-1 text-[10px] font-extrabold tabular-nums tracking-[0.2em] backdrop-blur-md sm:left-6 sm:top-6 ${isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-black/50'}`}>{String((index % brands.length) + 1).padStart(2, '0')}</span>
            <div className="absolute inset-x-0 top-0 bottom-[92px] flex items-center justify-center overflow-hidden p-5 sm:bottom-[104px] sm:p-7"><img src={failed[brand.id] ? brand.fallback : brand.logo} onError={() => setFailed((current) => ({ ...current, [brand.id]: true }))} alt={`${brand.name} logo`} className="h-full w-full select-none object-contain transition duration-700 ease-out group-hover:scale-[1.04]" draggable={false} /></div>
            <div className={`absolute inset-x-0 bottom-0 min-h-[92px] border-t px-6 py-5 sm:min-h-[104px] sm:px-7 sm:py-6 ${isDark ? 'border-white/10 bg-black text-white' : 'border-black/10 bg-white text-[#17131f]'}`}><span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#673de6] sm:text-[10px]">{brand.category}</span><h3 className="mt-1.5 truncate text-xl font-black tracking-[-0.035em] sm:text-2xl">{brand.name}</h3></div>
          </article>;
        })}</div></div>
      </div>
    </section>
  );
};
