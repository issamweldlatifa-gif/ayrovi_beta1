/**
 * AYROVIX · préparation d'image côté client :
 * réduction douce (max 1400px, JPEG 0.85) pour un upload rapide en 4G,
 * + URL de preview locale. En cas d'échec canvas → fichier d'origine.
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
    if (scale >= 1) { bitmap.close(); return { file: source, previewUrl }; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return { file: source, previewUrl }; }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= source.size) return { file: source, previewUrl };
    return { file: new File([blob], source.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }), previewUrl };
  } catch {
    return { file: source, previewUrl };
  }
}
