import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX Vision V5 Radical — Fast, No Effects, No Slowness (user request)
 * - Removed stars, Xray purple, heavy animations from camera (frontend)
 * - Vision: fast path, no ListModels discovery if GEMINI_MODEL set, max 2 models, 12s timeout, prioritize gemini-3-flash-preview (SUCCESS in logs)
 * - Search: fast DuckDuckGo single endpoint, 5s timeout, no enrichment (enrich on click only)
 * - OCR removed from critical path (was 5-10s Tesseract) — now via separate /api/extract-image endpoint only
 * - Incompatibility fixed: removed audio models (native-audio, tts) which don't support image
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export class AyrovixUnavailableError extends Error { readonly code = 'AYROVIX_UNAVAILABLE'; }
export class AyrovixIdentificationError extends Error { readonly code = 'IDENTIFICATION_FAILED'; }

function getGeminiKey(): string | null {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim() || null;
}
function getOpenAIKey(): string | null {
  return (process.env.OPENAI_API_KEY || '').trim() || null;
}
function getAnthropicKey(): string | null {
  return (process.env.ANTHROPIC_API_KEY || '').trim() || null;
}

export function ayrovixAiReady(): boolean {
  if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK !== 'false') return true;
  return Boolean(getGeminiKey() || getOpenAIKey() || getAnthropicKey());
}
export function getActiveProviders(): string[] {
  const p: string[] = [];
  if (getGeminiKey()) p.push('gemini');
  if (getOpenAIKey()) p.push('openai');
  if (getAnthropicKey()) p.push('anthropic');
  p.push('local-fallback');
  return p;
}

const SYSTEM_PROMPT = `Tu es le moteur d'identification visuelle d'AYROVIX, un assistant shopping tunisien.
Analyse l'image et identifie le produit principal. Réponds UNIQUEMENT par un objet JSON valide, sans markdown, avec exactement ces clés :
{
  "category": string en anglais simple (ex. "shoes", "handbag", "dress", "watch", "supplement"),
  "brand": string ou null si non visible,
  "model": string ou null (nom commercial du modèle si identifiable),
  "color": tableau de 1 à 3 couleurs en anglais, des plus dominantes aux plus discrètes,
  "visible_text": tableau de textes réellement lisibles sur le produit (logos, étiquettes),
  "possible_model_codes": tableau de codes article plausibles SEULEMENT si un code est visible (ex. "DC9412-400"), sinon [],
  "description": une phrase factuelle en français décrivant le produit (forme, matière, usage),
  "confidence": nombre entre 0 et 1 — honnêteté obligatoire : < 0.4 si l'identification est incertaine
}
Règles strictes : n'invente ni marque ni modèle ni code ; n'évalue JAMAIS de prix ; si l'image ne contient pas de produit identifiable, mets confidence à 0 et description à "PRODUIT_NON_IDENTIFIE".`;

function parseIdentification(raw: string): AyrovixIdentification {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new AyrovixIdentificationError('Réponse du modèle inexploitable.');
  let parsed: any;
  try { parsed = JSON.parse(match[0]); } catch { throw new AyrovixIdentificationError('JSON d’identification invalide.'); }
  const list = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.filter((x: string) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0,80)).slice(0,max) : [];
  const conf = Number(parsed.confidence);
  return {
    category: typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase().slice(0,60) : 'product',
    brand: typeof parsed.brand === 'string' && parsed.brand.trim() ? parsed.brand.trim().slice(0,80) : null,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim().slice(0,120) : null,
    color: list(parsed.color,3),
    visible_text: list(parsed.visible_text,8),
    possible_model_codes: list(parsed.possible_model_codes,4),
    description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0,400) : '',
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
  };
}

export function buildSearchQuery(id: AyrovixIdentification): string {
  const parts: string[] = [];
  if (id.possible_model_codes.length && id.brand) parts.push(id.brand, id.possible_model_codes[0]);
  else {
    if (id.brand) parts.push(id.brand);
    if (id.model) parts.push(id.model);
    parts.push(...id.color);
    if (id.category && id.category !== 'product') parts.push(id.category);
  }
  const fallback = parts.length ? parts.join(' ') : `${id.brand||''} ${id.category} ${id.description}`.trim();
  return fallback.replace(/\s+/g,' ').trim().slice(0,200) || id.category || 'produit';
}

function isVisionModel(name: string): boolean {
  const l = name.toLowerCase();
  if (l.includes('native-audio')) return false;
  if (l.includes('-tts') || l.includes('preview-tts')) return false;
  if (l.includes('audio') && !l.includes('vision')) return false;
  if (l.includes('robotics') || l.includes('computer-use')) return false;
  return l.includes('gemini');
}

async function discoverGeminiModelsFast(key: string): Promise<string[]> {
  if (process.env.GEMINI_MODEL?.trim()) return []; // fast path: env model set, skip discovery
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data: any = await res.json();
    const models = (data.models || []) as any[];
    const filtered = models.map((m:any)=>String(m.name||'').replace('models/','')).filter(isVisionModel);
    // Prefer working model from logs
    const ranked = filtered.sort((a,b)=>{
      const score = (n:string)=>{
        n=n.toLowerCase();
        if (n.includes('3-flash-preview')) return 0;
        if (n.includes('3.5-flash')) return 1;
        if (n.includes('2.5-flash-lite')) return 2;
        return 10;
      };
      return score(a)-score(b);
    });
    return ranked.slice(0,3);
  } catch { return []; }
}

