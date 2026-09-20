import React from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import type { HistoryStatus } from './conversationHistory';

const labels: Record<Exclude<HistoryStatus, 'ready'>, readonly [string, string]> = {
  unavailable: ['Le stockage du navigateur est indisponible. Les dernières modifications ne sont pas enregistrées. Gardez cette conversation ouverte.', 'تخزين المتصفح غير متاح. لم تُحفظ التغييرات الأخيرة؛ أبقِ هذه المحادثة مفتوحة.'],
  corrupt: ['Une partie de l’historique est illisible. Le stockage existant n’a pas été remplacé ; les nouvelles modifications ne sont pas enregistrées.', 'تعذّرت قراءة جزء من السجل. لم تُستبدل النسخة المحفوظة، ولم تُحفظ التغييرات الجديدة.'],
  limit: ['L’historique dépasse la taille prise en charge. Aucun texte n’a été raccourci pour le faire tenir ; les dernières modifications ne sont pas enregistrées.', 'تجاوز السجل الحجم المتاح. لم يُقصّ النص ليلائم المساحة، ولم تُحفظ التغييرات الأخيرة.'],
  quota: ['L’espace de stockage est insuffisant. Les dernières modifications ne sont pas enregistrées. Libérez de l’espace, puis réessayez.', 'مساحة التخزين غير كافية. لم تُحفظ التغييرات الأخيرة. حرّر مساحة ثم أعد المحاولة.'],
  invalid: ['Cette réponse ne peut pas être enregistrée dans son format actuel. La conversation reste ouverte et l’ancien historique est conservé.', 'لا يمكن حفظ هذا الرد بصيغته الحالية. تظل المحادثة مفتوحة ويُحفظ السجل السابق دون تغيير.'],
};

export function AssistantHistoryNotice({ status, restored = false, onRetry, busy = false }: { status: HistoryStatus; restored?: boolean; onRetry?: () => void; busy?: boolean }) {
  const { tr } = useLocale();
  if (status === 'ready' && !restored) return null;
  return <aside data-history-notice className="ay-readable-label mb-4 border border-line p-3 text-xs leading-6 text-muted">
    {status !== 'ready' && <div role="status"><p>{tr(...labels[status])}</p>{onRetry && <button type="button" disabled={busy} onClick={onRetry} className="ay-btn-secondary mt-2 min-h-11 px-3 text-xs">{tr('Réessayer l’enregistrement', 'إعادة محاولة الحفظ')}</button>}</div>}
    {restored && <p>{tr('Conversation restaurée sur cet appareil. Les prix et le suivi affichés sont des données historiques, pas une nouvelle vérification. Seuls les noms des pièces jointes sont conservés, pas leurs images.', 'محادثة مستعادة على هذا الجهاز. الأسعار والتتبع المعروضان بيانات سابقة، وليسا تحققًا جديدًا. تُحفظ أسماء المرفقات فقط، وليس صورها.')}</p>}
  </aside>;
}
