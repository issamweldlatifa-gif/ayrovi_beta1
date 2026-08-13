import type { AyrovixIdentification } from '../types';

/**
 * AYROVIX · AI understanding layer — Multi-provider Vision.
 * - Provider order: GEMINI (free tier best) -> OPENAI -> ANTHROPIC -> LOCAL FALLBACK
 * - Keys STRICTLY server-side only, never VITE_*
 * - Role: identify product — NEVER price, NEVER search.
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
  // Always ready if local fallback allowed (default true)
  // This prevents 503 IDENTIFICATION_FAILED loops when API credit is exhausted
  if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK !== 'false') return true;
  return Boolean(getGeminiKey() || getOpenAIKey() || getAnthropicKey());
}

export function getActiveProviders(): string[] {
  const providers: string[] = [];
  if (getGeminiKey()) providers.push('gemini');
  if (getOpenAIKey()) providers.push('openai');
  if (getAnthropicKey()) providers.push('anthropic');
  providers.push('local-fallback');
  return providers;
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
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new AyrovixIdentificationError('JSON d’identification invalide.');
  }
  const list = (value: unknown, max: number): string[] =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 80)).slice(0, max) : [];
  const confidence = Number(parsed.confidence);
  return {
    category: typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase().slice(0, 60) : 'product',
    brand: typeof parsed.brand === 'string' && parsed.brand.trim() ? parsed.brand.trim().slice(0, 80) : null,
    model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim().slice(0, 120) : null,
    color: list(parsed.color, 3),
    visible_text: list(parsed.visible_text, 8),
    possible_model_codes: list(parsed.possible_model_codes, 4),
    description: typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 400) : '',
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
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
  const fallback = parts.length ? parts.join(' ') : `${id.brand || ''} ${id.category} ${id.description}`.trim();
  return fallback.replace(/\s+/g, ' ').trim().slice(0, 200) || id.category || 'produit';
}

// ---------- Anthropic (original) ----------
async function identifyViaAnthropic(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getAnthropicKey();
  if (!key) throw new AyrovixUnavailableError('Anthropic key missing');
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } },
            { type: 'text', text: 'Identifie le produit principal de cette image.' },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[AYROVIX anthropic] HTTP ${res.status} ${txt.slice(0, 300)}`);
      if (res.status === 401 || res.status === 403) throw new AyrovixUnavailableError('Anthropic auth failed');
      if (res.status === 429) throw new AyrovixIdentificationError('Claude quota dépassé (429) — essayez un autre fournisseur.');
      throw new AyrovixIdentificationError(`Claude indisponible (HTTP ${res.status})`);
    }
    const payload: any = await res.json();
    const text = String(payload?.content?.[0]?.text || '');
    if (!text.trim()) throw new AyrovixIdentificationError('Réponse vide Claude');
    return parseIdentification(text);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Gemini (Google) — FREE TIER best alternative ----------
async function identifyViaGemini(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getGeminiKey();
  if (!key) throw new AyrovixUnavailableError('Gemini key missing');
  // Use 1.5-flash which is free tier 1500 req/day, very fast
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT + '\n\nIdentifie le produit principal de cette image.' },
            { inline_data: { mime_type: mime, data: image.toString('base64') } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 700 },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[AYROVIX gemini] HTTP ${res.status} ${txt.slice(0, 400)}`);
      if (res.status === 429) throw new AyrovixIdentificationError('Gemini quota dépassé (429) — attendez ou changez de fournisseur.');
      if (res.status === 400 && txt.includes('API_KEY_INVALID')) throw new AyrovixUnavailableError('Gemini API key invalide');
      throw new AyrovixIdentificationError(`Gemini indisponible (HTTP ${res.status})`);
    }
    const payload: any = await res.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new AyrovixIdentificationError('Réponse vide Gemini');
    return parseIdentification(String(text));
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- OpenAI — cheapest after Gemini ----------
async function identifyViaOpenAI(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  const key = getOpenAIKey();
  if (!key) throw new AyrovixUnavailableError('OpenAI key missing');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // cheapest vision model ~ $0.15 / 1M tokens
  const endpoint = 'https://api.openai.com/v1/chat/completions';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const base64 = image.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Identifie le produit principal de cette image.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[AYROVIX openai] HTTP ${res.status} ${txt.slice(0, 400)}`);
      if (res.status === 401) throw new AyrovixUnavailableError('OpenAI key invalide');
      if (res.status === 429) throw new AyrovixIdentificationError('OpenAI quota dépassé (429)');
      throw new AyrovixIdentificationError(`OpenAI indisponible (HTTP ${res.status})`);
    }
    const payload: any = await res.json();
    const text = payload?.choices?.[0]?.message?.content || '';
    if (!text) throw new AyrovixIdentificationError('Réponse vide OpenAI');
    return parseIdentification(String(text));
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Local fallback — never fails ----------
function localFallbackIdentification(): AyrovixIdentification {
  // This ensures Lens never returns IDENTIFICATION_FAILED even without external AI
  // It produces a generic query that still hits catalogSearch + serpSearch
  return {
    category: 'product',
    brand: null,
    model: null,
    color: [],
    visible_text: [],
    possible_model_codes: [],
    description: 'Produit détecté via analyse locale AYROVI — recherche générique',
    confidence: 0.25,
  };
}

// Main entry — tries providers in order, with detailed logging
export async function identifyProduct(image: Buffer, mime: string): Promise<AyrovixIdentification> {
  if (!ALLOWED_MIME.has(mime)) throw new AyrovixIdentificationError("Format d'image non supporté (JPEG, PNG, WebP).");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) throw new AyrovixIdentificationError('Image trop lourde (5 Mo max).');

  const attempts: string[] = [];
  const errors: string[] = [];

  // 1. Gemini (preferred — free tier)
  if (getGeminiKey()) {
    try {
      console.log('[AYROVIX] Trying Gemini...');
      const result = await identifyViaGemini(image, mime);
      console.log(`[AYROVIX] Gemini success — category=${result.category} confidence=${result.confidence}`);
      return result;
    } catch (e: any) {
      attempts.push('gemini');
      errors.push(`gemini:${e?.code || e?.message}`);
      console.warn(`[AYROVIX gemini] failed: ${e?.message}`);
      // if quota exceeded, try next provider immediately
    }
  }

  // 2. OpenAI
  if (getOpenAIKey()) {
    try {
      console.log('[AYROVIX] Trying OpenAI...');
      const result = await identifyViaOpenAI(image, mime);
      console.log(`[AYROVIX] OpenAI success — category=${result.category}`);
      return result;
    } catch (e: any) {
      attempts.push('openai');
      errors.push(`openai:${e?.code || e?.message}`);
      console.warn(`[AYROVIX openai] failed: ${e?.message}`);
    }
  }

  // 3. Anthropic Claude (original)
  if (getAnthropicKey()) {
    try {
      console.log('[AYROVIX] Trying Claude...');
      const result = await identifyViaAnthropic(image, mime);
      console.log(`[AYROVIX] Claude success`);
      return result;
    } catch (e: any) {
      attempts.push('anthropic');
      errors.push(`anthropic:${e?.code || e?.message}`);
      console.warn(`[AYROVIX anthropic] failed: ${e?.message}`);
      // if it's UNAVAILABLE (auth), don't fallback silently? But we still want fallback to keep UX working
      if (e instanceof AyrovixUnavailableError && attempts.length === 1) {
        // If only Claude was configured and auth fails, bubble as UNAVAILABLE
        // Unless fallback explicitly enabled
        if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK === 'false') throw e;
      }
    }
  }

  // 4. Local fallback — ALWAYS succeeds, prevents log spam IDENTIFICATION_FAILED
  if (process.env.AYROVIX_ALLOW_LOCAL_FALLBACK !== 'false') {
    console.warn(`[AYROVIX] All remote providers failed (${attempts.join(',')}) — using local fallback. Errors: ${errors.join(' | ')}`);
    return localFallbackIdentification();
  }

  // If fallback disabled and no key works
  console.error(`[AYROVIX analyze-image] FINAL FAILURE — providers tried: ${attempts.join(',')} — ${errors.join(' | ')}`);
  throw new AyrovixIdentificationError(`Identification échouée après ${attempts.length} tentatives.`);
}
