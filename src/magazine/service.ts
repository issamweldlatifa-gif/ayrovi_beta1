import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { MAGAZINE_AGENT_SYSTEM_PROMPT } from './prompt';

export type MagazineContentType = 'editorial' | 'publication' | 'story' | 'reel';
export type MagazineDraftStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface MagazineProductContext {
  requested: boolean;
  matched: boolean;
  products: Array<{
    id: string;
    name: string;
    brand: string;
    description: string;
    image: string;
    images: string[];
    url: string;
    price: number;
    currency: string;
    finalPriceTnd: number;
  }>;
}

interface EditorialOutput {
  title: string;
  hook: string;
  sections: Array<{ heading: string; text: string }>;
  conclusion: string;
  shop_the_look: string[];
}

interface PublicationOutput {
  caption: string;
  hashtags: string[];
  media_suggestion: string;
}

interface StoryOutput {
  hook: string;
  frames: Array<{ order: number; text: string; visual: string }>;
  interaction: string;
  cta: string;
}

interface ReelOutput {
  hook: string;
  scenes: Array<{ order: number; seconds: string; text: string; stock_query: string }>;
  cta: string;
  duration_seconds: number;
}

export interface MagazineAgentOutput {
  topic: string;
  angle: string;
  audience: string;
  language: string;
  tone: string;
  summary: string;
  product_id: string | null;
  editorial: EditorialOutput;
  publication: PublicationOutput;
  story: StoryOutput;
  reel: ReelOutput;
  visual_query: string;
  source_notes: string[];
}

export interface ReferenceMedia {
  title: string;
  url: string;
  thumbnailUrl: string;
  source: string;
  license: 'reference';
}

export interface StockMedia {
  title: string;
  url: string;
  previewUrl: string;
  videoUrl: string;
  provider: 'Pexels' | 'Pixabay';
  license: 'licensed' | 'licensed-source';
  publicationReady: boolean;
  scene: string;
}

export interface GenerateMagazineInput {
  command: string;
  conversationId: string;
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  previousTopics?: string[];
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  adminId: string;
}

export interface GenerateMagazineResult {
  model: string;
  batchId: string;
  output?: MagazineAgentOutput;
  drafts: any[];
  needsClarification: boolean;
  clarification?: string;
  suggestions?: MagazineProductContext['products'];
}

export class MagazineAgentUnavailableError extends Error {
  readonly code = 'MAGAZINE_AGENT_UNAVAILABLE';
}

export class MagazineAgentProviderError extends Error {
  readonly code = 'MAGAZINE_AGENT_PROVIDER_ERROR';
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string', minLength: 3, maxLength: 180 },
    angle: { type: 'string', minLength: 3, maxLength: 240 },
    audience: { type: 'string', minLength: 2, maxLength: 160 },
    language: { type: 'string', minLength: 2, maxLength: 80 },
    tone: { type: 'string', minLength: 2, maxLength: 120 },
    summary: { type: 'string', minLength: 10, maxLength: 500 },
    product_id: { type: ['string', 'null'], maxLength: 120 },
    editorial: {
      type: 'object', additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 3, maxLength: 220 },
        hook: { type: 'string', minLength: 10, maxLength: 1500 },
        sections: {
          type: 'array', minItems: 3, maxItems: 4,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              heading: { type: 'string', minLength: 2, maxLength: 180 },
              text: { type: 'string', minLength: 80, maxLength: 5000 },
            },
            required: ['heading', 'text'],
          },
        },
        conclusion: { type: 'string', minLength: 20, maxLength: 1800 },
        shop_the_look: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 180 } },
      },
      required: ['title', 'hook', 'sections', 'conclusion', 'shop_the_look'],
    },
    publication: {
      type: 'object', additionalProperties: false,
      properties: {
        caption: { type: 'string', minLength: 10, maxLength: 1200 },
        hashtags: { type: 'array', minItems: 5, maxItems: 8, items: { type: 'string', maxLength: 80 } },
        media_suggestion: { type: 'string', minLength: 5, maxLength: 500 },
      },
      required: ['caption', 'hashtags', 'media_suggestion'],
    },
    story: {
      type: 'object', additionalProperties: false,
      properties: {
        hook: { type: 'string', minLength: 3, maxLength: 280 },
        frames: {
          type: 'array', minItems: 3, maxItems: 4,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              order: { type: 'integer', minimum: 1, maximum: 4 },
              text: { type: 'string', minLength: 2, maxLength: 500 },
              visual: { type: 'string', minLength: 2, maxLength: 500 },
            },
            required: ['order', 'text', 'visual'],
          },
        },
        interaction: { type: 'string', minLength: 2, maxLength: 300 },
        cta: { type: 'string', minLength: 2, maxLength: 220 },
      },
      required: ['hook', 'frames', 'interaction', 'cta'],
    },
    reel: {
      type: 'object', additionalProperties: false,
      properties: {
        hook: { type: 'string', minLength: 3, maxLength: 280 },
        scenes: {
          type: 'array', minItems: 3, maxItems: 4,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              order: { type: 'integer', minimum: 1, maximum: 4 },
              seconds: { type: 'string', minLength: 1, maxLength: 40 },
              text: { type: 'string', minLength: 2, maxLength: 500 },
              stock_query: { type: 'string', minLength: 2, maxLength: 220 },
            },
            required: ['order', 'seconds', 'text', 'stock_query'],
          },
        },
        cta: { type: 'string', minLength: 2, maxLength: 220 },
        duration_seconds: { type: 'integer', minimum: 10, maximum: 60 },
      },
      required: ['hook', 'scenes', 'cta', 'duration_seconds'],
    },
    visual_query: { type: 'string', minLength: 3, maxLength: 240 },
    source_notes: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 500 } },
  },
  required: ['topic', 'angle', 'audience', 'language', 'tone', 'summary', 'product_id', 'editorial', 'publication', 'story', 'reel', 'visual_query', 'source_notes'],
} as const;

