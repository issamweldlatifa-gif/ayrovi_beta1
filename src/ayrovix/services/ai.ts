import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX · AI Vision — Multi-provider with auto model discovery (fixed Aug 2026)
 * Issue from screenshot:
 *  - gemini-1.5-flash 404 on v1beta → now tries gemini-2.0-flash, gemini-2.0-flash-lite, 1.5-flash, 1.5-flash-8b
 *  - claude-3-5-sonnet-20241022 404 → now tries claude-sonnet-4, claude-3-5-sonnet-latest, haiku-latest, etc.
 *  - Also fixed payload key: inlineData/mimeType not inline_data/mime_type
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
  try { parsed = JSON.parse(match[0]); } 
  catch { throw new AyrovixIdentificationError('JSON d’identification invalide.'); }
  const list = (v: unknown, max: number): string[] =>
    Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0,80)).slice(0,max) : [];
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

// -------- Anthropic with model fallback --------
async function identifyViaAnthropic(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getAnthropicKey();
  if (!key) throw new AyrovixUnavailableError('Anthropic key missing');
  const endpoint = 'https://api.anthropic.com/v1/messages';
  // In Aug 2026, old 20241022 model is deprecated → try new names
  const modelsToTry = [
    process.env.ANTHROPIC_MODEL?.trim(),
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
  ].filter(Boolean) as string[];

  let lastError: any = null;
  for (const model of [...new Set(modelsToTry)]) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 30000);
    try {
      const res = await fetch(endpoint, {
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
        console.warn(`[AYROVIX anthropic] model=${model} HTTP ${res.status} ${txt.slice(0,500)}`);
        lastError = new Error(txt);
        if (res.status===401||res.status===403) throw new AyrovixUnavailableError('Anthropic auth failed');
        if (res.status===429) throw new AyrovixIdentificationError('Claude quota dépassé (429)');
        if (res.status===404 && txt.includes('not_found_error')) { continue; } // try next model
        throw new AyrovixIdentificationError(`Claude indisponible (HTTP ${res.status})`);
      }
      const payload:any = await res.json();
      const text = String(payload?.content?.[0]?.text||'');
      if (!text.trim()) throw new AyrovixIdentificationError('Réponse vide Claude');
      console.log(`[AYROVIX] Claude success with model=${model}`);
      return parseIdentification(text);
    } catch(e:any){
      lastError=e;
      if (e instanceof AyrovixUnavailableError || e instanceof AyrovixIdentificationError) {
        if (e.message.includes('404') || e.message.includes('not_found')) continue;
        throw e;
      }
      if (e?.name==='AbortError') { continue; }
      throw e;
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new AyrovixIdentificationError('Claude tous modèles échoués');
}

// -------- Gemini with model fallback + fixed payload --------
async function identifyViaGemini(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getGeminiKey();
  if (!key) throw new AyrovixUnavailableError('Gemini key missing');

  // For Aug 2026, gemini-2.0-flash is current stable. Keep 1.5 as fallback.
  const modelsToTry = [
    process.env.GEMINI_MODEL?.trim(),
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp',
  ].filter(Boolean) as string[];

  const apiVersions = ['v1beta','v1']; // try v1beta then v1

  let lastError:any = null;

  for (const model of [...new Set(modelsToTry)]) {
    for (const ver of apiVersions) {
      const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${key}`;
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(), 30000);
      try {
        console.log(`[AYROVIX] Trying Gemini model=${model} api=${ver}...`);
        const res = await fetch(endpoint, {
          method:'POST', signal: controller.signal,
          headers:{ 'content-type':'application/json' },
          body: JSON.stringify({
            contents:[{
              parts:[
                { text: SYSTEM_PROMPT + '\n\nIdentifie le produit principal de cette image.' },
                { inlineData: { mimeType: mime, data: image.toString('base64') } },
              ]
            }],
            generationConfig:{ temperature:0, maxOutputTokens:700 },
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          console.warn(`[AYROVIX gemini] model=${model} api=${ver} HTTP ${res.status} ${txt.slice(0,600)}`);
          lastError = txt;
          if (res.status===400 && txt.includes('API_KEY_INVALID')) throw new AyrovixUnavailableError('Gemini API key invalide');
          if (res.status===429) throw new AyrovixIdentificationError('Gemini quota dépassé (429)');
          if (res.status===404) { continue; } // try next model/version
          if (res.status===400) { continue; }
          throw new AyrovixIdentificationError(`Gemini indisponible (HTTP ${res.status})`);
        }
        const payload:any = await res.json();
        const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) throw new AyrovixIdentificationError('Réponse vide Gemini');
        console.log(`[AYROVIX] Gemini success model=${model} api=${ver} — category extraction ok`);
        return parseIdentification(String(text));
      } catch(e:any){
        lastError=e;
        if (e instanceof AyrovixUnavailableError || e instanceof AyrovixIdentificationError) {
          // 404 → try next, 429/quota → bubble to next provider
          if (String(e.message).includes('429') || String(e.message).includes('quota')) throw e;
          if (e.code==='IDENTIFICATION_FAILED') { continue; }
          throw e;
        }
        if (e?.name==='AbortError') continue;
        continue;
      } finally { clearTimeout(timeout); }
    }
  }
  throw new AyrovixIdentificationError(`Gemini tous modèles échoués. Dernier: ${String(lastError).slice(0,300)}`);
}

// -------- OpenAI ----------
async function identifyViaOpenAI(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getOpenAIKey();
  if (!key) throw new AyrovixUnavailableError('OpenAI key missing');
  const modelsToTry = [
    process.env.OPENAI_MODEL?.trim(),
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1-mini',
  ].filter(Boolean) as string[];

  let lastError:any=null;
  for (const model of [...new Set(modelsToTry)]) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 30000);
    try {
      console.log(`[AYROVIX] Trying OpenAI model=${model}...`);
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
        const txt = await res.text().catch(()=>'');
        console.warn(`[AYROVIX openai] model=${model} HTTP ${res.status} ${txt.slice(0,500)}`);
        lastError=txt;
        if (res.status===401) throw new AyrovixUnavailableError('OpenAI key invalide');
        if (res.status===429) throw new AyrovixIdentificationError('OpenAI quota dépassé (429)');
        if (res.status===404) continue;
        throw new AyrovixIdentificationError(`OpenAI indisponible (HTTP ${res.status})`);
      }
      const payload:any = await res.json();
      const text = payload?.choices?.[0]?.message?.content || '';
      if (!text) throw new AyrovixIdentificationError('Réponse vide OpenAI');
      console.log(`[AYROVIX] OpenAI success model=${model}`);
      return parseIdentification(String(text));
    } catch(e:any){
      lastError=e;
      if (e instanceof AyrovixUnavailableError) throw e;
      if (e?.code==='IDENTIFICATION_FAILED') continue;
      continue;
    } finally { clearTimeout(timeout); }
  }
  throw lastError || new AyrovixIdentificationError('OpenAI tous modèles échoués');
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
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté (JPEG, PNG, WebP).");
  if (image.length===0 || image.length>MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde (5 Mo max).');

  const attempts:string[]=[]; const errors:string[]=[];

  if (getGeminiKey()) {
    try { const r = await identifyViaGemini(image,mime); return r; }
    catch(e:any){
      attempts.push('gemini'); errors.push(`gemini:${e?.code||e?.message||String(e).slice(0,100)}`);
      console.warn(`[AYROVIX gemini] failed: ${e?.message||e}`);
      if (String(e?.message||'').includes('API_KEY_INVALID')) {
        // invalid key → don't try other gemini models
      }
    }
  }
  if (getOpenAIKey()) {
    try { const r = await identifyViaOpenAI(image,mime); return r; }
    catch(e:any){
      attempts.push('openai'); errors.push(`openai:${e?.code||e?.message}`);
      console.warn(`[AYROVIX openai] failed: ${e?.message}`);
    }
  }
  if (getAnthropicKey()) {
    try { const r = await identifyViaAnthropic(image,mime); return r; }
    catch(e:any){
      attempts.push('anthropic'); errors.push(`anthropic:${e?.code||e?.message}`);
      console.warn(`[AYROVIX anthropic] failed: ${e?.message}`);
      if (e instanceof AyrovixUnavailableError && process.env.AYROVIX_ALLOW_LOCAL_FALLBACK==='false') throw e;
    }
  }
  if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK!=='false') {
    console.warn(`[AYROVIX] All remote providers failed (${attempts.join(',')}) — using local fallback. Errors: ${errors.join(' | ')}`);
    return localFallbackIdentification();
  }
  console.error(`[AYROVIX] FINAL FAILURE — ${attempts.join(',')} — ${errors.join(' | ')}`);
  throw new AyrovixIdentificationError(`Identification échouée après ${attempts.length} tentatives.`);
}
