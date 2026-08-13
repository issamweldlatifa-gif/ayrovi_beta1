/**
 * AYROVIX client image preparation.
 * Product photos are compact JPEGs; screenshots stay PNG so visible prices and
 * product codes remain sharp for Claude Vision. No colour-changing filters.
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
    const screenshot = source.type === 'image/png'
      || /(?:screen(?:shot)?|capture|panier|cart|receipt|facture)/i.test(source.name || '');
    const maxEdge = screenshot ? 1600 : 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return { file: source, previewUrl };
    }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
    const outputType = screenshot ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, screenshot ? undefined : 0.84));
    if (!blob) return { file: source, previewUrl };
    // Avoid replacing an already compact image with a significantly larger one.
    if (blob.size > source.size * 1.25 && source.size <= 5 * 1024 * 1024) {
      return { file: source, previewUrl };
    }
    const extension = screenshot ? '.png' : '.jpg';
    return {
      file: new File([blob], source.name.replace(/\.\w+$/, '') + extension, { type: outputType }),
      previewUrl,
    };
  } catch {
    return { file: source, previewUrl };
  }
}
