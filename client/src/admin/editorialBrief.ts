export type EditorialBriefDraft = {
  content_type: 'editorial' | 'publication' | 'story' | 'reel';
  title: string;
  summary: string;
  content: {
    language?: string; tone?: string; angle?: string;
    publication?: { caption?: string; media_suggestion?: string };
    story?: { hook?: string; frames?: { text?: string; visual?: string }[]; cta?: string };
    reel?: { hook?: string; duration_seconds?: number; scenes?: { seconds?: number; text?: string; stock_query?: string }[]; cta?: string };
  } | null;
};

const TYPES = { editorial: 'مقالة', publication: 'منشور', story: 'ستوري', reel: 'ريلز' };
const text = (value: unknown, limit = 1200) => typeof value === 'string'
  ? value.replace(/https?:\/\/[^\s]+/gi, '[رابط مستبعد]').trim().slice(0, limit) : '';

/** Plain-text, local handoff. Do not serialize arbitrary draft objects, source media or internal identifiers. */
export function buildEditorialBrief(draft: EditorialBriefDraft): string {
  const content = draft.content ?? {};
  const lines = [
    'ZAYROVI — موجز إنتاج، مسودة للمراجعة',
    `العنوان: ${text(draft.title, 250)}`, `النوع: ${TYPES[draft.content_type]}`,
    `الملخّص: ${text(draft.summary)}`, `اللغة: ${text(content.language, 50)}`, `النبرة: ${text(content.tone, 120)}`,
    `الزاوية: ${text(content.angle)}`,
  ];
  if (draft.content_type === 'publication' && content.publication) {
    lines.push(`النص المقترح: ${text(content.publication.caption)}`, `الصورة المقترحة: ${text(content.publication.media_suggestion)}`);
  }
  if (draft.content_type === 'story' && content.story) {
    lines.push(`البداية: ${text(content.story.hook)}`);
    const frames = Array.isArray(content.story.frames) ? content.story.frames : [];
    frames.slice(0, 20).forEach((frame, i) => lines.push(`${i + 1}. ${text(frame?.text)} — ${text(frame?.visual)}`));
    lines.push(`الدعوة للفعل: ${text(content.story.cta)}`);
  }
  if (draft.content_type === 'reel' && content.reel) {
    const reel = content.reel;
    lines.push(`البداية: ${text(reel.hook)}`);
    if (Number.isFinite(reel.duration_seconds)) lines.push(`المدّة المقترحة: ${reel.duration_seconds} ثانية`);
    const scenes = Array.isArray(reel.scenes) ? reel.scenes : [];
    scenes.slice(0, 20).forEach((scene, i) => lines.push(`${i + 1}. ${Number.isFinite(scene?.seconds) ? `[${scene.seconds} ث] ` : ''}${text(scene?.text)} — ${text(scene?.stock_query)}`));
    lines.push(`الدعوة للفعل: ${text(reel.cta)}`);
  }
  return [...lines, '', 'قبل النشر: راجع النص والمعلومات وحقوق الصور والفيديو والموسيقى؛ نزّل الملف النهائي ثم أضفه لمسودة في ZAYROVI للمراجعة.', 'لا ترسل المعطيات الشخصية ولا المحتوى السرّي إلى أدوات خارجية.', ''].join('\n');
}

export function downloadEditorialBrief(draft: EditorialBriefDraft) {
  const url = URL.createObjectURL(new Blob([buildEditorialBrief(draft)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `zayrovi-${draft.content_type}-brief.txt`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
