import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Bookmark, CheckCircle2, FileText, Image, Link2, Loader2, MessageSquare,
  RefreshCw, Sparkles, Trash2, Video,
} from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Modal, Toast } from './components';

interface MagazineAgentPageProps {
  canWrite: boolean;
  onOpenMagazine: (draftId?: string) => void;
}

type ChatLine = { role: 'user' | 'assistant'; text: string };

type MagazineDraft = {
  id: string;
  batch_id: string;
  content_type: 'editorial' | 'publication' | 'story' | 'reel';
  title: string;
  summary: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  category: string;
  scheduled_at?: string | null;
  target_resource?: string | null;
  target_id?: string | null;
  created_at: string;
  content: any;
  referenceMedia: any[];
  stockMedia: any[];
  product?: any | null;
};

const TYPE_LABELS: Record<MagazineDraft['content_type'], string> = {
  editorial: 'مقالة', publication: 'منشور', story: 'ستوري', reel: 'ريلز',
};

const ARABIC_COUNTS: Record<string, number> = {
  واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, ثلاثة: 3, ثلاث: 3, أربعة: 4, اربع: 4,
  خمسة: 5, خمس: 5, ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثمان: 8,
  تسعة: 9, تسع: 9, عشرة: 10, عشر: 10,
};

