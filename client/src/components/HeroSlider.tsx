import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from './QatafoIcons';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';

const HERO_IMAGES = [
  { src: heroHomme, alt: 'Mode homme AYROVI', position: 'object-[center_30%]' },
  { src: heroFemme, alt: 'Mode femme AYROVI', position: 'object-[center_25%]' },
  { src: heroEnfants, alt: 'Mode enfants AYROVI', position: 'object-[center_28%]' },
];

export const HeroSlider: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % HERO_IMAGES.length);
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, []);

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + HERO_IMAGES.length) % HERO_IMAGES.length);
  };

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % HERO_IMAGES.length);
  };

  return (
    <section id="home-hero" className="-mt-16 w-full sm:-mt-20" aria-roledescription="carousel" aria-label="Collections AYROVI">
      <div className="relative h-[72svh] min-h-[520px] w-full overflow-hidden bg-[#24104f] shadow-[0_28px_70px_-32px_rgba(43,18,89,0.7)] sm:min-h-[620px] lg:min-h-[680px] lg:max-h-[860px]">
        <div className="absolute inset-0">
          {HERO_IMAGES.map((image, index) => (
            <div
              key={image.alt}
              className={`absolute inset-0 transition-[opacity,transform] duration-[1200ms] ease-out ${
                index === activeIndex ? 'z-[1] scale-100 opacity-100' : 'z-0 scale-[1.045] opacity-0'
              }`}
              aria-hidden={index !== activeIndex}
            >
              <img
                src={image.src}
                alt={index === activeIndex ? image.alt : ''}
                className={`h-full w-full object-cover ${image.position}`}
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/70 via-black/10 to-black/35" />
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(36,16,79,0.2),transparent_35%,transparent_65%,rgba(36,16,79,0.16))]" />

        <button
          type="button"
          onClick={showPrevious}
          className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white shadow-lg backdrop-blur-md transition duration-300 hover:scale-105 hover:bg-black/35 sm:left-7 sm:h-12 sm:w-12"
          aria-label="Image précédente"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <button
          type="button"
          onClick={showNext}
          className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/20 text-white shadow-lg backdrop-blur-md transition duration-300 hover:scale-105 hover:bg-black/35 sm:right-7 sm:h-12 sm:w-12"
          aria-label="Image suivante"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-16 pb-8 text-center sm:px-20 sm:pb-11">
          <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] sm:text-6xl lg:text-7xl">
            Toute la mode du monde, livrée chez vous.
          </h1>

          <div className="mt-6 flex items-center gap-2" aria-label="Choisir une image">
            {HERO_IMAGES.map((image, index) => (
              <button
                key={image.alt}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full shadow-sm transition-all duration-500 ${
                  index === activeIndex ? 'w-9 bg-[#fbbf24]' : 'w-4 bg-white/55 hover:bg-white/85'
                }`}
                aria-label={`Afficher ${image.alt}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
