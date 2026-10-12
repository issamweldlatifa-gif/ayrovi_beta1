/*
 * ISOLATION PAR PHOTOROOM (Remove Background API, plan Basic).
 *
 * Activée uniquement si :
 *   • AYROVI_ISOLATION_PROVIDER=photoroom ;
 *   • PHOTOROOM_API_KEY est défini côté serveur (Render Environment).
 * Sinon le comportement reste celui de l'isolation locale (défaut `local`).
 *
 * La clé ne quitte jamais le serveur, n'apparaît dans aucun journal et aucun
 * message d'erreur. Une clé sandbox produit un résultat FILIGRANÉ : acceptable
 * en développement uniquement ; la production exige une clé de production.
 * Tout échec (réseau, délai, statut HTTP, réponse non PNG) renvoie null : l'appelant
 * retombe alors sur le chroma-key puis sur l'original — jamais d'erreur bloquante.
 */

export const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';
const PHOTOROOM_TIMEOUT_MS = 20_000;
const PHOTOROOM_MAX_RESULT_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type IsolationProvider = 'local' | 'photoroom';

/** Fournisseur effectif : `photoroom` seulement si la clé serveur est présente. */
export function isolationProvider(env: NodeJS.ProcessEnv = process.env): IsolationProvider {
  if (env.AYROVI_ISOLATION_PROVIDER !== 'photoroom') return 'local';
  return String(env.PHOTOROOM_API_KEY || '').trim() ? 'photoroom' : 'local';
}

export function isPhotoRoomPng(buffer: Buffer): boolean {
  if (buffer.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

export interface PhotoRoomOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Envoie l'image à PhotoRoom et renvoie le PNG détouré, ou null en cas d'échec.
 * Le contenu d'entrée est envoyé tel quel (multipart `image_file`).
 */
export async function removeBackgroundWithPhotoRoom(
  input: Buffer,
  options: PhotoRoomOptions = {},
): Promise<Buffer | null> {
  const env = options.env ?? process.env;
  if (isolationProvider(env) !== 'photoroom') return null;
  const apiKey = String(env.PHOTOROOM_API_KEY || '').trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const form = new FormData();
    form.append('image_file', new Blob([new Uint8Array(input)]), 'product.jpg');
    form.append('format', 'png');
    form.append('channels', 'rgba');
    form.append('size', 'full');
    const response = await fetchImpl(PHOTOROOM_SEGMENT_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, accept: 'image/png' },
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs ?? PHOTOROOM_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[PhotoRoom] HTTP ${response.status} — repli sur l'isolation locale.`);
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > PHOTOROOM_MAX_RESULT_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const output = Buffer.from(await response.arrayBuffer());
    if (output.length === 0 || output.length > PHOTOROOM_MAX_RESULT_BYTES || !isPhotoRoomPng(output)) {
      console.warn('[PhotoRoom] réponse non PNG ou vide — repli.');
      return null;
    }
    return output;
  } catch (error: any) {
    // Le message d'erreur peut contenir des détails d'URL : on ne journalise que le nom.
    console.warn(`[PhotoRoom] appel échoué (${error?.name || 'erreur'}) — repli.`);
    return null;
  }
}