const ARABIC_NUMBERS: Record<string, number> = {
  واحد: 1, واحدة: 1, اثنان: 2, اثنين: 2, اثنتان: 2, اثنتين: 2,
  ثلاثة: 3, ثلاث: 3, أربعة: 4, اربع: 4, أربع: 4, خمسة: 5, خمس: 5,
  ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثمان: 8,
  تسعة: 9, تسع: 9, عشرة: 10, عشر: 10,
};

export function parseMagazineBatchCount(value: unknown): number {
  const text = cleanText(value, 1200).toLowerCase();
  const digit = text.match(/(?:^|\s)(\d{1,2})(?=\s|$|\D)/)?.[1];
  if (digit) return Math.max(1, Math.min(10, Number(digit)));
  for (const [word, count] of Object.entries(ARABIC_NUMBERS)) {
    if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`, 'u').test(text)) return count;
  }
  const latin = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/)?.[1];
  if (latin) return ['one','two','three','four','five','six','seven','eight','nine','ten'].indexOf(latin) + 1;
  return 1;
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 1000)).filter(Boolean).slice(0, 20);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => cleanText(item, 1000)).filter(Boolean).slice(0, 20) : [];
  } catch { return []; }
}

function publicUrl(value: unknown, allowedHosts?: string[]): string {
  const raw = cleanText(value, 2000);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')
      || /^(?:127|10|0|169\.254|192\.0\.0|192\.0\.2|198\.1[89]|198\.51\.100|203\.0\.113|22[4-9]|23\d|24\d|25[0-5])\./.test(host)
      || /^192\.168\./.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
      || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return '';
    if (allowedHosts && !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return '';
    url.hash = '';
    return url.toString();
  } catch { return ''; }
}

const TOKEN_STOP = new Set([
  'اليوم','غدا','مقال','مقالات','ريل','ريلز','ستوري','منشور','اكتب','كتابة','ولد','ولّد','انشئ','أنشئ','عن','في','من','على','هذا','هذه','الجديد','الجديدة',
  'article','articles','reel','reels','story','post','create','generate','new','pour','avec','dans','une','des','les','le','la','de','du','sur',
]);
const TOKEN_ALIASES: Record<string, string> = {
  حذاء: 'shoe', احذية: 'shoe', أحذية: 'shoe', chaussure: 'shoe', chaussures: 'shoe', sneaker: 'shoe', sneakers: 'shoe',
  فستان: 'dress', فساتين: 'dress', robe: 'dress', robes: 'dress', حقيبة: 'bag', حقائب: 'bag', sac: 'bag', sacs: 'bag',
  جاكيت: 'jacket', سترة: 'jacket', veste: 'jacket', عطر: 'perfume', parfum: 'perfume', ساعة: 'watch', montre: 'watch',
  نايك: 'nike', أديداس: 'adidas', اديداس: 'adidas', زارا: 'zara', شيان: 'shein',
};

function tokens(value: string): string[] {
  return value.toLocaleLowerCase('ar').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1 && !TOKEN_STOP.has(token))
    .map((token) => TOKEN_ALIASES[token] || token);
}

function productSpecificRequest(command: string, rows: any[]): boolean {
  const text = command.toLocaleLowerCase('ar');
  const productNoun = /منتج|قطعة|حذاء|حذاءً|فستان|حقيبة|جاكيت|قميص|بنطلون|عطر|ساعة|shoe|sneaker|dress|bag|jacket|product|produit|chaussure|robe|sac/i.test(text);
  const brandWords = new Set(rows.flatMap((row) => tokens(`${row.brand_name || ''} ${row.name || ''}`)).filter((word) => word.length >= 3));
  ['nike','نايك','adidas','أديداس','zara','زارا','shein','شيان','prada','dior','chanel','temu','amazon'].forEach((word) => brandWords.add(word));
  const mentionsBrand = [...brandWords].some((word) => text.includes(word));
  const productCode = /\b(?:sku|ean|upc|id)[:#\s-]*[a-z0-9-]{4,}\b/i.test(text);
  return productCode || (productNoun && mentionsBrand);
}

export function findMagazineProductContext(db: QatafoDatabase, command: string): MagazineProductContext {
  const rows = db.all<any>(`SELECT id,name,brand_name,category,description,image,additional_images,source_url,original_price,currency,final_price
    FROM products WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT 300`);
  const queryTokens = tokens(command);
  const scored = rows.map((row) => {
    const candidate = new Set(tokens(`${row.brand_name || ''} ${row.name || ''} ${row.category || ''}`));
    const overlap = queryTokens.filter((token) => candidate.has(token)).length;
    const phrase = `${row.brand_name || ''} ${row.name || ''}`.trim().toLocaleLowerCase('ar');
    const exactBonus = phrase && command.toLocaleLowerCase('ar').includes(phrase) ? 4 : 0;
    return { row, score: overlap + exactBonus };
  }).sort((a, b) => b.score - a.score);
  const requested = productSpecificRequest(command, rows);
  // ذكر العلامة وحده لا يكفي لربط محتوى بمنتج عشوائي. نطلب تقاطعًا
  // ثانيًا (نوع/اسم/فئة) أو اسمًا مطابقًا، ونعتبر التعادل غامضًا.
  const selected = scored.filter((item) => item.score >= 2).slice(0, 5);
  const unambiguous = selected.length === 1 || (selected.length > 1 && selected[0].score > selected[1].score);
  const products = (selected.length ? selected : requested ? scored.slice(0, 5) : []).map(({ row }) => ({
    id: cleanText(row.id, 120),
    name: cleanText(row.name, 220),
    brand: cleanText(row.brand_name, 160),
    description: cleanText(row.description, 1000),
    image: publicUrl(row.image) || (String(row.image || '').startsWith('/') ? cleanText(row.image, 1000) : ''),
    images: parseJsonArray(row.additional_images).filter((image) => Boolean(publicUrl(image) || image.startsWith('/'))),
    url: publicUrl(row.source_url),
    price: Number(row.original_price) || 0,
    currency: cleanText(row.currency, 8),
    finalPriceTnd: Number(row.final_price) || 0,
  }));
  return { requested, matched: !requested || unambiguous, products };
}

function extractWebReferences(payload: any): ReferenceMedia[] {
  const output: ReferenceMedia[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'web_search_result') {
      const url = publicUrl(node.url);
      if (url) output.push({
        title: cleanText(node.title || 'مصدر مرجعي', 220), url, thumbnailUrl: '',
        source: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Web Search'; } })(),
        license: 'reference',
      });
    }
    if (Array.isArray(node)) node.forEach(visit);
    else Object.values(node).forEach(visit);
  };
  visit(payload?.content);
  return dedupeByUrl(output).slice(0, 6);
}

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => item.url && !seen.has(item.url) && Boolean(seen.add(item.url)));
}

function agentTextBlocks(payload: any): string[] {
  return (Array.isArray(payload?.content) ? payload.content : [])
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => String(block.text || '').trim())
    .filter(Boolean);
}

function balancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parseAgentText(payload: any): MagazineAgentOutput {
  const blocks = agentTextBlocks(payload);
  if (!blocks.length) throw new MagazineAgentProviderError('لم يُرجع محرك التحرير محتوى صالحًا.');
  // Web Search قد ينتج فقرة تمهيدية في text block مستقل قبل كائن JSON.
  // نجرب آخر block أولًا، ثم النص المجمّع، ثم كل كائن متوازن داخلهما.
  const combined = blocks.join('\n');
  const candidates = [
    ...blocks.slice().reverse(),
    combined,
    ...balancedJsonObjects(combined).reverse(),
  ];
  for (const candidate of candidates) {
    const clean = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as MagazineAgentOutput;
    } catch { /* Try the next complete JSON candidate. */ }
  }
  throw new MagazineAgentProviderError('تعذر قراءة بنية المحتوى المولّد.');
}

async function repairMagazineOutput(
  key: string,
  model: string,
  requestContext: Record<string, any>,
  malformedPayload: any,
): Promise<any> {
  const rawText = agentTextBlocks(malformedPayload).join('\n').slice(0, 24_000);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(58_000),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 5200,
      temperature: 0.2,
      system: `${MAGAZINE_AGENT_SYSTEM_PROMPT}\nهذه جولة إصلاح بنيوي. أعد النتيجة كاملة ككائن JSON مطابق للمخطط فقط، دون مقدمة أو Markdown.`,
      messages: [{
        role: 'user',
        content: `سياق أمر المحرر:\n${JSON.stringify(requestContext)}\n\nالرد غير الصالح المراد إصلاحه:\n${rawText || '(لا يوجد نص مكتمل؛ أعد التوليد من السياق)'}`,
      }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.warn(`[Magazine Agent] repair HTTP ${response.status} ${detail.slice(0, 180)}`);
    throw new MagazineAgentProviderError('تعذر إصلاح بنية المحتوى المولّد تلقائيًا.');
  }
  return response.json();
}

function normalizeOutput(raw: MagazineAgentOutput, products: MagazineProductContext['products']): MagazineAgentOutput {
  const productIds = new Set(products.map((product) => product.id));
  const sections = Array.isArray(raw?.editorial?.sections) ? raw.editorial.sections.slice(0, 4).map((section) => ({
    heading: cleanText(section?.heading, 180), text: cleanMultiline(section?.text, 5000),
  })).filter((section) => section.heading && section.text) : [];
  const frames = Array.isArray(raw?.story?.frames) ? raw.story.frames.slice(0, 4).map((frame, index) => ({
    order: index + 1, text: cleanText(frame?.text, 500), visual: cleanText(frame?.visual, 500),
  })).filter((frame) => frame.text && frame.visual) : [];
  const scenes = Array.isArray(raw?.reel?.scenes) ? raw.reel.scenes.slice(0, 4).map((scene, index) => ({
    order: index + 1, seconds: cleanText(scene?.seconds, 40), text: cleanText(scene?.text, 500), stock_query: cleanText(scene?.stock_query, 220),
  })).filter((scene) => scene.text && scene.stock_query) : [];
  if (sections.length < 3 || frames.length < 3 || scenes.length < 3) throw new MagazineAgentProviderError('المحتوى المولّد ناقص ويحتاج إعادة المحاولة.');
  const productId = cleanText(raw?.product_id, 120);
  const resolvedProductId = productId && productIds.has(productId) ? productId : products.length === 1 ? products[0].id : null;
  return {
    topic: cleanText(raw?.topic, 180), angle: cleanText(raw?.angle, 240), audience: cleanText(raw?.audience, 160),
    language: cleanText(raw?.language, 80), tone: cleanText(raw?.tone, 120), summary: cleanText(raw?.summary, 500),
    product_id: resolvedProductId,
    editorial: {
      title: cleanText(raw?.editorial?.title, 220), hook: cleanMultiline(raw?.editorial?.hook, 1500), sections,
      conclusion: cleanMultiline(raw?.editorial?.conclusion, 1800),
      shop_the_look: Array.isArray(raw?.editorial?.shop_the_look) ? raw.editorial.shop_the_look.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 8) : [],
    },
    publication: {
      caption: cleanMultiline(raw?.publication?.caption, 1200),
      hashtags: Array.isArray(raw?.publication?.hashtags) ? raw.publication.hashtags.map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 8) : [],
      media_suggestion: cleanText(raw?.publication?.media_suggestion, 500),
    },
    story: { hook: cleanText(raw?.story?.hook, 280), frames, interaction: cleanText(raw?.story?.interaction, 300), cta: cleanText(raw?.story?.cta, 220) },
    reel: { hook: cleanText(raw?.reel?.hook, 280), scenes, cta: cleanText(raw?.reel?.cta, 220), duration_seconds: Math.max(10, Math.min(60, Math.round(Number(raw?.reel?.duration_seconds) || 20))) },
    visual_query: cleanText(raw?.visual_query, 240),
    source_notes: Array.isArray(raw?.source_notes) ? raw.source_notes.map((note) => cleanText(note, 500)).filter(Boolean).slice(0, 8) : [],
  };
}

function anthropicModel(): string {
  return cleanText(process.env.MAGAZINE_AGENT_MODEL || process.env.ASSISTANT_SONNET_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929', 120);
}

async function generateWithAnthropic(input: GenerateMagazineInput, products: MagazineProductContext): Promise<{ output: MagazineAgentOutput; model: string; webReferences: ReferenceMedia[] }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new MagazineAgentUnavailableError('مفتاح Anthropic غير مضبوط على الخادم.');
  const model = anthropicModel();
  const safeHistory = (input.history || []).filter((line) => line && ['user','assistant'].includes(line.role))
    .slice(-8).map((line) => ({ role: line.role, content: cleanText(line.text, 1000) }));
  const batchTotal = Math.max(1, Math.min(10, Number(input.batchTotal) || 1));
  const batchIndex = Math.max(1, Math.min(batchTotal, Number(input.batchIndex) || 1));
  const previousTopics = (input.previousTopics || []).map((topic) => cleanText(topic, 180)).filter(Boolean).slice(-20);
  const requestContext = {
    editor_command: cleanText(input.command, 1200),
    batch: { index: batchIndex, total: batchTotal },
    previous_topics: previousTopics,
    readonly_catalog_matches: products.products,
    product_was_explicitly_requested: products.requested,
  };
  const messages: any[] = [
    ...safeHistory,
    { role: 'user', content: `نفّذ أمر المحرر وفق النظام وأعد قطعة رقم ${batchIndex} من ${batchTotal}. استخدم Web Search للتحقق من اتجاه حديث ومصادر مرجعية.\n${JSON.stringify(requestContext)}` },
  ];
  let payload: any = null;
  try {
    const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    const requestBody: Record<string, any> = {
      model,
      max_tokens: 5200,
      temperature: 0.45,
      system: MAGAZINE_AGENT_SYSTEM_PROMPT,
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    };
    let response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(58_000), headers, body: JSON.stringify(requestBody),
    });
    // بعض إصدارات Anthropic قد ترفض الجمع بين Structured Outputs وأداة
    // Web Search. نعيد المحاولة مرة واحدة مع إلزام JSON داخل الـprompt، مع
    // إبقاء Tool Use فعّالًا بدل تعطيل البحث أو حفظ نتيجة ناقصة.
    if (response.status === 400) {
      const firstDetail = await response.text().catch(() => '');
      if (/output_config|json_schema|structured|tool|web.search/i.test(firstDetail)) {
        console.warn(`[Magazine Agent] structured-web fallback: ${firstDetail.slice(0, 180)}`);
        const fallbackBody = { ...requestBody };
        delete fallbackBody.output_config;
        fallbackBody.system = `${MAGAZINE_AGENT_SYSTEM_PROMPT}\nأعد كائن JSON صالحًا مطابقًا حرفيًا للبنية المطلوبة في الطلب، من دون fences أو شرح خارجي.`;
        fallbackBody.messages = [...messages.slice(0, -1), {
          role: 'user',
          content: `${messages.at(-1)?.content}\nJSON Schema المطلوب:\n${JSON.stringify(OUTPUT_SCHEMA)}`,
        }];
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(58_000), headers, body: JSON.stringify(fallbackBody),
        });
      } else {
        console.warn(`[Magazine Agent] Anthropic HTTP 400 ${firstDetail.slice(0, 240)}`);
        throw new MagazineAgentProviderError('رفض محرك التحرير صيغة الطلب.');
      }
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[Magazine Agent] Anthropic HTTP ${response.status} ${detail.slice(0, 240)}`);
      if ([401, 403].includes(response.status)) throw new MagazineAgentUnavailableError('مصادقة Anthropic غير صالحة.');
      if (response.status === 429) throw new MagazineAgentProviderError('تم بلوغ حد Anthropic مؤقتًا. أعد المحاولة لاحقًا.');
      throw new MagazineAgentProviderError(`تعذر التوليد عبر Anthropic (HTTP ${response.status}).`);
    }
    payload = await response.json();
  } catch (error: any) {
    if (error instanceof MagazineAgentUnavailableError || error instanceof MagazineAgentProviderError) throw error;
    throw new MagazineAgentProviderError(error?.name === 'TimeoutError' ? 'انتهت مهلة توليد المحتوى.' : 'تعذر الاتصال بمحرك التحرير.');
  }
  const webReferences = extractWebReferences(payload);
  let output: MagazineAgentOutput;
  try {
    output = normalizeOutput(parseAgentText(payload), products.products);
  } catch (error) {
    if (!(error instanceof MagazineAgentProviderError)) throw error;
    console.warn(`[Magazine Agent] invalid structured response; stop=${String(payload?.stop_reason || 'unknown')} blocks=${(payload?.content || []).map((block: any) => block?.type).join(',')}`);
    const repaired = await repairMagazineOutput(key, model, requestContext, payload);
    output = normalizeOutput(parseAgentText(repaired), products.products);
  }
  return { output, model, webReferences };
}

