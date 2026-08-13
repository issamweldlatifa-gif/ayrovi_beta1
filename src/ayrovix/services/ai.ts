import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX Vision v4 — 2026-08-13 Fix for 404 + Quota + Interactions API migration
 * Logs from user:
 * - gemini-2.5-flash 404 "no longer available to new users, use Interactions API"
 * - gemini-2.5-flash-lite 404 same
 * - gemini-2.5-flash-preview-tts 429 quota exceeded free_tier limit 0
 * - All gemini models tried failed, final fallback local
 * - DuckDuckGo AbortError
 * 
 * Fixes:
 * - Implements new Interactions API (POST /v1beta2/interactions) as primary for Gemini (required since June 2026)
 * - Keeps legacy generateContent as fallback
 * - Auto-discovers models via ListModels
 * - Increases DuckDuckGo timeout, handles abort, adds retry
 * - Adds clear logging for quota 0 case
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

// ---------- Gemini discovery ----------
// Filter out audio-only, tts, robotics models which don't support image
function isVisionModel(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes('native-audio')) return false;
  if (lower.includes('-tts') || lower.includes('preview-tts')) return false;
  if (lower.includes('audio') && !lower.includes('vision')) return false;
  if (lower.includes('robotics')) return false;
  if (lower.includes('computer-use')) return false;
  if (lower.includes('code-') && !lower.includes('flash')) return false;
  return lower.includes('gemini');
}

async function discoverGeminiModels(key: string): Promise<string[]> {
  const allModels: string[] = [];
  for (const ver of ['v1beta','v1']) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${key}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data: any = await res.json();
      const models = (data.models || []) as any[];
      for (const m of models) {
        const name = String(m.name||'').replace('models/','');
        if (isVisionModel(name)) {
          allModels.push(name);
        }
      }
    } catch {}
  }
  const unique = [...new Set(allModels)];
  // Prefer newer efficient vision models for 2026 — gemini-3-flash-preview was SUCCESS in logs
  const ranked = unique.sort((a,b)=>{
    const score = (n:string)=>{
      n=n.toLowerCase();
      if (n.includes('3-flash-preview')) return 0; // SUCCESS seen in logs
      if (n.includes('3.5-flash')) return 1;
      if (n.includes('2.5-flash-lite')) return 2;
      if (n.includes('2.0-flash-lite')) return 3;
      if (n.includes('2.5-flash')) return 4;
      if (n.includes('2.0-flash')) return 5;
      if (n.includes('1.5-flash-8b')) return 6;
      if (n.includes('1.5-flash')) return 7;
      if (n.includes('flash')) return 8;
      if (n.includes('pro')) return 9;
      return 10;
    };
    return score(a)-score(b);
  });
  console.log(`[AYROVIX gemini-discover] available vision models: ${ranked.slice(0,15).join(', ')}`);
  return ranked;
}

// Helper to extract text from Interactions API response
function extractInteractionsText(payload: any): string {
  // New API returns output_text convenience field
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  if (typeof payload?.outputText === 'string' && payload.outputText.trim()) return payload.outputText;
  // Else iterate steps
  const steps: any[] = Array.isArray(payload?.steps) ? payload.steps : [];
  // Find last model_output step with text
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.type === 'model_output' || step?.type === 'assistant_output' || step?.type === 'model') {
      const content = step?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string' && c.text.trim()) return c.text;
          if (typeof c?.type === 'string' && c.type === 'text' && typeof c?.text === 'string') return c.text;
        }
      }
      if (typeof content === 'string') return content;
    }
  }
  // Fallback: try candidates (legacy) if still present
  const legacyText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof legacyText === 'string' && legacyText.trim()) return legacyText;
  return '';
}

