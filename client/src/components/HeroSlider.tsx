import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from './QatafoIcons';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';
import { getPublicHome } from '../services/publicApi';

interface HeroSlide {
  id: string;
  image: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  targetUrl?: string;
}
interface RenderedHeroSlide extends HeroSlide { alt: string; position: string; fallback: string; }

const FALLBACK_IMAGES = [
  { id: 'fallback-homme', image: heroHomme, alt: 'Mode homme AYROVI', position: 'object-[center_30%]' },
  { id: 'fallback-femme', image: heroFemme, alt: 'Mode femme AYROVI', position: 'object-[center_25%]' },
  { id: 'fallback-enfants', image: heroEnfants, alt: 'Mode enfants AYROVI', position: 'object-[center_28%]' },
];

export const HeroSlider: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [managedSlides, setManagedSlides] = useState<HeroSlide[]>([]);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    getPublicHome()
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.data?.hero) && payload.data.hero.length) setManagedSlides(payload.data.hero);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const slides = useMemo<RenderedHeroSlide[]>(() => managedSlides.length ? managedSlides.map((slide, index) => ({
    ...slide,
    alt: `Collection AYROVI ${index + 1}`,
    position: FALLBACK_IMAGES[index % FALLBACK_IMAGES.length].position,
    fallback: FALLBACK_IMAGES[index % FALLBACK_IMAGES.length].image,
  })) : FALLBACK_IMAGES.map((slide) => ({ ...slide, fallback: slide.image })), [managedSlides]);

  useEffect(() => {
    if (activeIndex >= slides.length) setActiveIndex(0);
    const intervalId = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), 5200);
    return () => window.clearInterval(intervalId);
  }, [slides.length, activeIndex]);

  const showPrevious = () => setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  const showNext = () => setActiveIndex((current) => (current + 1) % slides.length);

  return (
    <section id="home-hero" className="w-full" aria-roledescription="carousel" aria-label="Collections AYROVI">
      <div className="relative h-[72svh] min-h-[520px] w-full overflow-hidden bg-brand-deep shadow-overlay sm:min-h-[620px] lg:min-h-[680px] lg:max-h-[860px]">
        <div className="absolute inset-0">
          {slides.map((slide, index) => (
            <div key={slide.id} className={`absolute inset-0 transition-[opacity,transform] duration-[1200ms] ease-out ${index === activeIndex ? 'z-[1] scale-100 opacity-100' : 'z-0 scale-[1.045] opacity-0'}`} aria-hidden={index !== activeIndex}>
              <img
                src={failedImages[slide.id] ? slide.fallback : slide.image}
                onError={() => setFailedImages((current) => ({ ...current, [slide.id]: true }))}
                alt={index === activeIndex ? slide.alt : ''}
                className={`h-full w-full object-cover ${slide.position}`}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/70 via-black/10 to-black/35" />
        <div className="absolute inset-0 z-[2] bg-gradient-to-r from-brand-deep/20 via-transparent to-brand-deep/15" />
        <button type="button" onClick={showPrevious} className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white shadow-lg backdrop-blur-md transition duration-300 hover:scale-105 hover:bg-black/35 sm:left-7 sm:h-12 sm:w-12" aria-label="Image précédente"><ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" /></button>
        <button type="button" onClick={showNext} className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white shadow-lg backdrop-blur-md transition duration-300 hover:scale-105 hover:bg-black/35 sm:right-7 sm:h-12 sm:w-12" aria-label="Image suivante"><ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" /></button>
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-16 pb-8 text-center sm:px-20 sm:pb-11">
          <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white drop-shadow-lg sm:text-6xl lg:text-7xl">Toute la mode du monde, livrée chez vous.</h1>
          {slides[activeIndex]?.subtitle && <p className="mt-4 max-w-2xl text-sm font-semibold text-white/85 sm:text-base">{slides[activeIndex].subtitle}</p>}
          {slides[activeIndex]?.cta && slides[activeIndex]?.targetUrl && <a href={slides[activeIndex].targetUrl} className="mt-5 bg-accent px-5 py-3 text-xs font-black text-ink">{slides[activeIndex].cta}</a>}
          <div className="mt-6 flex items-center gap-2" aria-label="Choisir une image">
            {slides.map((slide, index) => <button key={slide.id} type="button" onClick={() => setActiveIndex(index)} className={`h-1.5 rounded-full shadow-sm transition-all duration-500 ${index === activeIndex ? 'w-9 bg-accent' : 'w-4 bg-white/55 hover:bg-white/85'}`} aria-label={`Afficher ${slide.alt}`} aria-current={index === activeIndex ? 'true' : undefined} />)}
          </div>
        </div>
      </div>
    </section>
  );
};
