/** محتوى بلوك Lens في الصفحة الرئيسية — قراءة صارمة بلا React (قابلة للاختبار). */

export interface LensHomeContent {
  enabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  poster: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** قراءة صارمة: حقل غير نصي ⇒ فارغ، وما نخمّنوش. */
export function parseLensHome(value: unknown): LensHomeContent | null {
  if (!isRecord(value)) return null;
  const media = isRecord(value.media) ? value.media : {};
  return {
    enabled: value.enabled !== false,
    eyebrow: text(value.eyebrow),
    title: text(value.title),
    description: text(value.description),
    ctaLabel: text(value.ctaLabel),
    poster: text(media.poster),
  };
}