async function searchReferenceImages(query: string): Promise<ReferenceMedia[]> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key || !query) return [];
  try {
    const params = new URLSearchParams({ engine: 'google_images', q: query.slice(0, 220), safe: 'active', api_key: key, hl: 'en' });
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const payload: any = await response.json();
    return dedupeByUrl((Array.isArray(payload?.images_results) ? payload.images_results : []).map((item: any) => {
      const sourceUrl = publicUrl(item?.link || item?.source || item?.original);
      const thumbnailUrl = publicUrl(item?.thumbnail || item?.original);
      if (!sourceUrl || !thumbnailUrl) return null;
      return {
        title: cleanText(item?.title || query, 220), url: sourceUrl, thumbnailUrl,
        source: cleanText(item?.source || (() => { try { return new URL(sourceUrl).hostname; } catch { return 'Google Images'; } })(), 120),
        license: 'reference' as const,
      };
    }).filter(Boolean) as ReferenceMedia[]).slice(0, 3);
  } catch { return []; }
}

function bestPexelsFile(files: any[]): string {
  const safe = (Array.isArray(files) ? files : []).map((file) => ({
    url: publicUrl(file?.link, ['pexels.com', 'pexelsvideos.com']), width: Number(file?.width) || 0, height: Number(file?.height) || 0,
  })).filter((file) => file.url);
  return (safe.sort((a, b) => {
    const aPortrait = a.height >= a.width ? 1 : 0; const bPortrait = b.height >= b.width ? 1 : 0;
    return bPortrait - aPortrait || Math.abs(720 - a.width) - Math.abs(720 - b.width);
  })[0]?.url) || '';
}

