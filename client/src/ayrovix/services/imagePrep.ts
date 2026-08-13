/**
 * AYROVIX · préparation d'image côté client V2 — Image Clarity + Secret Tech Hidden
 * - Réduction douce (max 1400px, JPEG 0.85) pour upload rapide 4G
 * - Amélioration clarté: contrast(1.15) brightness(1.08) saturate(1.1) pour produit plus net
 * - Aucun mot technique exposé (OCR/Vision caché)
 */

export interface PreparedImage {
  file: File;
  previewUrl: string;
}

export async function prepareImage(source: File): Promise<PreparedImage> {
  const previewUrl = URL.createObjectURL(source);
  if (!source.type.startsWith('image/')) return { file: source, previewUrl };
  try {
    const bitmap = await createImageBitmap(source);
    const MAX = 1400;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    // Même si pas de resize, on améliore la clarté pour l'upload
    const targetW = Math.round(bitmap.width * scale);
    const targetH = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return { file: source, previewUrl }; }
    // AYROVI Clarity Boost — rend l'image plus nette et claire (caché sous nom "Analyse instantanée")
    // @ts-ignore - filter support modern browsers
    ctx.filter = 'contrast(1.15) brightness(1.08) saturate(1.1)';
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return { file: source, previewUrl };
    // Si l'image améliorée plus grande, garde l'original mais preview reste clair
    if (blob.size > source.size * 1.2) return { file: source, previewUrl };
    return { file: new File([blob], source.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }), previewUrl };
  } catch {
    return { file: source, previewUrl };
  }
}
