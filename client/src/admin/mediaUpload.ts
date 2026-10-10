/**
 * Upload d'un média depuis l'Admin (Stories, Reels, Publications) : une seule voie.
 *
 * • Les photos sont réduites dans le navigateur (plus grand côté ≤ 1600 px, WebP) :
 *   une photo de téléphone de 5 à 12 Mo passe ainsi sous la limite serveur de 4 Mo
 *   au lieu d'être refusée.
 * • Une vidéo trop lourde est refusée AVANT l'envoi, avec la marche à suivre
 *   (lien https direct) — au lieu d'un échec silencieux.
 * • Les erreurs remontent toujours à l'écran : jamais de promesse rejetée ignorée.
 */
import { adminApi } from './api';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 1600;

/** Dimensions après réduction : le plus grand côté ≤ max, sans agrandir. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;

const readDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
  reader.readAsDataURL(file);
});

/** Réduit une photo : WebP si le navigateur le sait encoder, JPEG sinon. */
async function shrinkImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image illisible : essayez un autre fichier (JPEG, PNG ou WebP).'));
      element.src = objectUrl;
    });
    const size = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Réduction de l’image impossible sur ce navigateur.');
    context.drawImage(image, 0, 0, size.width, size.height);
    const webp = canvas.toDataURL('image/webp', 0.88);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Envoie un fichier au stockage admin et renvoie son URL publique. Lève une erreur lisible sinon. */
export async function uploadMediaFile(file: File): Promise<string> {
  let dataUrl: string;
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error(`Vidéo trop lourde (${megabytes(file.size)}) : la limite est de 10 Mo. Hébergez la vidéo et collez son lien https direct.`);
    }
    dataUrl = await readDataUrl(file);
  } else if (file.type === 'image/gif') {
    dataUrl = await readDataUrl(file);
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`GIF trop lourd (${megabytes(file.size)}) : la limite est de 4 Mo.`);
  } else {
    dataUrl = await shrinkImage(file);
    const bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);
    if (bytes > MAX_IMAGE_BYTES) throw new Error('Image trop lourde même après réduction : choisissez une photo plus petite.');
  }
  const result = await adminApi<any>('/uploads', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  const url = result.data?.url as string | undefined;
  if (!url) throw new Error('Le téléversement a échoué : aucune adresse reçue.');
  return url;
}