async function searchPexelsVideos(query: string, scene: string): Promise<StockMedia[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  try {
    const params = new URLSearchParams({ query: query.slice(0, 180), per_page: '4', orientation: 'portrait', size: 'medium' });
    const response = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      signal: AbortSignal.timeout(10_000), headers: { Authorization: key },
    });
    if (!response.ok) return [];
    const payload: any = await response.json();
    return (Array.isArray(payload?.videos) ? payload.videos : []).map((video: any) => {
      const url = publicUrl(video?.url, ['pexels.com']);
      const videoUrl = bestPexelsFile(video?.video_files);
      if (!url || !videoUrl) return null;
      return {
        title: cleanText(video?.user?.name ? `${query} — ${video.user.name}` : query, 220), url,
        previewUrl: publicUrl(video?.image, ['pexels.com', 'pexelsvideos.com']), videoUrl,
        provider: 'Pexels' as const, license: 'licensed' as const, publicationReady: true, scene,
      };
    }).filter(Boolean).slice(0, 3) as StockMedia[];
  } catch { return []; }
}

function bestPixabayFile(videos: any): string {
  for (const key of ['medium','small','large','tiny']) {
    const url = publicUrl(videos?.[key]?.url, ['pixabay.com', 'pixabay.vimeocdn.com', 'vimeocdn.com']);
    if (url) return url;
  }
  return '';
}