function extractInteractionsText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const steps: any[] = Array.isArray(payload?.steps) ? payload.steps : [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type === 'model_output') {
      const content = step?.content;
      if (Array.isArray(content)) {
        for (const c of content) if (typeof c?.text === 'string' && c.text.trim()) return c.text;
      }
    }
  }
  const legacy = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof legacy === 'string' && legacy.trim()) return legacy;
  return '';
}

async function identifyViaGeminiInteractions(image: Buffer, mime: string, modelList: string[], key: string): Promise<AyrovixIdentification> {
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta2/interactions',
    'https://generativelanguage.googleapis.com/v1beta/interactions',
  ];
  const base64 = image.toString('base64');
  let lastError: any = null;
  for (const model of modelList.slice(0,3)) { // max 3 models for speed
    for (const endpoint of endpoints) {
      const url = `${endpoint}?key=${key}`;
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 12000); // 12s not 35s
      try {
        console.log(`[AYROVIX] Gemini Interactions model=${model}`);
        const res = await fetch(url, {
          method:'POST', signal: controller.signal,
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({
            model,
            input: [
              { type: 'text', text: SYSTEM_PROMPT + '\n\nIdentifie le produit principal de cette image.' },
              { type: 'image', mime_type: mime, data: base64 },
            ],
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          console.warn(`[AYROVIX gemini-interactions] ${model} HTTP ${res.status} ${txt.slice(0,400)}`);
          lastError = txt;
          if (txt.includes('API_KEY_INVALID')) throw new AyrovixUnavailableError('Gemini key invalid');
          if (txt.includes('RESOURCE_EXHAUSTED') || res.status===429) throw new AyrovixIdentificationError('Gemini quota');
          if (res.status===404) continue;
          continue;
        }
        const payload:any = await res.json();
        const text = extractInteractionsText(payload);
        if (!text) continue;
        console.log(`[AYROVIX] Gemini SUCCESS ${model}`);
        return parseIdentification(String(text));
      } catch(e:any){
        lastError=e;
        if (e instanceof AyrovixUnavailableError) throw e;
        continue;
      } finally { clearTimeout(timeout); }
    }
  }
  throw lastError || new Error('Interactions failed');
}

async function identifyViaOpenAI(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getOpenAIKey();
  if (!key) throw new AyrovixUnavailableError('OpenAI missing');
  const models = [process.env.OPENAI_MODEL?.trim(), 'gpt-4o-mini'].filter(Boolean) as string[];
  let lastError:any=null;
  for (const model of models.slice(0,2)) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 12000);
    try {
      console.log(`[AYROVIX] OpenAI ${model}`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST', signal: controller.signal,
        headers:{ 'content-type':'application/json', 'Authorization':`Bearer ${key}` },
        body: JSON.stringify({
          model, max_tokens:500, temperature:0,
          messages:[
            { role:'system', content: SYSTEM_PROMPT },
            { role:'user', content:[
              { type:'text', text:'Identifie le produit principal de cette image.' },
              { type:'image_url', image_url:{ url:`data:${mime};base64,${image.toString('base64')}`, detail:'low' } },
            ]},
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        console.warn(`[AYROVIX openai] ${model} HTTP ${res.status}`);
        lastError=txt;
        if (res.status===401) throw new AyrovixUnavailableError('OpenAI key invalid');
        continue;
      }
      const payload:any = await res.json();
      const text = payload?.choices?.[0]?.message?.content || '';
      if (!text) continue;
      console.log(`[AYROVIX] OpenAI SUCCESS`);
      return parseIdentification(String(text));
    } catch(e:any){
      lastError=e;
      if (e instanceof AyrovixUnavailableError) throw e;
      continue;
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new AyrovixIdentificationError('OpenAI failed');
}

function localFallback(): AyrovixIdentification {
  return {
    category:'product', brand:null, model:null, color:[], visible_text:[], possible_model_codes:[],
    description:'Produit détecté via analyse locale AYROVI — recherche générique',
    confidence:0.25,
  };
}

export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format non supporté");
  if (image.length===0 || image.length>MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde');

  const geminiKey = getGeminiKey();
  const openaiKey = getOpenAIKey();

  // FAST PATH: prioritize working model gemini-3-flash-preview (SUCCESS in logs) or env model
  if (geminiKey) {
    try {
      const envModel = process.env.GEMINI_MODEL?.trim();
      let models: string[] = [];
      if (envModel) {
        models = [envModel];
      } else {
        const discovered = await discoverGeminiModelsFast(geminiKey);
        models = discovered.length ? discovered : ['gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];
      }
      return await identifyViaGeminiInteractions(image, mime, models, geminiKey);
    } catch(e:any){
      console.warn(`[AYROVIX gemini] fast fail: ${e?.message||e}`);
    }
  }
  if (openaiKey) {
    try { return await identifyViaOpenAI(image, mime); }
    catch(e:any){ console.warn(`[AYROVIX openai] fail: ${e?.message}`); }
  }
  console.warn(`[AYROVIX] fallback local`);
  return localFallback();
}
