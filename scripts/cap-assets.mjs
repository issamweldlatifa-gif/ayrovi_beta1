import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

/**
 * AYROVI — génère assets/icon.png + assets/splash.png depuis le logo source,
 * puis l'appelleur lance : npx @capacitor/assets generate --android
 * Fond = #FAFAFA (la couleur marchande de l'app), logo centré.
 */
const LOGO = 'client/public/media/logo-ayrovi-512.png';
mkdirSync('assets', { recursive: true });

const compose = async (size, ratio) => {
  const box = Math.round(size * ratio);
  const logo = await sharp(LOGO).resize(box, box, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#FAFAFA' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png();
};

await (await compose(1024, 0.62)).toFile('assets/icon.png');
await (await compose(2732, 0.30)).toFile('assets/splash.png');
console.log('assets/icon.png + assets/splash.png → ok (lancer: npx @capacitor/assets generate --android)');
