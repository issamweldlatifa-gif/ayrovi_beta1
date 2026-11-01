/**
 * Logos officiels des boutiques, embarqués dans l'application.
 *
 * Les fichiers sont des PNG À FOND TRANSPARENT : le logo se pose donc
 * directement sur la plaque grise du design system, sans cadre blanc autour.
 *
 * Deux variantes par marque :
 *   • `light` — traits noirs, lisibles sur une plaque claire ;
 *   • `dark`  — mêmes traits en blanc, pour le thème sombre.
 * Quatre marques gardent leurs COULEURS officielles (TEMU, AliExpress, Amazon,
 * Champion) : on n'inverse pas un logo orange ni un « a » noir — en thème
 * sombre elles s'affichent donc sur une plaque blanche (`plate`), comme une
 * icône d'application, plutôt que d'être recolorées au hasard.
 */
import { LOGO_PLATE } from '@/design/tokens.mobile';
import { storeLogoId, type StoreLogoId } from './storeLogoIds';

export interface StoreLogoSources {
  /** Le fichier à afficher dans le thème courant. */
  source: number;
  /**
   * Plaque imposée par le logo, quand il en exige une : les quatre marques en
   * COULEUR gardent leurs couleurs officielles et s'affichent sur blanc même en
   * thème sombre (une icône d'application, jamais un logo recolorié).
   */
  plate?: string;
}

/** Les fichiers d'une marque : trait noir, et sa version blanche si elle existe. */
interface StoreLogoFiles {
  light: number;
  dark?: number;
}

/** `mono` = traits noirs + version blanche ; `colour` = couleurs de marque. */
const STORE_LOGOS: Readonly<Record<StoreLogoId, StoreLogoFiles>> = {
  'adidas': {
    light: require('../../../assets/aywebs/brands/adidas.png'),
    dark: require('../../../assets/aywebs/brands-dark/adidas.png'),
  },
  'aliexpress': {
    light: require('../../../assets/aywebs/brands/aliexpress.png'),
  },
  'amazon': {
    light: require('../../../assets/aywebs/brands/amazon.png'),
  },
  'asics': {
    light: require('../../../assets/aywebs/brands/asics.png'),
    dark: require('../../../assets/aywebs/brands-dark/asics.png'),
  },
  'calvin-klein': {
    light: require('../../../assets/aywebs/brands/calvin-klein.png'),
    dark: require('../../../assets/aywebs/brands-dark/calvin-klein.png'),
  },
  'champion': {
    light: require('../../../assets/aywebs/brands/champion.png'),
  },
  'chanel': {
    light: require('../../../assets/aywebs/brands/chanel.png'),
    dark: require('../../../assets/aywebs/brands-dark/chanel.png'),
  },
  'converse': {
    light: require('../../../assets/aywebs/brands/converse.png'),
    dark: require('../../../assets/aywebs/brands-dark/converse.png'),
  },
  'louis-vuitton': {
    light: require('../../../assets/aywebs/brands/louis-vuitton.png'),
    dark: require('../../../assets/aywebs/brands-dark/louis-vuitton.png'),
  },
  'new-balance': {
    light: require('../../../assets/aywebs/brands/new-balance.png'),
    dark: require('../../../assets/aywebs/brands-dark/new-balance.png'),
  },
  'nike': {
    light: require('../../../assets/aywebs/brands/nike.png'),
    dark: require('../../../assets/aywebs/brands-dark/nike.png'),
  },
  'puma': {
    light: require('../../../assets/aywebs/brands/puma.png'),
    dark: require('../../../assets/aywebs/brands-dark/puma.png'),
  },
  'sephora': {
    light: require('../../../assets/aywebs/brands/sephora.png'),
    dark: require('../../../assets/aywebs/brands-dark/sephora.png'),
  },
  'shein': {
    light: require('../../../assets/aywebs/brands/shein.png'),
    dark: require('../../../assets/aywebs/brands-dark/shein.png'),
  },
  'temu': {
    light: require('../../../assets/aywebs/brands/temu.png'),
  },
  'the-north-face': {
    light: require('../../../assets/aywebs/brands/the-north-face.png'),
    dark: require('../../../assets/aywebs/brands-dark/the-north-face.png'),
  },
  'under-armour': {
    light: require('../../../assets/aywebs/brands/under-armour.png'),
    dark: require('../../../assets/aywebs/brands-dark/under-armour.png'),
  },
  'vans': {
    light: require('../../../assets/aywebs/brands/vans.png'),
    dark: require('../../../assets/aywebs/brands-dark/vans.png'),
  },
  'zara': {
    light: require('../../../assets/aywebs/brands/zara.png'),
    dark: require('../../../assets/aywebs/brands-dark/zara.png'),
  },
};

/** Le logo de cette boutique pour ce thème, ou `undefined` (initiale). */
export function storeLogoSources(
  store: { id?: string; name?: string; displayName?: string } | null | undefined,
  mode: 'light' | 'dark' = 'light',
): StoreLogoSources | undefined {
  const id = storeLogoId(store);
  if (!id) return undefined;
  const logo = STORE_LOGOS[id];
  if (!logo || !logo.light) return undefined;
  if (mode === 'dark' && logo.dark) return { source: logo.dark };
  if (mode === 'dark') return { source: logo.light, plate: LOGO_PLATE.light };
  return { source: logo.light };
}
