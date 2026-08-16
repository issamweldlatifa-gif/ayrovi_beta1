import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
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
import { getPublicHome } from '../services/publicApi';

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
    getPublicHome().then((payload) => {
      if (!cancelled && Array.isArray(payload.data?.brands) && payload.data.brands.length) setManaged(payload.data.brands);
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
        <div className="mb-4 inline-flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.2em] text-brand sm:text-sm"><span className="h-[2px] w-7 bg-accent" />Marques partenaires<span className="h-[2px] w-7 bg-accent" /></div>
        <h2 className="text-3xl font-black leading-tight tracking-[-0.045em] text-ink sm:text-5xl">Vos marques préférées, réunies au même endroit.</h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-600 sm:text-base">Découvrez les enseignes disponibles avec AYROVI. Chaque carte présente le logo correspondant à la marque affichée.</p>
      </div>
      <div className="relative w-full overflow-hidden bg-black py-10 shadow-[0_30px_80px_-35px_rgba(0,0,0,0.65)] sm:py-14">
        <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[70%] -translate-x-1/2 rounded-full bg-brand/20 blur-[100px]" /><div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-12 bg-gradient-to-r from-black to-transparent sm:w-28" /><div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-black to-transparent sm:w-28" />
        <div className="relative mb-8 flex items-center justify-between gap-4 px-6 sm:px-12"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/55">Explorez les marques</p><span className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-bold text-white/65">Défilement automatique</span></div>
        <div className="relative w-full overflow-hidden"><div className="brands-marquee-track px-5 sm:px-8">{allBrands.map((brand, index) => {
          const isDark = brand.surface === 'dark';
          return <motion.article key={`${brand.id}-${index}`} aria-hidden={index >= brands.length} whileHover={{ y: -6, scale: 1.015 }} transition={{ type: 'spring', stiffness: 330, damping: 24 }} className={`group relative h-[250px] w-[200px] flex-shrink-0 overflow-hidden rounded-[24px] border shadow-xl sm:h-[290px] sm:w-[240px] sm:rounded-[28px] ${isDark ? 'border-white/15 bg-black hover:border-white/35' : 'border-black/10 bg-[#f7f7f7] hover:border-brand/40'}`}>
            <span className={`absolute left-4 top-4 z-10 rounded-full px-2.5 py-1 text-[9px] font-extrabold tabular-nums tracking-[0.18em] backdrop-blur-md ${isDark ? 'bg-white/10 text-white/60' : 'bg-black/5 text-black/50'}`}>{String((index % brands.length) + 1).padStart(2, '0')}</span>
            <div className="absolute inset-x-0 bottom-[76px] top-0 flex items-center justify-center overflow-hidden p-4 sm:bottom-[86px] sm:p-5"><img src={failed[brand.id] ? brand.fallback : brand.logo} onError={() => setFailed((current) => ({ ...current, [brand.id]: true }))} alt={`${brand.name} logo`} className="h-full w-full select-none object-contain transition duration-700 ease-out group-hover:scale-[1.04]" draggable={false} /></div>
            <div className={`absolute inset-x-0 bottom-0 min-h-[76px] border-t px-4 py-4 sm:min-h-[86px] sm:px-5 ${isDark ? 'border-white/10 bg-black text-white' : 'border-black/10 bg-white text-ink'}`}><span className="block truncate text-[9px] font-extrabold uppercase tracking-[0.14em] text-brand">{brand.category}</span><h3 className="mt-1.5 truncate text-lg font-black tracking-[-0.035em] sm:text-xl">{brand.name}</h3></div>
          </motion.article>;
        })}</div></div>
      </div>
    </section>
  );
};