async function searchPixabayVideos(query: string, scene: string): Promise<StockMedia[]> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return [];
  try {
    const params = new URLSearchParams({ key, q: query.slice(0, 180), per_page: '4', safesearch: 'true', video_type: 'film' });
    const response = await fetch(`https://pixabay.com/api/videos/?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const payload: any = await response.json();
    return (Array.isArray(payload?.hits) ? payload.hits : []).map((video: any) => {
      const url = publicUrl(video?.pageURL, ['pixabay.com']);
      const videoUrl = bestPixabayFile(video?.videos);
      if (!url || !videoUrl) return null;
      return {
        title: cleanText(video?.tags || query, 220), url, previewUrl: publicUrl(video?.userImageURL), videoUrl,
        provider: 'Pixabay' as const, license: 'licensed' as const, publicationReady: true, scene,
      };
    }).filter(Boolean).slice(0, 3) as StockMedia[];
  } catch { return []; }
}

async function searchStockLibrariesWithAnthropic(scenes: ReelOutput['scenes']): Promise<StockMedia[]> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || !scenes.length) return [];
  try {
    const queryList = scenes.slice(0, 3).map((scene, index) => `${index + 1}. ${scene.stock_query || scene.text}`).join('\n');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(12_000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cleanText(process.env.ASSISTANT_HAIKU_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', 120),
        max_tokens: 280,
        temperature: 0,
        system: 'Search only for real stock-video pages on pexels.com/video or pixabay.com/videos. Run web search and keep the answer concise. Never invent a URL.',
        messages: [{ role: 'user', content: `Find portrait stock-video pages matching these scenes:\n${queryList}` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      }),
    });
    if (!response.ok) return [];
    const payload: any = await response.json();
    const results: StockMedia[] = [];
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'web_search_result') {
        const url = publicUrl(node.url, ['pexels.com', 'pixabay.com']);
        if (url) {
          const host = new URL(url).hostname.toLowerCase();
          const provider = host.endsWith('pexels.com') ? 'Pexels' as const : 'Pixabay' as const;
          results.push({
            title: cleanText(node.title || `${provider} stock video`, 220), url, previewUrl: '', videoUrl: '', provider,
            license: 'licensed-source', publicationReady: false,
            scene: scenes[Math.min(results.length, scenes.length - 1)]?.text || scenes[0]?.text || '',
          });
        }
      }
      if (Array.isArray(node)) node.forEach(visit); else Object.values(node).forEach(visit);
    };
    visit(payload.content);
    return dedupeByUrl(results).slice(0, 6);
  } catch { return []; }
}

async function searchStockVideos(scenes: ReelOutput['scenes']): Promise<StockMedia[]> {
  const targets = scenes.slice(0, 3);
  const directGroups = await Promise.all(targets.map(async (scene) => {
    const query = scene.stock_query || scene.text;
    const [pexels, pixabay] = await Promise.all([searchPexelsVideos(query, scene.text), searchPixabayVideos(query, scene.text)]);
    return [...pexels.slice(0, 1), ...pixabay.slice(0, 1)];
  }));
  const direct = dedupeByUrl(directGroups.flat());
  if (direct.length) return direct.slice(0, 6);
  const searched = await searchStockLibrariesWithAnthropic(targets);
  if (searched.length) return searched;
  return targets.flatMap((scene) => {
    const query = scene.stock_query || scene.text;
    const encoded = encodeURIComponent(query);
    return [
      { title: `${query} — Pexels`, url: `https://www.pexels.com/search/videos/${encoded}/`, previewUrl: '', videoUrl: '', provider: 'Pexels' as const, license: 'licensed-source' as const, publicationReady: false, scene: scene.text },
      { title: `${query} — Pixabay`, url: `https://pixabay.com/videos/search/${encoded}/`, previewUrl: '', videoUrl: '', provider: 'Pixabay' as const, license: 'licensed-source' as const, publicationReady: false, scene: scene.text },
    ];
  }).slice(0, 6);
}