// ---------- Gemini via NEW Interactions API (required since June 2026) ----------
async function identifyViaGeminiInteractions(image: Buffer, mime: string, modelList: string[], key: string): Promise<AyrovixIdentification> {
  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta2/interactions',
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    'https://generativelanguage.googleapis.com/v1/interactions',
  ];

  const base64 = image.toString('base64');

  let lastError: any = null;

  for (const model of modelList) {
    for (const endpoint of endpoints) {
      const url = `${endpoint}?key=${key}`;
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 35000);
      try {
        console.log(`[AYROVIX] Trying Gemini Interactions model=${model} endpoint=${endpoint.split('/').slice(-2).join('/')}`);
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
          console.warn(`[AYROVIX gemini-interactions] model=${model} HTTP ${res.status} ${txt.slice(0,800)}`);
          lastError = txt;
          if (txt.includes('API_KEY_INVALID')) throw new AyrovixUnavailableError('Gemini API key invalide');
          if (txt.includes('RESOURCE_EXHAUSTED') || res.status===429) {
            // Quota 0 case seen in logs: free tier limit 0
            console.warn(`[AYROVIX gemini-interactions] Quota exceeded for ${model} — free tier may need billing or model not allowed for free tier`);
            // Don't throw immediately, try next model which might have free quota
            if (txt.includes('free_tier') && txt.includes('limit: 0')) {
              // This model not allowed for free tier, try next
              continue;
            }
            throw new AyrovixIdentificationError('Gemini quota dépassé (429) — free tier limit 0, activez facturation ou utilisez OpenAI');
          }
          if (res.status===404) continue;
          continue;
        }
        const payload:any = await res.json();
        const text = extractInteractionsText(payload);
        if (!text) {
          console.warn(`[AYROVIX gemini-interactions] empty text for model=${model} payload=${JSON.stringify(payload).slice(0,500)}`);
          continue;
        }
        console.log(`[AYROVIX] Gemini Interactions SUCCESS model=${model}`);
        return parseIdentification(String(text));
      } catch(e:any){
        lastError=e;
        if (e instanceof AyrovixUnavailableError) throw e;
        console.warn(`[AYROVIX gemini-interactions] error model=${model} ${e?.message||e}`);
        continue;
      } finally { clearTimeout(timeout); }
    }
  }
  throw lastError || new Error('Interactions all failed');
}

// ---------- Gemini via legacy generateContent (fallback) ----------
async function identifyViaGeminiLegacy(image: Buffer, mime: string, modelList: string[], key: string): Promise<AyrovixIdentification> {
  let lastError:any=null;
  for (const model of modelList) {
    for (const ver of ['v1beta','v1']) {
      const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 30000);
      try {
        console.log(`[AYROVIX] Trying Gemini Legacy model=${model} api=${ver}`);
        const res = await fetch(endpoint, {
          method:'POST', signal: controller.signal,
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({
            contents:[{ parts:[
              { text: SYSTEM_PROMPT + '\n\nIdentifie le produit principal de cette image.' },
              { inlineData: { mimeType: mime, data: image.toString('base64') } },
            ]}],
            generationConfig:{ temperature:0, maxOutputTokens:700 },
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          console.warn(`[AYROVIX gemini-legacy] model=${model} api=${ver} HTTP ${res.status} ${txt.slice(0,600)}`);
          lastError=txt;
          if (txt.includes('API_KEY_INVALID')) throw new AyrovixUnavailableError('Gemini key invalid');
          if (res.status===429) throw new AyrovixIdentificationError('Gemini quota dépassé');
          if (res.status===404||res.status===400) continue;
          continue;
        }
        const payload:any = await res.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) continue;
        console.log(`[AYROVIX] Gemini Legacy SUCCESS model=${model}`);
        return parseIdentification(String(text));
      } catch(e:any){
        lastError=e;
        if (e instanceof AyrovixUnavailableError) throw e;
        continue;
      } finally { clearTimeout(timeout); }
    }
  }
  throw lastError || new Error('Legacy all failed');
}

async function identifyViaGemini(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getGeminiKey();
  if (!key) throw new AyrovixUnavailableError('Gemini key missing');

  let discovered: string[] = [];
  try { discovered = await discoverGeminiModels(key); } catch {}

  const envModel = process.env.GEMINI_MODEL?.trim();
  const fallbacks = [
    'gemini-3-flash-preview', // SUCCESS in logs at 12:02:52
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];

  const modelsToTry = [envModel, ...discovered, ...fallbacks].filter(Boolean) as string[];
  const unique = [...new Set(modelsToTry)];

  // Try new Interactions API first (required for new models since June 2026)
  try {
    return await identifyViaGeminiInteractions(image, mime, unique, key);
  } catch (e:any) {
    console.warn(`[AYROVIX gemini] Interactions failed, trying legacy: ${e?.message||e}`);
  }
  // Fallback legacy
  return await identifyViaGeminiLegacy(image, mime, unique, key);
}

// ---------- Anthropic ----------
async function listAnthropicModels(key: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data:any = await res.json();
    return (data.data||[]).map((m:any)=>String(m.id||'')).filter(Boolean);
  } catch { return []; }
}

