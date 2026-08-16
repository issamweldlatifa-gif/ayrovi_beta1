import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp, Calendar, FileText, Link2, Sparkles, Trash2 } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Field, Modal, Select, StatusBadge, Toast } from './components';
import type { MagazineDraft } from './MagazineAgentPage';

interface MagazineDraftsPanelProps {
  canWrite: boolean;
  pendingDraftId?: string;
  onPendingHandled: () => void;
  onCmsChanged: () => void;
}

const TYPE_LABEL: Record<string, string> = { editorial: 'مقالة', publication: 'منشور', story: 'ستوري', reel: 'ريلز' };
const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', scheduled: 'مجدولة', published: 'منشورة', archived: 'مؤرشفة' };

function localScheduleDefault(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function categoriesFor(type: string) {
  if (type === 'editorial') return [
    { value: 'AYROVI', label: 'AYROVI' }, { value: 'NEW_ARRIVAL', label: 'وصول جديد' },
    { value: 'NEW_BRAND', label: 'علامة جديدة' }, { value: 'PROMOTION', label: 'عرض' },
    { value: 'INFORMATION', label: 'معلومة' }, { value: 'OTHER', label: 'أخرى' },
  ];
  if (type === 'story') return [
    { value: 'STYLE', label: 'ستايل' }, { value: 'NEW', label: 'جديد' }, { value: 'ARRIVAGE', label: 'وصول' },
    { value: 'PROMO', label: 'عرض' }, { value: 'INFO', label: 'معلومة' },
  ];
  return [{ value: 'AYROVI', label: 'AYROVI' }, { value: 'STYLE', label: 'ستايل' }, { value: 'PROMO', label: 'عرض' }];
}

function preview(draft: MagazineDraft): string {
  return String(draft.product?.image || draft.referenceMedia?.[0]?.thumbnailUrl || draft.stockMedia?.find((item: any) => item.previewUrl)?.previewUrl || '');
}

export const MagazineDraftsPanel: React.FC<MagazineDraftsPanelProps> = ({ canWrite, pendingDraftId, onPendingHandled, onCmsChanged }) => {
  const [rows, setRows] = useState<MagazineDraft[]>([]);
  const [filter, setFilter] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<MagazineDraft | null>(null);
  const [transfer, setTransfer] = useState<{ status: 'draft' | 'scheduled'; category: string; scheduledAt: string }>({ status: 'draft', category: 'AYROVI', scheduledAt: localScheduleDefault() });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '160' });
      if (filter) query.set('status', filter);
      if (type) query.set('type', type);
      const result = await adminApi<any>(`/magazine-drafts?${query}`);
      setRows(result.data || []);
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, [filter, type]);
  useEffect(() => { void load(); }, [load]);

  const openTransfer = useCallback(async (id: string) => {
    try {
      const current = rows.find((row) => row.id === id) || (await adminApi<any>(`/magazine-drafts/${id}`)).data;
      setSelected(current);
      const categoryOptions = categoriesFor(current.content_type);
      setTransfer({
        status: current.status === 'scheduled' ? 'scheduled' : 'draft',
        category: current.category && categoryOptions.some((option) => option.value === current.category) ? current.category : categoryOptions[0].value,
        scheduledAt: current.scheduled_at ? (() => { const date = new Date(current.scheduled_at); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); })() : localScheduleDefault(),
      });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
  }, [rows]);

  useEffect(() => {
    if (!pendingDraftId) return;
    void openTransfer(pendingDraftId).finally(onPendingHandled);
  }, [pendingDraftId, openTransfer, onPendingHandled]);

  const submitTransfer = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await adminApi<any>(`/magazine-drafts/${selected.id}/prepare`, {
        method: 'PUT',
        body: JSON.stringify({ status: transfer.status, category: transfer.category, scheduledAt: transfer.status === 'scheduled' ? new Date(transfer.scheduledAt).toISOString() : null }),
      });
      setRows((current) => current.map((row) => row.id === selected.id ? result.data : row));
      setSelected(null); onCmsChanged();
      setToast({ message: transfer.status === 'scheduled' ? 'نُقلت البطاقة إلى مجلتي وحُفظ موعدها.' : 'نُقلت البطاقة إلى مجلتي كمسودة للمراجعة.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const remove = async (draft: MagazineDraft) => {
    if (!window.confirm(`حذف مسودة «${draft.title}»؟`)) return;
    try {
      await adminApi(`/magazine-drafts/${draft.id}`, { method: 'DELETE' });
      setRows((current) => current.filter((row) => row.id !== draft.id));
      setToast({ message: 'حُذفت المسودة.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
  };

  const stats = useMemo(() => ({ draft: rows.filter((row) => row.status === 'draft').length, scheduled: rows.filter((row) => row.status === 'scheduled').length }), [rows]);

  return (
    <section className="mag-library" dir="rtl">
      <header className="mag-library-head"><div><span><Sparkles /></span><div><p>وكيل مجلتي</p><h2>مسودات الوكيل</h2><small>كل ناتج محفوظ تلقائيًا، مع فصل المراجع عن الوسائط المرخصة للنشر.</small></div></div><div><b>{stats.draft}<small>مسودة</small></b><b>{stats.scheduled}<small>مجدولة</small></b></div></header>
      <div
        className="mag-library-drop"
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData('application/x-ayrovi-magazine-draft') || event.dataTransfer.getData('text/plain');
          if (id.startsWith('mag_draft_')) void openTransfer(id);
        }}
      ><ArrowUp /><div><strong>أفلت بطاقة وكيل مجلتي هنا</strong><span>سنطلب التصنيف وموعد النشر قبل نقلها إلى نظام المحتوى.</span></div></div>
      <div className="mag-library-tools">
        <Select value={filter} onChange={(event) => setFilter(event.target.value)} options={[{ value: '', label: 'كل الحالات' }, { value: 'draft', label: 'مسودات' }, { value: 'scheduled', label: 'مجدولة' }, { value: 'published', label: 'منشورة' }]} />
        <Select value={type} onChange={(event) => setType(event.target.value)} options={[{ value: '', label: 'كل الأنواع' }, { value: 'editorial', label: 'مقالات' }, { value: 'publication', label: 'منشورات' }, { value: 'story', label: 'Stories' }, { value: 'reel', label: 'Reels' }]} />
        <Button variant="ghost" onClick={() => void load()}>تحديث</Button>
      </div>
      <div className="mag-library-grid">
        {rows.map((draft) => {
          const image = preview(draft);
          return <article key={draft.id}><div className="mag-library-media">{image ? <img src={image} alt="" /> : <FileText />}<span>{TYPE_LABEL[draft.content_type]}</span></div><div className="mag-library-copy"><div><StatusBadge status={draft.status.toUpperCase()} /><small>{new Date(draft.created_at).toLocaleDateString('ar-TN')}</small></div><h3>{draft.title}</h3><p>{draft.summary}</p>{draft.target_id && <a href={`/admin?section=${draft.target_resource === 'news' ? 'news' : 'social'}`}><Link2 />تم النقل إلى {draft.target_resource}</a>}</div><footer><button type="button" disabled={!canWrite} onClick={() => void openTransfer(draft.id)}><ArrowUp />{draft.target_id ? 'تحديث النقل' : 'نقل إلى مجلتي'}</button><button type="button" disabled={!canWrite} onClick={() => void remove(draft)} aria-label="حذف"><Trash2 /></button></footer></article>;
        })}
        {!loading && !rows.length && <div className="mag-library-empty"><FileText /><strong>لا توجد نتائج بهذا الفلتر.</strong></div>}
      </div>
      <Modal open={Boolean(selected)} title="تأكيد النقل إلى مجلتي" onClose={() => !busy && setSelected(null)} footer={<><Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>إلغاء</Button><Button busy={busy} onClick={() => void submitTransfer()}><ArrowUp />تأكيد الحفظ</Button></>}>
        {selected && <div className="mag-transfer-form"><div className="mag-transfer-summary">{preview(selected) ? <img src={preview(selected)} alt="" /> : <FileText />}<div><span>{TYPE_LABEL[selected.content_type]}</span><strong>{selected.title}</strong><small>سيبقى الناتج غير منشور حتى تراجعه من التبويب المناسب.</small></div></div><Field label="التصنيف" required><Select value={transfer.category} onChange={(event) => setTransfer({ ...transfer, category: event.target.value })} options={categoriesFor(selected.content_type)} /></Field><Field label="طريقة الحفظ" required><Select value={transfer.status} onChange={(event) => setTransfer({ ...transfer, status: event.target.value as 'draft' | 'scheduled' })} options={[{ value: 'draft', label: 'مسودة للمراجعة' }, { value: 'scheduled', label: 'مجدولة للنشر في الموعد بعد هذا التأكيد' }]} /></Field>{transfer.status === 'scheduled' && <Field label="موعد النشر" required><div className="admin-date-input"><Calendar /><input type="datetime-local" min={localScheduleDefault().slice(0, 10)} value={transfer.scheduledAt} onChange={(event) => setTransfer({ ...transfer, scheduledAt: event.target.value })} /></div></Field>}<p className="mag-transfer-rights"><strong>تنبيه حقوق:</strong> الصور الموسومة «مرجعي فقط» لا تنتقل إلى حقل النشر. لا يُنقل فيديو تلقائيًا إلا إذا أعاده Pexels/Pixabay كملف مرخص.</p></div>}
      </Modal>
      {toast && <Toast {...toast} />}
    </section>
  );
};