function contentTitle(type: MagazineContentType, output: MagazineAgentOutput): string {
  if (type === 'editorial') return output.editorial.title;
  if (type === 'publication') return `${output.topic} — Social`;
  if (type === 'story') return `${output.topic} — Story`;
  return `${output.topic} — Reel`;
}

function contentForType(type: MagazineContentType, output: MagazineAgentOutput) {
  const shared = { topic: output.topic, angle: output.angle, audience: output.audience, language: output.language, tone: output.tone, sourceNotes: output.source_notes };
  if (type === 'editorial') return { ...shared, editorial: output.editorial };
  if (type === 'publication') return { ...shared, publication: output.publication };
  if (type === 'story') return { ...shared, story: output.story };
  return { ...shared, reel: output.reel };
}

export function serializeMagazineDraft(row: any): any {
  if (!row) return row;
  const parse = (value: unknown, fallback: any) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; } catch { return fallback; }
  };
  return {
    ...row,
    content: parse(row.content_json, {}),
    referenceMedia: parse(row.reference_media_json, []),
    stockMedia: parse(row.stock_media_json, []),
    product: row.product_id ? {
      id: row.product_id, name: row.product_name || '', brand: row.product_brand || '', image: row.product_image || '',
      url: row.product_url || '', price: Number(row.product_price) || 0, currency: row.product_currency || '', finalPriceTnd: Number(row.product_final_price) || 0,
    } : null,
    content_json: undefined, reference_media_json: undefined, stock_media_json: undefined,
  };
}

const DRAFT_SELECT = `SELECT d.*,p.name product_name,p.brand_name product_brand,p.image product_image,p.source_url product_url,
  p.original_price product_price,p.currency product_currency,p.final_price product_final_price
  FROM magazine_drafts d LEFT JOIN products p ON p.id=d.product_id`;

export function saveMagazineDraftBundle(
  db: QatafoDatabase,
  output: MagazineAgentOutput,
  references: ReferenceMedia[],
  stock: StockMedia[],
  input: GenerateMagazineInput,
  model: string,
  batchId = input.batchId || `mag_batch_${randomUUID()}`,
): any[] {
  const now = new Date().toISOString();
  const types: MagazineContentType[] = ['editorial','publication','story','reel'];
  const ids = db.transaction(() => types.map((type) => {
    const id = `mag_draft_${randomUUID()}`;
    db.run(`INSERT INTO magazine_drafts
      (id,conversation_id,batch_id,content_type,title,summary,content_json,reference_media_json,stock_media_json,product_id,category,status,generated_by,model,prompt_excerpt,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)`,
    id, cleanText(input.conversationId, 160), cleanText(batchId, 160), type, contentTitle(type, output), output.summary,
    JSON.stringify(contentForType(type, output)), JSON.stringify(references), JSON.stringify(stock), output.product_id,
    'AYROVI', cleanText(input.adminId, 160) || null, cleanText(model, 120), cleanText(input.command, 500), now, now);
    return id;
  }));
  return ids.map((id) => serializeMagazineDraft(db.get<any>(`${DRAFT_SELECT} WHERE d.id=?`, id)));
}

export async function generateMagazineContent(db: QatafoDatabase, input: GenerateMagazineInput): Promise<GenerateMagazineResult> {
  const command = cleanText(input.command, 1200);
  if (command.length < 3) throw new Error('MAGAZINE_COMMAND_REQUIRED');
  const productContext = findMagazineProductContext(db, command);
  const batchId = cleanText(input.batchId, 160) || `mag_batch_${randomUUID()}`;
  if (productContext.requested && !productContext.matched) {
    return {
      model: anthropicModel(), batchId, drafts: [], needsClarification: true,
      clarification: 'لم أجد تطابقًا مؤكدًا لهذا المنتج في قاعدة منتجات AYROVI. اختر منتجًا من القائمة أو أرسل اسمه الدقيق كما يظهر في الأدمين.',
      suggestions: productContext.products,
    };
  }
  const generated = await generateWithAnthropic({ ...input, command }, productContext);
  const imageQuery = generated.output.visual_query || `${generated.output.topic} ${generated.output.angle}`;
  const [searchedImages, stock] = await Promise.all([
    searchReferenceImages(imageQuery),
    searchStockVideos(generated.output.reel.scenes),
  ]);
  const references = (searchedImages.length ? searchedImages : generated.webReferences).slice(0, 3);
  const drafts = saveMagazineDraftBundle(db, generated.output, references, stock, { ...input, command, batchId }, generated.model, batchId);
  return { model: generated.model, batchId, output: generated.output, drafts, needsClarification: false };
}

