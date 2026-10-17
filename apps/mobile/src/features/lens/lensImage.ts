/**
 * Z Lens — copies réduites des photos avant envoi.
 *
 * Une photo de téléphone pèse plusieurs mégaoctets ; le serveur la ramène de
 * toute façon à 1 280 px (recherche) ou 768 px (repérage). Réduire sur le
 * téléphone rend l'envoi plusieurs fois plus court sur un réseau mobile — et
 * indispensable pour Live, qui envoie une petite image à chaque visée.
 *
 * Import dynamique : les tests Node/Jest n'initialisent pas le module natif.
 * En cas d'échec, on renvoie l'image d'origine (jamais d'erreur bloquante).
 */
export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  /** Fichier créé ici : à supprimer après usage. */
  created: boolean;
}

type Releasable = { release?: () => void };

function release(value: unknown) {
  try {
    (value as Releasable | null)?.release?.();
  } catch {
    // Libération best-effort de l'objet natif.
  }
}

export async function shrinkImage(
  uri: string,
  maxEdge: number,
  compress: number,
  known?: { width?: number | null; height?: number | null },
): Promise<PreparedImage> {
  const fallback: PreparedImage = { uri, width: known?.width ?? 0, height: known?.height ?? 0, created: false };
  let context: unknown = null;
  let original: unknown = null;
  let rendered: unknown = null;
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const manipulator = ImageManipulator.manipulate(uri);
    context = manipulator;
    // Taille réelle de l'image REDRESSÉE (EXIF) : les dimensions annoncées par
    // la galerie peuvent être celles du fichier brut, avant rotation.
    const source = await manipulator.renderAsync();
    original = source;
    const width = source.width;
    const height = source.height;
    if (Math.max(width, height) > maxEdge) {
      manipulator.resize(width >= height ? { width: maxEdge } : { height: maxEdge });
    }
    const output = await manipulator.renderAsync();
    rendered = output;
    const saved = await output.saveAsync({ compress, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height, created: true };
  } catch {
    return fallback;
  } finally {
    if (rendered !== original) release(rendered);
    release(original);
    release(context);
  }
}
