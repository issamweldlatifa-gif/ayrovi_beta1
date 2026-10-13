/**
 * Upload multipart NATIF pour les fichiers du téléphone.
 *
 * Le `FormData` de React Native/Expo sait accepter `{ uri, name, type }`, mais
 * cette voie ne permet pas de vérifier que le fichier de caméra existe encore
 * avant la construction du corps. `expo-file-system` lit explicitement le
 * `file://` natif et fabrique le multipart côté Android/iOS : on obtient donc
 * un diagnostic local précis et un transport indépendant de la sérialisation
 * JavaScript, sans charger l'image en base64 dans Hermes. Authentification,
 * délai et enveloppe API restent identiques au client partagé.
 */
import { apiUrl, authHeaders } from './client';
import { failureFrom, parseRetryAfter, unwrap } from './envelope';
import { ApiError, isApiError } from './errors';

export interface NativeUploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface NativeUploadOptions {
  parameters?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function responseHeader(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return null;
}

/**
 * Envoie un seul fichier sous `fieldName`, puis retourne `data` depuis
 * `{ success: true, data }` exactement comme le client HTTP partagé.
 */
export async function apiUploadFileData<T>(
  path: string,
  fieldName: string,
  input: NativeUploadFile,
  options: NativeUploadOptions = {},
): Promise<T> {
  const uri = String(input.uri || '').trim();
  if (!uri) {
    throw new ApiError('device', 'Aucun fichier local à envoyer.', { code: 'IMAGE_FILE_MISSING' });
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort('caller');
  if (options.signal?.aborted) controller.abort('caller');
  else options.signal?.addEventListener('abort', abortFromCaller);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort('timeout');
  }, options.timeoutMs ?? 60_000);

  try {
    // Import dynamique : les tests Node peuvent valider les parseurs sans
    // initialiser un module natif Android/iOS.
    const { File, UploadType } = await import('expo-file-system');
    const localFile = new File(uri);
    if (!localFile.exists || (typeof localFile.size === 'number' && localFile.size <= 0)) {
      throw new ApiError('device', 'La photo locale est introuvable ou vide.', { code: 'IMAGE_FILE_UNREADABLE' });
    }

    const result = await localFile.upload(apiUrl(path), {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName,
      mimeType: input.type || localFile.type || 'image/jpeg',
      parameters: options.parameters,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'x-ayrovi-native': '1',
        ...authHeaders('POST'),
        ...options.headers,
      },
    });

    let payload: unknown = null;
    if (result.body?.trim()) {
      try { payload = JSON.parse(result.body); }
      catch {
        throw new ApiError('malformed', `Réponse non JSON (${path})`, {
          status: result.status,
          code: 'UPLOAD_RESPONSE_INVALID',
        });
      }
    }
    if (result.status < 200 || result.status >= 300) {
      throw failureFrom(
        result.status,
        payload,
        parseRetryAfter(responseHeader(result.headers, 'retry-after')),
      );
    }
    return unwrap<T>(payload, { status: result.status, source: path });
  } catch (error) {
    if (isApiError(error)) throw error;
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new ApiError('timeout', `Délai dépassé pendant l'envoi : ${path}`, { cause: error });
      }
      throw new ApiError('aborted', `Envoi annulé : ${path}`, { cause: error });
    }
    // Les erreurs de lecture de fichier et du pont natif arrivent avant toute
    // réponse HTTP : on les distingue d'une panne du serveur.
    throw new ApiError('device', `Impossible de lire ou d'envoyer la photo locale : ${path}`, {
      code: 'NATIVE_IMAGE_UPLOAD_FAILED',
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
