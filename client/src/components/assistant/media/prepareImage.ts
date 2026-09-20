export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PREPARED_IMAGE_BYTES = 2.5 * 1024 * 1024;
export type ImageErrorCode = 'format' | 'large' | 'unreadable' | 'prepared-large' | 'timeout' | 'limit';
export class ImagePreparationError extends Error {
  constructor(public readonly code: ImageErrorCode) { super(code); }
}
const types = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const aborted = () => new DOMException('Cancelled', 'AbortError');

/** Even APIs without cancellation must not keep their consumer waiting. Dispose late resources. */
function owned<T>(promise: Promise<T>, signal: AbortSignal, dispose?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason || aborted());
    if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) { dispose?.(value); return; }
      resolve(value);
    }, error => { signal.removeEventListener('abort', cancel); reject(error); });
  });
}
function dataUrl(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clear = () => { reader.onload = reader.onerror = reader.onabort = null; signal.removeEventListener('abort', cancel); };
    const cancel = () => { clear(); if (reader.readyState === 1) reader.abort(); reject(signal.reason || aborted()); };
    reader.onload = () => { const result = reader.result; clear(); typeof result === 'string' ? resolve(result) : reject(new ImagePreparationError('unreadable')); };
    reader.onerror = () => { clear(); reject(new ImagePreparationError('unreadable')); };
    reader.onabort = () => { clear(); reject(aborted()); };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    try { reader.readAsDataURL(blob); } catch { clear(); reject(new ImagePreparationError('unreadable')); }
  });
}
export function validImageHeader(bytes: Uint8Array, type: string): boolean {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  return type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/png' ? [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
    : type === 'image/gif' ? ['GIF87a','GIF89a'].includes(ascii(0,6))
    : type === 'image/webp' ? ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP' : false;
}

/** Shared by text and voice attachments. No unbounded raw fallback after a decode error. */
export async function prepareAssistantImage(file: File, outerSignal: AbortSignal): Promise<{ preview: string; type: string }> {
  if (!types.has(file.type)) throw new ImagePreparationError('format');
  if (!file.size) throw new ImagePreparationError('unreadable');
  if (file.size > MAX_IMAGE_FILE_BYTES) throw new ImagePreparationError('large');
  const controller = new AbortController();
  const cancel = () => controller.abort(outerSignal.reason || aborted());
  if (outerSignal.aborted) cancel(); else outerSignal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new ImagePreparationError('timeout')), 30_000);
  const signal = controller.signal;
  let bitmap: ImageBitmap | null = null;
  try {
    const header = await owned(file.slice(0,12).arrayBuffer(), signal);
    if (!validImageHeader(new Uint8Array(header), file.type)) throw new ImagePreparationError('format');
    let prepared: Blob = file;
    if (typeof createImageBitmap === 'function') {
      bitmap = await owned(createImageBitmap(file), signal, value => value.close());
      if (signal.aborted) throw signal.reason;
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new ImagePreparationError('unreadable');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close(); bitmap = null;
      const encode = (type: string, quality?: number) => owned(new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality)), signal);
      let encoded = await encode('image/png');
      if (!encoded || encoded.size > MAX_PREPARED_IMAGE_BYTES) encoded = await encode('image/jpeg', .85);
      if (!encoded || encoded.size > MAX_PREPARED_IMAGE_BYTES) encoded = await encode('image/jpeg', .65);
      if (!encoded) throw new ImagePreparationError('unreadable');
      prepared = encoded;
    }
    if (!prepared.size) throw new ImagePreparationError('unreadable');
    if (prepared.size > MAX_PREPARED_IMAGE_BYTES) throw new ImagePreparationError('prepared-large');
    if (!types.has(prepared.type)) throw new ImagePreparationError('format');
    return { preview: await dataUrl(prepared, signal), type: prepared.type };
  } catch (error) {
    if (signal.aborted) throw signal.reason || aborted();
    if (error instanceof ImagePreparationError) throw error;
    throw new ImagePreparationError('unreadable');
  } finally { bitmap?.close(); clearTimeout(timeout); outerSignal.removeEventListener('abort', cancel); }
}
