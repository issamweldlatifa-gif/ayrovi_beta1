import { uploadMediaFile, MAX_VIDEO_BYTES } from './mediaUpload';
import type { PublicationMedia } from '../../../shared/publicationContent';
/** Decode before publishing: no invented dimensions or fake video covers. Originals remain separate. */
export async function uploadPublicationMedia(
  file: File
): Promise<PublicationMedia> {
  const video = file.type.startsWith('video/');
  if (
    !/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|ogg|quicktime|x-m4v))$/.test(
      file.type
    )
  )
    throw new Error(
      'Format non supporté. Images JPEG/PNG/WebP/GIF ; vidéos MP4, WebM, Ogg, MOV ou M4V lisibles par le navigateur.'
    );
  if (file.size > MAX_VIDEO_BYTES)
    throw new Error('Média trop lourd : limite 10 Mo par fichier.');
  const objectUrl = URL.createObjectURL(file);
  try {
    let width = 0,
      height = 0,
      poster = '';
    if (video) {
      const el = document.createElement('video');
      el.muted = true;
      el.preload = 'auto';
      el.playsInline = true;
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            el.onloadeddata = null;
            el.onerror = null;
            reject(
              new Error(
                'Lecture vidéo trop lente. Réessayez avec un MP4 H.264.'
              )
            );
          }, 20000);
          el.onloadeddata = () => {
            clearTimeout(timeout);
            resolve();
          };
          el.onerror = () => {
            clearTimeout(timeout);
            reject(
              new Error(
                'Codec vidéo illisible. Exportez en MP4 H.264/AAC pour la meilleure compatibilité mobile.'
              )
            );
          };
          el.src = objectUrl;
        });
        width = el.videoWidth;
        height = el.videoHeight;
        if (
          !width ||
          !height ||
          !Number.isFinite(el.duration) ||
          el.duration > 300
        )
          throw new Error('Vidéo invalide ou trop longue : maximum 5 minutes.');
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(width, 1200);
        canvas.height = Math.round((height * canvas.width) / width);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Création de couverture impossible.');
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error('Couverture indisponible.')),
            'image/jpeg',
            0.9
          )
        );
        poster = await uploadMediaFile(
          new File([blob], 'cover.jpg', { type: 'image/jpeg' })
        );
      } finally {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    } else {
      const el = new Image();
      await new Promise<void>((resolve, reject) => {
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('Image illisible.'));
        el.src = objectUrl;
      });
      width = el.naturalWidth;
      height = el.naturalHeight;
    }
    let originalUrl = '';
    const url = await uploadMediaFile(file, {
      preserveOriginal: true,
      onUploaded: (r) => {
        originalUrl = r.originalUrl || r.url;
      },
    });
    return {
      type: video ? 'video' : 'image',
      url,
      originalUrl,
      poster,
      alt: '',
      width,
      height,
      purpose: 'scene',
      focalX: 50,
      focalY: 50,
      scale: 1,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
