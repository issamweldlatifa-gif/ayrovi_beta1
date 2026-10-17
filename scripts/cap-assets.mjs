import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

/**
 * ZAYROVI — génère assets/icon.png + assets/splash.png (+ splash-dark.png) depuis le logo
 * source, puis l'appelant lance `capacitor-assets generate --android` (voir « android:assets »).
 * Le logo officiel est un Z blanc sur noir : fond #0A0A0A (noir de la palette), Z blanc centré,
 * dans les deux thèmes — c'est aussi l'écran d'ouverture de l'application.
 */
const LOGO = 'client/public/media/logo-ayrovi-light.png'; // Z blanc, 86 % de la largeur du carré
const LOGO_SHARE = 0.86;
const INK = '#0A0A0A';
mkdirSync('assets', { recursive: true });

/** Carré `size` px, fond noir, Z occupant `share` de la largeur. */
const compose = async (size, share) => {
  const box = Math.round((size * share) / LOGO_SHARE);
  const logo = await sharp(LOGO).resize(box, box, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 });
};

await (await compose(1024, 0.62)).toFile('assets/icon.png');
const splash = await (await compose(2732, 0.40)).toBuffer();
await sharp(splash).toFile('assets/splash.png');
await sharp(splash).toFile('assets/splash-dark.png');
console.log('assets/icon.png + assets/splash.png + assets/splash-dark.png → ok (lancer: npm run android:assets)');