export function listMagazineDrafts(db: QatafoDatabase, filters: { status?: string; type?: string; limit?: number } = {}): any[] {
  const where: string[] = [];
  const params: any[] = [];
  if (['draft','scheduled','published','archived'].includes(String(filters.status))) { where.push('d.status=?'); params.push(filters.status); }
  if (['editorial','publication','story','reel'].includes(String(filters.type))) { where.push('d.content_type=?'); params.push(filters.type); }
  const limit = Math.max(1, Math.min(200, Number(filters.limit) || 80));
  return db.all<any>(`${DRAFT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.created_at DESC LIMIT ?`, ...params, limit)
    .map(serializeMagazineDraft);
}

export function getMagazineDraft(db: QatafoDatabase, id: string): any | null {
  return serializeMagazineDraft(db.get<any>(`${DRAFT_SELECT} WHERE d.id=?`, id)) || null;
}

export function deleteMagazineDraft(db: QatafoDatabase, id: string): any | null {
  const row = db.get<any>('SELECT * FROM magazine_drafts WHERE id=?', id);
  if (!row) return null;
  db.transaction(() => {
    // حذف بطاقة سبق نقلها يجب ألا يترك محتوى مجدولًا ينشر لاحقًا. نؤرشف
    // سجل CMS بدل حذفه للحفاظ على المراجع والتفاعلات التاريخية.
    if (row.target_id && row.target_resource === 'news') db.run(`UPDATE news_items SET status='ARCHIVED',updated_at=? WHERE id=?`, new Date().toISOString(), row.target_id);
    if (row.target_id && row.target_resource === 'publications') db.run(`UPDATE publications SET status='archive',updated_at=? WHERE id=?`, new Date().toISOString(), row.target_id);
    if (row.target_id && row.target_resource === 'reels') db.run(`UPDATE reels SET status='archive',updated_at=? WHERE id=?`, new Date().toISOString(), row.target_id);
    if (row.target_id && row.target_resource === 'stories') db.run(`UPDATE stories SET status='EXPIRED',updated_at=? WHERE id=?`, new Date().toISOString(), row.target_id);
    db.run('DELETE FROM magazine_drafts WHERE id=?', id);
  });
  return serializeMagazineDraft(row);
}

function editorialText(content: any): string {
  const editorial = content?.editorial || {};
  const blocks = [editorial.hook, ...(Array.isArray(editorial.sections) ? editorial.sections.flatMap((section: any) => [section.heading, section.text]) : []), editorial.conclusion];
  if (Array.isArray(editorial.shop_the_look) && editorial.shop_the_look.length) blocks.push(`Shop the Look\n${editorial.shop_the_look.join('\n')}`);
  return cleanMultiline(blocks.filter(Boolean).join('\n\n'), 20000);
}

function uniqueTargetId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

type MagazineTransferStatus = 'draft' | 'scheduled' | 'published';