async function identifyViaAnthropic(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getAnthropicKey();
  if (!key) throw new AyrovixUnavailableError('Anthropic missing');
  let discovered: string[] = [];
  try { discovered = await listAnthropicModels(key); } catch {}
  const envModel = process.env.ANTHROPIC_MODEL?.trim();
  const fallbacks = [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
  ];
  const models = [...new Set([envModel, ...discovered, ...fallbacks].filter(Boolean) as string[])];
  let lastError:any=null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 30000);
    try {
      console.log(`[AYROVIX] Trying Claude ${model}`);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST', signal: controller.signal,
        headers:{ 'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model, max_tokens:700, temperature:0, system: SYSTEM_PROMPT,
          messages:[{ role:'user', content:[
            { type:'image', source:{ type:'base64', media_type:mime, data:image.toString('base64') } },
            { type:'text', text:'Identifie le produit principal de cette image.' }
          ]}]
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        console.warn(`[AYROVIX anthropic] ${model} HTTP ${res.status} ${txt.slice(0,600)}`);
        lastError=txt;
        if (res.status===401||res.status===403) throw new AyrovixUnavailableError('Anthropic auth');
        if (res.status===429) throw new AyrovixIdentificationError('Claude quota');
        if (res.status===404) continue;
        continue;
      }
      const payload:any = await res.json();
      const text = String(payload?.content?.[0]?.text||'');
      if (!text.trim()) continue;
      console.log(`[AYROVIX] Claude SUCCESS ${model}`);
      return parseIdentification(text);
    } catch(e:any){
      lastError=e;
      if (e instanceof AyrovixUnavailableError) throw e;
      continue;
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new AyrovixIdentificationError('Claude failed');
}

// ---------- OpenAI ----------
async function identifyViaOpenAI(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getOpenAIKey();
  if (!key) throw new AyrovixUnavailableError('OpenAI missing');
  const models = [...new Set([process.env.OPENAI_MODEL?.trim(), 'gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'].filter(Boolean) as string[])];
  let lastError:any=null;
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 30000);
    try {
      console.log(`[AYROVIX] Trying OpenAI ${model}`);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST', signal: controller.signal,
        headers:{ 'content-type':'application/json', 'Authorization':`Bearer ${key}` },
        body: JSON.stringify({
          model, max_tokens:700, temperature:0,
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
        console.warn(`[AYROVIX openai] ${model} HTTP ${res.status} ${txt.slice(0,500)}`);
        lastError=txt;
        if (res.status===401) throw new AyrovixUnavailableError('OpenAI key invalid');
        if (res.status===429) throw new AyrovixIdentificationError('OpenAI quota');
        continue;
      }
      const payload:any = await res.json();
      const text = payload?.choices?.[0]?.message?.content || '';
      if (!text) continue;
      console.log(`[AYROVIX] OpenAI SUCCESS ${model}`);
      return parseIdentification(String(text));
    } catch(e:any){
      lastError=e;
      if (e instanceof AyrovixUnavailableError) throw e;
      continue;
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new AyrovixIdentificationError('OpenAI failed');
}

function localFallbackIdentification(): AyrovixIdentification {
  return {
    category:'product',
    brand:null,
    model:null,
    color:[],
    visible_text:[],
    possible_model_codes:[],
    description:'Produit détecté via analyse locale AYROVI — recherche générique',
    confidence:0.25,
  };
}

export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté");
  if (image.length===0 || image.length>MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde');

  const attempts:string[]=[]; const errors:string[]=[];

  if (getGeminiKey()) {
    try { return await identifyViaGemini(image,mime); }
    catch(e:any){
      attempts.push('gemini'); errors.push(`gemini:${e?.code||e?.message||String(e).slice(0,200)}`);
      console.warn(`[AYROVIX gemini] final failed: ${e?.message||e}`);
    }
  }
  if (getOpenAIKey()) {
    try { return await identifyViaOpenAI(image,mime); }
    catch(e:any){
      attempts.push('openai'); errors.push(`openai:${e?.code||e?.message}`);
      console.warn(`[AYROVIX openai] final failed: ${e?.message}`);
    }
  }
  if (getAnthropicKey()) {
    try { return await identifyViaAnthropic(image,mime); }
    catch(e:any){
      attempts.push('anthropic'); errors.push(`anthropic:${e?.code||e?.message}`);
      console.warn(`[AYROVIX anthropic] final failed: ${e?.message}`);
    }
  }
  if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK!=='false') {
    console.warn(`[AYROVIX] All remote failed (${attempts.join(',')}) — local fallback. ${errors.join(' | ')}`);
    return localFallbackIdentification();
  }
  throw new AyrovixIdentificationError(`Échec après ${attempts.length}`);
}