function batchCount(command: string): number {
  const digit = command.match(/(?:^|\s)(\d{1,2})(?=\s|$|\D)/)?.[1];
  if (digit) return Math.max(1, Math.min(10, Number(digit)));
  for (const [word, count] of Object.entries(ARABIC_COUNTS)) {
    if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`, 'u').test(command)) return count;
  }
  return 1;
}

function getConversationId(): string {
  const key = 'ayrovi_magazine_agent_conversation';
  const current = sessionStorage.getItem(key);
  if (current && /^[A-Za-z0-9._:-]{8,160}$/.test(current)) return current;
  const next = `mag_${crypto.randomUUID()}`;
  sessionStorage.setItem(key, next);
  return next;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ar-TN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function draftThumbnail(draft: MagazineDraft): string {
  return String(draft.product?.image || draft.referenceMedia?.[0]?.thumbnailUrl || draft.stockMedia?.find((item) => item.previewUrl)?.previewUrl || '');
}

const AgentHeader: React.FC<{ status: any; onRefresh: () => void }> = ({ status, onRefresh }) => {
  const capabilities = status?.capabilities || {};
  return (
    <header className="mag-agent-head">
      <div className="mag-agent-title"><span><Sparkles /></span><div><p>AYROVI EDITORIAL AI</p><h1>وكيل مجلتي</h1><small>محرر داخلي عبر AYROVI AI Core — لا يظهر لزوار الموقع</small></div></div>
      <div className="mag-agent-health" aria-label="حالة ربط الوكيل">
        <span className={capabilities.providerReady ? 'is-on' : 'is-off'}>AI Core {capabilities.providerReady ? 'متصل' : 'غير مضبوط'}</span>
        <span className={capabilities.imageSearch ? 'is-on' : 'is-warning'}>صور {capabilities.imageSearch ? 'متصلة' : 'بدون API'}</span>
        <span className={capabilities.stockSearch ? 'is-on' : 'is-warning'}>Stock {capabilities.pexels || capabilities.pixabay ? 'API مباشر' : capabilities.stockSearch ? 'Web Search' : 'روابط بحث'}</span>
        <button type="button" onClick={onRefresh} aria-label="تحديث"><RefreshCw /></button>
      </div>
    </header>
  );
};

const DraftDetails: React.FC<{ draft: MagazineDraft }> = ({ draft }) => {
  const shared = draft.content || {};
  const editorial = shared.editorial;
  const publication = shared.publication;
  const story = shared.story;
  const reel = shared.reel;
  return (
    <div className="mag-draft-details" dir="rtl">
      <div className="mag-detail-meta"><span>{TYPE_LABELS[draft.content_type]}</span><span>{shared.language || '—'}</span><span>{shared.tone || '—'}</span></div>
      <h2>{draft.title}</h2>
      <p className="mag-angle"><strong>الزاوية:</strong> {shared.angle || '—'}</p>
      {editorial && <article className="mag-editorial-copy"><p className="mag-hook">{editorial.hook}</p>{(editorial.sections || []).map((section: any, index: number) => <section key={`${section.heading}-${index}`}><h3>{section.heading}</h3><p>{section.text}</p></section>)}<p>{editorial.conclusion}</p>{editorial.shop_the_look?.length > 0 && <aside><strong>Shop the Look</strong>{editorial.shop_the_look.map((item: string) => <span key={item}>{item}</span>)}</aside>}</article>}
      {publication && <article className="mag-social-copy"><p>{publication.caption}</p><div>{(publication.hashtags || []).map((tag: string) => <span key={tag}>{tag.startsWith('#') ? tag : `#${tag}`}</span>)}</div><small>الميديا المقترحة: {publication.media_suggestion}</small></article>}
      {story && <article><p className="mag-hook">{story.hook}</p><ol className="mag-script-list">{(story.frames || []).map((frame: any) => <li key={frame.order}><strong>{frame.order}</strong><div><p>{frame.text}</p><small>{frame.visual}</small></div></li>)}</ol><p><strong>تفاعل:</strong> {story.interaction}</p><p><strong>CTA:</strong> {story.cta}</p></article>}
      {reel && <article><p className="mag-hook">{reel.hook}</p><ol className="mag-script-list">{(reel.scenes || []).map((scene: any) => <li key={scene.order}><strong>{scene.seconds}</strong><div><p>{scene.text}</p><small>Stock query: {scene.stock_query}</small></div></li>)}</ol><p><strong>CTA:</strong> {reel.cta} · {reel.duration_seconds} ثانية</p></article>}
      {draft.product && <section className="mag-product-link"><img src={draft.product.image} alt="" /><div><small>منتج حقيقي من قاعدة AYROVI</small><strong>{draft.product.brand} {draft.product.name}</strong><span>{draft.product.price} {draft.product.currency} · {draft.product.finalPriceTnd} TND</span>{draft.product.url && <a href={draft.product.url} target="_blank" rel="noreferrer"><Link2 />فتح الرابط الأصلي</a>}</div></section>}
      <section className="mag-media-sources"><h3>المراجع المرئية وحقوق الاستخدام</h3><div>{(draft.referenceMedia || []).map((media) => <a key={media.url} href={media.url} target="_blank" rel="noreferrer" className="mag-source-card"><span className="is-reference">مرجعي فقط</span>{media.thumbnailUrl ? <img src={media.thumbnailUrl} alt="" /> : <Image />}<strong>{media.title}</strong><small>{media.source}</small></a>)}{(draft.stockMedia || []).map((media) => <a key={`${media.provider}-${media.url}`} href={media.url} target="_blank" rel="noreferrer" className="mag-source-card"><span className={media.publicationReady ? 'is-licensed' : 'is-library'}>{media.publicationReady ? 'مرخص للنشر' : 'مكتبة مرخصة — اختر المقطع'}</span>{media.previewUrl ? <img src={media.previewUrl} alt="" /> : <Video />}<strong>{media.title}</strong><small>{media.provider}</small></a>)}</div>{!draft.referenceMedia?.length && !draft.stockMedia?.length && <p className="mag-empty-inline">لا توجد مراجع خارجية محفوظة لهذه البطاقة.</p>}</section>
    </div>
  );
};

const DraftCard: React.FC<{
  draft: MagazineDraft;
  canWrite: boolean;
  onDetails: () => void;
  onSave: () => void;
  onDelete: () => void;
  onTransfer: () => void;
}> = ({ draft, canWrite, onDetails, onSave, onDelete, onTransfer }) => {
  const thumbnail = draftThumbnail(draft);
  return (
    <article
      className="mag-result-card"
      draggable={canWrite}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-ayrovi-magazine-draft', draft.id);
        event.dataTransfer.setData('text/plain', draft.id);
        document.body.classList.add('is-dragging-magazine-card');
      }}
      onDragEnd={() => document.body.classList.remove('is-dragging-magazine-card')}
    >
      <button type="button" className="mag-card-main" onClick={onDetails}>
        <div className="mag-card-media">{thumbnail ? <img src={thumbnail} alt="" /> : <span><FileText /></span>}<b>{TYPE_LABELS[draft.content_type]}</b></div>
        <div className="mag-card-copy"><div><span className={`mag-status is-${draft.status}`}>{draft.status === 'draft' ? 'مسودة محفوظة' : draft.status === 'scheduled' ? 'مجدولة' : draft.status}</span><small>{formatDate(draft.created_at)}</small></div><h3>{draft.title}</h3><p>{draft.summary}</p>{draft.product && <em>مرتبط: {draft.product.brand} {draft.product.name}</em>}</div>
      </button>
      <footer>
        <button type="button" disabled={!canWrite} onClick={onSave}><Bookmark />حفظ كمسودة</button>
        <button type="button" disabled={!canWrite} onClick={onTransfer}><ArrowUp />نقل إلى مجلتي</button>
        <button type="button" className="is-danger" disabled={!canWrite} onClick={onDelete} aria-label="حذف"><Trash2 /></button>
      </footer>
    </article>
  );
};