function targetForDraft(db: QatafoDatabase, row: any, status: MagazineTransferStatus, category: string, scheduledAt: string | null): { resource: string; id: string } {
  const now = new Date().toISOString();
  const date = scheduledAt || now;
  const content = (() => { try { return JSON.parse(row.content_json || '{}'); } catch { return {}; } })();
  const references: ReferenceMedia[] = (() => { try { return JSON.parse(row.reference_media_json || '[]'); } catch { return []; } })();
  const stock: StockMedia[] = (() => { try { return JSON.parse(row.stock_media_json || '[]'); } catch { return []; } })();
  const product = row.product_id ? db.get<any>('SELECT image FROM products WHERE id=?', row.product_id) : null;
  // الصور العامة في reference_media_json مرجعية فقط ولا تنتقل إلى حقل نشر.
  const ownedImage = String(product?.image || '').startsWith('/') || publicUrl(product?.image) ? cleanText(product.image, 1000) : '';
  const licensedVideo = stock.find((item) => item.publicationReady && item.license === 'licensed' && publicUrl(item.videoUrl))?.videoUrl || '';
  const existingId = cleanText(row.target_id, 160);

  if (row.content_type === 'editorial') {
    const id = existingId || uniqueTargetId('news_agent');
    const allowed = ['NEW_ARRIVAL','NEW_BRAND','PROMOTION','DELIVERY','AYROVI','INFORMATION','OTHER'];
    const newsCategory = allowed.includes(category) ? category : 'AYROVI';
    // نفصل دلاليًا بين المسودة والجدولة والنشر الفوري. تعرض Public API السجل
    // المجدول فقط عند حلول published_at، أما PUBLISHED فمعناه «منشور الآن».
    const cmsStatus = status === 'draft' ? 'DRAFT' : status === 'scheduled' ? 'SCHEDULED' : 'PUBLISHED';
    const values = [row.title, row.summary, editorialText(content), ownedImage, newsCategory, row.product_id || null, 'وكيل مجلتي', date, cmsStatus, now];
    if (existingId) db.run(`UPDATE news_items SET title=?,summary=?,content=?,image=?,category=?,product_id=?,author=?,published_at=?,status=?,updated_at=? WHERE id=?`, ...values, id);
    else db.run(`INSERT INTO news_items (id,title,summary,content,image,category,arrival_id,product_id,author,published_at,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?,?)`, id, ...values.slice(0, 9), now, now);
    return { resource: 'news', id };
  }
  if (row.content_type === 'publication') {
    const id = existingId || uniqueTargetId('publication_agent');
    const publication = content?.publication || {};
    const subtitle = cleanMultiline(`${publication.caption || ''}\n${(publication.hashtags || []).join(' ')}`, 4000);
    const remark = 'مسودة من وكيل مجلتي. الصور الموجودة في المراجع للإلهام فقط ولا تُنشر قبل التحقق من الترخيص.';
    if (status !== 'draft' && !ownedImage) throw new Error('MAGAZINE_MEDIA_REQUIRED');
    const publicationStatus = status !== 'draft' ? 'publie' : 'brouillon';
    if (existingId) db.run(`UPDATE publications SET title=?,subtitle=?,channel_id='pub_ayrovi',image_url=?,remark=?,publish_at=?,status=?,updated_at=? WHERE id=?`, row.title, subtitle, ownedImage, remark, date, publicationStatus, now, id);
    else db.run(`INSERT INTO publications (id,title,subtitle,channel_id,image_url,remark,publish_at,status,created_at,updated_at)
      VALUES (?,?,?,'pub_ayrovi',?,?,?,?,?,?)`, id, row.title, subtitle, ownedImage, remark, date, publicationStatus, now, now);
    return { resource: 'publications', id };
  }
  if (row.content_type === 'reel') {
    const id = existingId || uniqueTargetId('reel_agent');
    const reel = content?.reel || {};
    const description = cleanMultiline([reel.hook, ...(reel.scenes || []).map((scene: any) => `${scene.seconds}: ${scene.text}`), reel.cta].filter(Boolean).join('\n'), 4000);
    if (status !== 'draft' && !licensedVideo) throw new Error('MAGAZINE_MEDIA_REQUIRED');
    const reelStatus = status !== 'draft' ? 'publie' : 'brouillon';
    if (existingId) db.run(`UPDATE reels SET title=?,channel_id='pub_ayrovi',description=?,video_url=?,duration_seconds=?,publish_at=?,status=?,updated_at=? WHERE id=?`, row.title, description, licensedVideo, Number(reel.duration_seconds) || 20, date, reelStatus, now, id);
    else db.run(`INSERT INTO reels (id,title,channel_id,description,video_url,duration_seconds,publish_at,status,views,likes,created_at,updated_at)
      VALUES (?,?,'pub_ayrovi',?,?,?,?,?,0,0,?,?)`, id, row.title, description, licensedVideo, Number(reel.duration_seconds) || 20, date, reelStatus, now, now);
    return { resource: 'reels', id };
  }
  const id = existingId || uniqueTargetId('story_agent');
  const story = content?.story || {};
  const description = cleanMultiline([story.hook, ...(story.frames || []).map((frame: any) => `${frame.order}. ${frame.text} — ${frame.visual}`), story.interaction, story.cta].filter(Boolean).join('\n'), 4000);
  const media = licensedVideo || ownedImage;
  const mediaType = licensedVideo ? 'VIDEO' : 'IMAGE';
  const storyCategory = ['ARRIVAGE','NEW','STYLE','INFO','PROMO'].includes(category) ? category : 'STYLE';
  if (status !== 'draft' && !media) throw new Error('MAGAZINE_MEDIA_REQUIRED');
  const storyStatus = status !== 'draft' ? 'PUBLISHED' : 'DRAFT';
  if (existingId) db.run(`UPDATE stories SET category=?,media_type=?,media_url=?,title=?,description=?,cta=?,product_id=?,publish_at=?,status=?,updated_at=? WHERE id=?`, storyCategory, mediaType, media, row.title, description, story.cta || '', row.product_id || null, date, storyStatus, now, id);
  else db.run(`INSERT INTO stories (id,category,media_type,media_url,secondary_images,title,description,cta,target_url,product_id,arrival_id,promotion_id,publish_at,expires_at,priority,status,created_at,updated_at)
    VALUES (?,?,?,?,'[]',?,?,?,'',?,NULL,NULL,?,NULL,0,?,?,?)`, id, storyCategory, mediaType, media, row.title, description, story.cta || '', row.product_id || null, date, storyStatus, now, now);
  // references intentionally stay only in magazine_drafts.
  void references;
  return { resource: 'stories', id };
}

export function prepareMagazineDraft(
  db: QatafoDatabase,
  id: string,
  values: { status: MagazineTransferStatus; category?: string; scheduledAt?: string | null },
): any {
  const row = db.get<any>('SELECT * FROM magazine_drafts WHERE id=?', id);
  if (!row) throw new Error('MAGAZINE_DRAFT_NOT_FOUND');
  const status: MagazineTransferStatus = values.status === 'scheduled' ? 'scheduled' : values.status === 'published' ? 'published' : 'draft';
  const category = cleanText(values.category || row.category || 'AYROVI', 80) || 'AYROVI';
  let scheduledAt: string | null = null;
  if (status === 'scheduled') {
    const parsed = new Date(String(values.scheduledAt || ''));
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) throw new Error('MAGAZINE_SCHEDULE_INVALID');
    scheduledAt = parsed.toISOString();
  }
  return db.transaction(() => {
    const target = targetForDraft(db, row, status, category, scheduledAt);
    const now = new Date().toISOString();
    db.run(`UPDATE magazine_drafts SET status=?,category=?,scheduled_at=?,target_resource=?,target_id=?,updated_at=? WHERE id=?`,
      status, category, scheduledAt, target.resource, target.id, now, id);
    return getMagazineDraft(db, id);
  });
}

export function magazineAgentCapabilities() {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    webSearch: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    imageSearch: Boolean(process.env.SERPAPI_KEY?.trim()),
    pexels: Boolean(process.env.PEXELS_API_KEY?.trim()),
    pixabay: Boolean(process.env.PIXABAY_API_KEY?.trim()),
    stockSearch: Boolean(process.env.PEXELS_API_KEY?.trim() || process.env.PIXABAY_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
    productCatalog: true,
  };
}
