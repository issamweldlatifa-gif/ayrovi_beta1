/**
 * Carrousel Hero — lecture défensive de l'API et contraste du fond adaptatif.
 *
 * Pourquoi des tests purs (sans rendu) : le contrat serveur est ce qui peut
 * casser silencieusement (champ renommé, `href` inattendu, fond sans couleur).
 * On vérifie ici la PARSe, la garde de lien, et le choix de l'encre — le reste
 * (rendu, états) est couvert par la matrice de vérification manuelle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiSendData = vi.fn();
vi.mock('../src/api/client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...(args as [])),
  apiSendData: (...args: unknown[]) => apiSendData(...(args as [])),
  mediaUrl: (path: string | null | undefined) => (path ? `https://api.test${path}` : ''),
}));

const {
  parseHeroSlides, parseHeroCarouselSettings, safeHeroHref,
  fetchHeroSlides, fetchHeroCarouselSettings, trackHeroEvent,
} = await import('../src/api/public');
const {
  hexToRgb, luminanceOfHex, adaptiveInk, pickHeroText,
  mixHex, withAlpha, softenHeroBackground, HERO_BACKGROUND_SOFTEN,
} = await import('../src/features/home/heroPalette');

// `mockReset` perd les rejets suivis ⇒ `mockClear` + valeur par défaut résolue.
beforeEach(() => {
  apiGet.mockClear();
  apiGet.mockResolvedValue({ data: [] });
  apiSendData.mockClear();
  apiSendData.mockResolvedValue({ success: true });
});

const CARD = {
  id: 'hs_1',
  image: '/media/hero/1.jpg',
  title: 'Tech & Electronique',
  titleAr: 'تكنولوجيا وإلكترونيات',
  subtitle: 'Jusqu’à -30%',
  subtitleAr: 'حتى -30%',
  cta: 'Voir',
  ctaAr: 'شوف',
  displayOrder: 1,
  href: '/promotions',
  destinationType: 'CAMPAIGN',
  background: '#F6E7D8',
  dominant: '#C89B6D',
  luminance: 0.93,
};

describe('parseHeroSlides — contrat serveur, défensif', () => {
  it('cartes valides retenues, champs bilingues lus', () => {
    const cards = parseHeroSlides([CARD]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'hs_1',
      image: '/media/hero/1.jpg',
      title: 'Tech & Electronique',
      titleAr: 'تكنولوجيا وإلكترونيات',
      cta: 'Voir',
      ctaAr: 'شوف',
      href: '/promotions',
      destinationType: 'CAMPAIGN',
      background: '#F6E7D8',
    });
  });

  it('carte sans id ⇒ écartée (jamais de carte sans identité)', () => {
    expect(parseHeroSlides([{ ...CARD, id: '' }])).toEqual([]);
    expect(parseHeroSlides([{ ...CARD, id: 42 }])).toHaveLength(1); // id numérique toléré
  });

  it('carte sans href sûr ⇒ écartée (pas de carte morte)', () => {
    expect(parseHeroSlides([{ ...CARD, href: '' }])).toEqual([]);
    expect(parseHeroSlides([{ ...CARD, href: 'javascript:alert(1)' }])).toEqual([]);
    expect(parseHeroSlides([{ ...CARD, href: '/promotions' }])).toHaveLength(1);
    expect(parseHeroSlides([{ ...CARD, href: 'https://ayrovi.tn/x' }])).toHaveLength(1);
  });

  it('champs manquants ⇒ chaînes vides, pas d’exception', () => {
    const cards = parseHeroSlides([{ id: 'hs_2', href: '/news' }, null, 7]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'hs_2', image: '', title: '', titleAr: '', cta: '', background: '', dominant: '',
    });
  });

  it('réponse non-tableau ⇒ liste vide', () => {
    expect(parseHeroSlides({ erreur: true })).toEqual([]);
    expect(parseHeroSlides(null)).toEqual([]);
  });
});

describe('safeHeroHref — défense en profondeur', () => {
  it('routes internes et https acceptées', () => {
    expect(safeHeroHref('/catalog?arrivalId=arr_1')).toBe('/catalog?arrivalId=arr_1');
    expect(safeHeroHref('https://ayrovi.tn/promo')).toBe('https://ayrovi.tn/promo');
  });

  it('protocoles dangereux ou chemins relatifs refusés', () => {
    expect(safeHeroHref('javascript:alert(1)')).toBe('');
    expect(safeHeroHref('data:text/html,x')).toBe('');
    expect(safeHeroHref('ayrovi://x')).toBe('');
    expect(safeHeroHref('promotions')).toBe('');
    expect(safeHeroHref('')).toBe('');
    expect(safeHeroHref(null)).toBe('');
    expect(safeHeroHref(42)).toBe('');
  });
});

describe('parseHeroCarouselSettings — bornes et défauts', () => {
  it('payload absent ⇒ défauts sûrs (actif, sobre, sans autoplay)', () => {
    expect(parseHeroCarouselSettings(null)).toEqual({
      enabled: true, maxCards: 6, autoplay: false,
      autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true,
    });
  });

  it('valeurs Admin respectées', () => {
    expect(parseHeroCarouselSettings({
      enabled: false, maxCards: 12, autoplay: true,
      autoplayIntervalMs: 8000, transitionMs: 600, paginationVisible: false,
    })).toEqual({
      enabled: false, maxCards: 12, autoplay: true,
      autoplayIntervalMs: 8000, transitionMs: 600, paginationVisible: false,
    });
  });

  it('bornes re-écrasées côté client (un dépassement ne craint plus le rendu)', () => {
    const parsed = parseHeroCarouselSettings({
      maxCards: 99, autoplayIntervalMs: 10, transitionMs: 99999,
    });
    expect(parsed.maxCards).toBe(12);
    expect(parsed.autoplayIntervalMs).toBe(1000);
    expect(parsed.transitionMs).toBe(2000);
  });
});

describe('fetch + track — appels réseau', () => {
  it('fetchHeroSlides lit le chemin public et parse', async () => {
    apiGet.mockResolvedValue({ data: [CARD] });
    const cards = await fetchHeroSlides();
    expect(apiGet).toHaveBeenCalledWith('/api/public/hero-slides', undefined);
    expect(cards).toHaveLength(1);
  });

  it('fetchHeroCarouselSettings lit le chemin public et parse', async () => {
    apiGet.mockResolvedValue({ data: { enabled: true, maxCards: 4 } });
    const settings = await fetchHeroCarouselSettings();
    expect(apiGet).toHaveBeenCalledWith('/api/public/hero-carousel-settings', undefined);
    expect(settings.maxCards).toBe(4);
  });

  it('trackHeroEvent poste en fire-and-forget (échec avalé)', async () => {
    trackHeroEvent('hs_1', 'impression', 'CAMPAIGN', 'fr');
    expect(apiSendData).toHaveBeenCalledWith('POST', '/api/public/hero-events', {
      body: { cardId: 'hs_1', event: 'impression', destinationType: 'CAMPAIGN', locale: 'fr' },
    });
    // Un rejet réseau ne doit PAS remonter (mesurer ne casse jamais rien).
    apiSendData.mockRejectedValue(new Error('réseau'));
    expect(() => trackHeroEvent('hs_1', 'click')).not.toThrow();
    await Promise.resolve();
  });

  it('trackHeroEvent sans id ⇒ aucun appel', () => {
    trackHeroEvent('', 'impression');
    expect(apiSendData).not.toHaveBeenCalled();
  });
});

describe('contraste — encre sur fond adaptatif', () => {
  const colors = { onAdaptiveLight: '#000000', onAdaptiveDark: '#FFFFFF' };

  it('hexToRgb : 3 et 6 chiffres, rejets', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#F6E7D8')).toEqual({ r: 246, g: 231, b: 216 });
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('#ff00')).toBeNull();
    expect(hexToRgb('red')).toBeNull();
  });

  it('luminance : pastel clair > 0.5, rouge sombre < 0.5', () => {
    expect(luminanceOfHex('#F6E7D8')).toBeGreaterThan(0.5);
    expect(luminanceOfHex('#171717')).toBeLessThan(0.5);
    expect(luminanceOfHex('#ff0000')).toBeCloseTo(0.21, 2);
  });

  it('adaptiveInk : encre sombre sur pastel, claire sur fond foncé', () => {
    expect(adaptiveInk('#F6E7D8', colors)).toBe('#000000'); // pastel serveur
    expect(adaptiveInk('#171717', colors)).toBe('#FFFFFF'); // surface sombre (dark)
    expect(adaptiveInk('#AABBCC', colors)).toBe('#000000'); // override manuel clair
    expect(adaptiveInk('#1E3A8A', colors)).toBe('#FFFFFF'); // override manuel foncé
  });
});

describe('mixHex / withAlpha / softenHeroBackground — adoucissement du fond', () => {
  it('mixHex : bornes exactes et milieu', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#11A59F', '#FFFFFF', 0)).toBe('#11A59F');
  });

  it('mixHex : quantité bornée entre 0 et 1, entrée invalide renvoyée telle quelle', () => {
    expect(mixHex('#102030', '#FFFFFF', -3)).toBe('#102030');
    expect(mixHex('#102030', '#FFFFFF', 9)).toBe('#FFFFFF');
    expect(mixHex('pas-une-couleur', '#FFFFFF', 0.5)).toBe('pas-une-couleur');
  });

  it('withAlpha : rgba avec opacité bornée', () => {
    expect(withAlpha('#FF8000', 0.5)).toBe('rgba(255,128,0,0.5)');
    expect(withAlpha('#FFFFFF', 0)).toBe('rgba(255,255,255,0)');
    expect(withAlpha('#FFFFFF', 2)).toBe('rgba(255,255,255,1)');
  });

  it('softenHeroBackground : éclaircit vers le blanc sans atteindre le blanc', () => {
    expect(HERO_BACKGROUND_SOFTEN).toBeGreaterThan(0);
    expect(HERO_BACKGROUND_SOFTEN).toBeLessThan(0.5);
    const softened = softenHeroBackground('#11A59F', '#FFFFFF');
    expect(softened).toBe(mixHex('#11A59F', '#FFFFFF', HERO_BACKGROUND_SOFTEN));
    expect(luminanceOfHex(softened)).toBeGreaterThan(luminanceOfHex('#11A59F'));
    expect(softened).not.toBe('#FFFFFF');
  });
});

describe('pickHeroText — bilingue avec repli', () => {
  it('la langue de l’app gagne, l’autre langue en repli', () => {
    expect(pickHeroText('Soldes', 'تخفيضات', false)).toBe('Soldes');
    expect(pickHeroText('Soldes', 'تخفيضات', true)).toBe('تخفيضات');
    expect(pickHeroText('', 'تخفيضات', false)).toBe('تخفيضات');
    expect(pickHeroText('Soldes', '', true)).toBe('Soldes');
    expect(pickHeroText('', '', true)).toBe('');
  });
});