export const MagazineAgentPage: React.FC<MagazineAgentPageProps> = ({ canWrite, onOpenMagazine }) => {
  const [command, setCommand] = useState('');
  const [messages, setMessages] = useState<ChatLine[]>([{ role: 'assistant', text: 'أرسل أمرًا بالعربية. سأبحث عن اتجاه حديث، وأنتج بطاقات مقالة ومنشور وستوري وريلز، ثم أحفظها تلقائيًا كمسودات.' }]);
  const [drafts, setDrafts] = useState<MagazineDraft[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selected, setSelected] = useState<MagazineDraft | null>(null);
  const [toast, setToast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const conversationId = useRef(getConversationId());
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [draftResult, statusResult] = await Promise.all([
        adminApi<any>('/magazine-drafts?limit=120'), adminApi<any>('/magazine-agent/status'),
      ]);
      setDrafts(draftResult.data || []); setStatus(statusResult.data || null);
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, progress.current]);

  const groupedDrafts = useMemo(() => drafts, [drafts]);

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = command.trim();
    if (!text || busy || !canWrite) return;
    const total = batchCount(text);
    const batchId = `mag_batch_${crypto.randomUUID()}`;
    const previousTopics: string[] = [];
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: 'user', text }]);
    setCommand(''); setBusy(true); setProgress({ current: 0, total });
    let created = 0;
    try {
      for (let index = 1; index <= total; index += 1) {
        const result = await adminApi<any>('/magazine-agent/generate', {
          method: 'POST',
          body: JSON.stringify({ command: text, conversationId: conversationId.current, batchId, batchIndex: index, batchTotal: total, previousTopics, history }),
        });
        if (result.data?.needsClarification) {
          const suggestions = (result.data.suggestions || []).map((product: any) => `${product.brand} ${product.name}`).join('، ');
          setMessages((current) => [...current, { role: 'assistant', text: `${result.data.clarification}${suggestions ? ` المقترحات: ${suggestions}` : ''}` }]);
          break;
        }
        const newDrafts: MagazineDraft[] = result.data?.drafts || [];
        if (result.data?.output?.topic) previousTopics.push(result.data.output.topic);
        setDrafts((current) => [...newDrafts, ...current.filter((item) => !newDrafts.some((next) => next.id === item.id))]);
        created += newDrafts.length;
        setProgress({ current: index, total });
      }
      if (created) setMessages((current) => [...current, { role: 'assistant', text: `اكتمل التوليد: حُفظت ${created} بطاقات تلقائيًا كمسودات. راجعها أو اسحب أي بطاقة إلى تبويب «مجلتي».` }]);
      await adminApi<any>('/magazine-agent/status').then((result) => setStatus(result.data));
    } catch (error: any) {
      setMessages((current) => [...current, { role: 'assistant', text: created ? `توقف التوليد بعد حفظ ${created} بطاقات. النتائج المكتملة محفوظة ويمكن متابعة المحاولة.` : `تعذر التوليد: ${error.message}` }]);
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const saveDraft = async (draft: MagazineDraft) => {
    try {
      const result = await adminApi<any>(`/magazine-drafts/${draft.id}/save`, { method: 'PUT', body: '{}' });
      setDrafts((current) => current.map((item) => item.id === draft.id ? result.data : item));
      setToast({ message: 'المسودة محفوظة في قاعدة البيانات.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
  };

  const deleteDraft = async (draft: MagazineDraft) => {
    if (!window.confirm(`حذف «${draft.title}» نهائيًا من مسودات الوكيل؟`)) return;
    try {
      await adminApi(`/magazine-drafts/${draft.id}`, { method: 'DELETE' });
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
      if (selected?.id === draft.id) setSelected(null);
      setToast({ message: 'حُذفت المسودة.', tone: 'success' });
    } catch (error: any) { setToast({ message: error.message, tone: 'error' }); }
  };

  return (
    <div className="mag-agent" dir="rtl">
      <AgentHeader status={status} onRefresh={() => void load()} />
      <div className="mag-agent-layout">
        <section className="mag-chat-panel" aria-label="محادثة وكيل مجلتي">
          <header><div><MessageSquare /><span><strong>المحرر الذكي</strong><small>محادثة داخلية ومحمية بصلاحيات الأدمين</small></span></div><i>{busy ? 'يعمل الآن' : 'جاهز'}</i></header>
          <div className="mag-chat-messages" aria-live="polite">
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`mag-chat-message is-${message.role}`}><span>{message.role === 'assistant' ? <Sparkles /> : 'أنت'}</span><p>{message.text}</p></div>)}
            {busy && <div className="mag-chat-progress"><div><Loader2 /><strong>توليد وحفظ البطاقات</strong><span>{progress.current} / {progress.total}</span></div><i><em style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 4}%` }} /></i><small>تظهر النتائج تباعًا في منطقة البطاقات، ولا تُنشر تلقائيًا.</small></div>}
            <div ref={chatEnd} />
          </div>
          <form className="mag-chat-composer" onSubmit={generate}>
            <label htmlFor="mag-agent-command">أمر المحرر</label>
            <textarea id="mag-agent-command" value={command} onChange={(event) => setCommand(event.target.value.slice(0, 1200))} disabled={busy || !canWrite} rows={4} placeholder="مثال: اليوم ولّد 10 مقالات شتوية، أو ولّد ريلز لاسم منتج موجود في قاعدة البيانات" />
            <div><small>{command.length} / 1200 · الحد الأقصى 10 أفكار في الدفعة</small><button type="submit" disabled={!command.trim() || busy || !canWrite}>{busy ? <Loader2 /> : <ArrowUp />}إرسال</button></div>
          </form>
          <aside className="mag-rights-note"><CheckCircle2 /><p><strong>مراجعة بشرية إلزامية</strong><span>الصور العامة مرجعية فقط. علامة «مرخص للنشر» تظهر فقط لمقاطع Pexels/Pixabay التي أعادها مزود API.</span></p></aside>
        </section>

        <section className="mag-results-panel" aria-label="نتائج وكيل مجلتي">
          <header><div><p>المسودات المحفوظة</p><h2>بطاقات المحتوى</h2></div><span>{loading ? '…' : groupedDrafts.length}</span></header>
          <div className="mag-drop-hint"><ArrowUp /><span>اسحب أي بطاقة إلى تبويب <strong>«مجلتي»</strong> في القائمة، أو استخدم زر النقل.</span></div>
          <div className="mag-results-list">
            {groupedDrafts.map((draft) => <DraftCard key={draft.id} draft={draft} canWrite={canWrite} onDetails={() => setSelected(draft)} onSave={() => void saveDraft(draft)} onDelete={() => void deleteDraft(draft)} onTransfer={() => onOpenMagazine(draft.id)} />)}
            {!loading && !groupedDrafts.length && <div className="mag-empty"><Sparkles /><h3>لا توجد مسودات بعد</h3><p>أرسل أول أمر ليظهر المحتوى هنا كبطاقات محفوظة.</p></div>}
          </div>
        </section>
      </div>
      <Modal open={Boolean(selected)} title={selected?.title || 'تفاصيل المسودة'} onClose={() => setSelected(null)} wide footer={selected ? <><Button variant="ghost" onClick={() => setSelected(null)}>إغلاق</Button><Button onClick={() => onOpenMagazine(selected.id)}><ArrowUp />نقل إلى مجلتي</Button></> : undefined}>{selected && <DraftDetails draft={selected} />}</Modal>
      {toast && <Toast {...toast} />}
    </div>
  );
};

export type { MagazineDraft };
