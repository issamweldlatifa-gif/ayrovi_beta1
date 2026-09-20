import { cleanAssistantText } from './composerPolicy';

export type TextActionResult = 'copied' | 'shared' | 'cancelled' | 'empty' | 'unavailable' | 'error';
type BrowserActions = Pick<Navigator, 'share' | 'clipboard'>;
const browserActions = (): Partial<BrowserActions> => typeof navigator === 'undefined' ? {} : navigator;

/** Only the displayed prose is exported, never internal directives or tool metadata. */
export async function copyAssistantText(raw: string, browser = browserActions()): Promise<TextActionResult> {
  const text = cleanAssistantText(raw);
  if (!text) return 'empty';
  if (!browser.clipboard?.writeText) return 'unavailable';
  try { await browser.clipboard.writeText(text); return 'copied'; }
  catch { return 'error'; }
}

export async function shareAssistantText(raw: string, browser = browserActions()): Promise<TextActionResult> {
  const text = cleanAssistantText(raw);
  if (!text) return 'empty';
  if (!browser.share) return copyAssistantText(text, browser);
  try { await browser.share({ title: 'AYROVI', text }); return 'shared'; }
  catch (error) {
    // A dismissed native sheet is not failure, and must never write the clipboard.
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError' ? 'cancelled' : 'error';
  }
}

export const textActionLabels: Record<TextActionResult, readonly [string, string]> = {
  copied: ['Texte copié', 'تم نسخ النص'],
  shared: ['Texte partagé', 'تمت مشاركة النص'],
  cancelled: ['Partage annulé', 'أُلغيت المشاركة'],
  empty: ['Cette réponse ne contient pas de texte à exporter.', 'لا يتضمن هذا الرد نصًا للنسخ أو المشاركة.'],
  unavailable: ['Action indisponible dans ce navigateur.', 'هذا الإجراء غير متاح في هذا المتصفح.'],
  error: ['Action impossible. Réessayez ou vérifiez les autorisations du navigateur.', 'تعذّر تنفيذ الإجراء. أعد المحاولة أو تحقّق من أذونات المتصفح.'],
};
