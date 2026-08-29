import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import { customerFromRequest, optionalCustomer } from '../customer/auth';
import { parsePublicHttpUrl } from '../services/safeUrl';
import {
  assistantAiReady,
  AssistantUnavailableError,
  runAssistantChat,
  type AssistantStreamEvent,
} from './service';
import type { AssistantConversationLine, AssistantImageAttachment } from './tools';
import {
  createGeminiVoiceSession,
  getGeminiTtsRuntimeStatus,
  serverTextToSpeechEnabled,
  serverTextToSpeechReady,
  synthesizeGeminiLiveAudio,
} from './geminiLive';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const voiceUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: MAX_AUDIO_BYTES } });
const IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MIME_ALIASES: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  'image/jpg': 'image/jpeg', 'image/jpeg': 'image/jpeg', 'image/png': 'image/png',
  'image/webp': 'image/webp', 'image/gif': 'image/gif',
};
const AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac']);

function validSessionId(req: Request): string {
  const raw = Array.isArray(req.headers['x-session-id']) ? req.headers['x-session-id'][0] : req.headers['x-session-id'];
  const value = String(raw || '').trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : '';
}

function matchesImageSignature(buffer: Buffer, mediaType: AssistantImageAttachment['mediaType']): boolean {
  if (mediaType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mediaType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mediaType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
}

async function cleanImageAttachments(value: unknown): Promise<AssistantImageAttachment[]> {
  if (!Array.isArray(value)) return [];
  const result: AssistantImageAttachment[] = [];
  for (const item of value.slice(0, 2)) {
    const id = String(item?.id || '').trim();
    if (!/^[A-Za-z0-9:_-]{1,120}$/.test(id)) continue;
    const rawUrl = String(item?.url || '').trim();
    if (rawUrl) {
      try {
        const url = parsePublicHttpUrl(rawUrl).toString();
        const mediaType = IMAGE_TYPES.has(String(item?.type || ''))
          ? String(item.type) as AssistantImageAttachment['mediaType']
          : 'image/jpeg';
        result.push({ id, mediaType, url });
      } catch { /* Ignore unsafe or malformed remote image URLs. */ }
      continue;
    }
    const raw = String(item?.dataUrl || item?.preview || '');
    // Tolérant : accepte les alias MIME (image/jpg) courants sur Android.
    const match = /^data:(image\/[a-z0-9.+_-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(raw);
    if (!match) { console.warn('[Assistant] attachment ignoré : dataUrl invalide'); continue; }
    const mediaType = MIME_ALIASES[match[1].toLowerCase()];
    if (!mediaType) { console.warn(`[Assistant] attachment ignoré : MIME ${match[1]}`); continue; }
    if (match[2].length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) { console.warn('[Assistant] attachment ignoré : trop volumineux'); continue; }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || !matchesImageSignature(buffer, mediaType)) {
      console.warn('[Assistant] attachment ignoré : signature image invalide');
      continue;
    }
    if (mediaType === 'image/gif') {
      try {
        const png = await sharp(buffer, { animated: false, failOn: 'warning' }).png().toBuffer();
        if (!png.length || png.length > MAX_IMAGE_BYTES) continue;
        result.push({ id, mediaType: 'image/png', data: png.toString('base64') });
      } catch {
        console.warn('[Assistant] attachment GIF ignoré : conversion impossible');
      }
      continue;
    }
    result.push({ id, mediaType, data: buffer.toString('base64') });
  }
  return result;
}

function cleanClientState(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  try {
    const json = JSON.stringify(value, (key, item) => /token|password|secret|api.?key|authorization|cookie|preview|dataurl|base64/i.test(key) ? undefined : item);
    return json.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 6000);
  } catch { return ''; }
}

async function cleanMessages(value: unknown): Promise<AssistantConversationLine[]> {
  if (!Array.isArray(value)) return [];
  let total = 0;
  let imageBudget = 2;
  const messages: AssistantConversationLine[] = [];
  const source = value.slice(-30);
  // Work backwards so the newest image/context wins the bounded multimodal budget.
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const item = source[index];
    if (!item || !['user', 'assistant'].includes(item.role)) continue;
    const text = String(item.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 8000);
    const attachments = item.role === 'user' && imageBudget > 0
      ? (await cleanImageAttachments(item.attachments)).slice(0, imageBudget)
      : [];
    if ((!text && !attachments.length) || total + text.length > 50_000) continue;
    imageBudget -= attachments.length;
    total += text.length;
    messages.unshift({ role: item.role, text, attachments: attachments.length ? attachments : undefined });
  }
  return messages;
}

export function createAssistantRouter(db: QatafoDatabase, scraper: SmartLinkScraper): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const speechToTextReady = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
    const serverTtsReady = serverTextToSpeechReady();
    const browserOnlyTts = !serverTextToSpeechEnabled();
    const geminiTts = getGeminiTtsRuntimeStatus();
    res.json({ success: true, data: {
      ready: assistantAiReady(), provider: 'anthropic', streaming: true,
      vision: true, lensTool: true, lensUrl: true, lensCodes: true, inChatOrder: true,
      voiceReady: speechToTextReady || serverTtsReady,
      speechToTextReady,
      serverTextToSpeechReady: serverTtsReady,
      clientSpeechFallback: true,
      ttsMode: browserOnlyTts ? 'browser' : 'auto',
      geminiTtsReady: geminiTts.state === 'ready',
      ttsRuntime: geminiTts,
    } });
  });

  router.get(['/voice/config', '/config'], optionalCustomer(db), (req: Request, res: Response) => {
    const sessionId = validSessionId(req) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionConfig = createGeminiVoiceSession('conv_default', 'Aoede', sessionId);
    return res.json({
      success: true,
      data: sessionConfig,
    });
  });

  router.post(['/voice/session', '/session'], optionalCustomer(db), (req: Request, res: Response) => {
    const sessionId = validSessionId(req) || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = String(req.body?.conversationId || '').trim() || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preferredVoice = String(req.body?.voiceId || req.body?.voice || 'Aoede').trim();
    const sessionConfig = createGeminiVoiceSession(conversationId, preferredVoice, sessionId);

    res.json({
      success: true,
      data: sessionConfig,
    });
  });

  // Include mount-relative aliases because this router is mounted at both
  // /api/assistant and /api/voice. The old client called /api/voice/live-audio,
  // which previously fell through to API_NOT_FOUND.
  router.post(['/voice/tts', '/voice/live-audio', '/tts', '/live-audio'], optionalCustomer(db), async (req: Request, res: Response) => {
    const text = String(req.body?.text || '').trim().slice(0, 4096);
    const voice = String(req.body?.voice || req.body?.voiceId || 'Aoede').trim();
    const speed = Math.max(0.7, Math.min(1.5, Number(req.body?.speed) || 1.0));
    if (!text) {
      return res.status(400).json({ success: false, code: 'TTS_TEXT_REQUIRED', error: 'Text required for TTS' });
    }
    if (!serverTextToSpeechEnabled()) {
      return res.status(200).json({ success: false, code: 'SERVER_TTS_DISABLED', fallbackToClient: true });
    }

    // 1. Gemini TTS. Raw PCM is normalized to WAV by the adapter.
    const geminiAudio = await synthesizeGeminiLiveAudio(text, voice);
    if (geminiAudio) {
      res.setHeader('Content-Type', geminiAudio.mimeType);
      res.setHeader('X-Voice-Provider', 'gemini-tts');
      return res.send(geminiAudio.audioBuffer);
    }

    // 2. Optional OpenAI TTS fallback.
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL?.trim() || 'tts-1',
            input: text,
            voice: voice === 'Puck' || voice === 'Fenrir' || voice === 'Charon' ? 'echo' : 'nova',
            speed,
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length > 100) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('X-Voice-Provider', 'openai-tts');
            return res.send(buffer);
          }
        } else {
          console.warn(`[Assistant TTS] OpenAI HTTP ${response.status}`);
        }
      } catch (error: any) {
        console.warn('[Assistant TTS] OpenAI speech failed:', error?.message || error);
      }
    }

    // Keep the assistant response intact and let the client perform one local
    // SpeechSynthesis playback. Debug state is machine-readable but never shown
    // as raw quota/provider text in the Voice UI.
    const runtime = getGeminiTtsRuntimeStatus();
    return res.status(200).json({
      success: false,
      code: 'SERVER_TTS_UNAVAILABLE',
      fallbackToClient: true,
      ...(runtime.debugCode ? { debugCode: runtime.debugCode, retryAt: runtime.retryAt } : {}),
    });
  });

  router.post(['/transcribe', '/voice/transcribe'], optionalCustomer(db), voiceUpload.single('audio'), async (req: Request, res: Response) => {
    const groqKey = process.env.GROQ_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const key = groqKey || openaiKey;

    if (!key) {
      return res.status(503).json({ success: false, code: 'VOICE_UNAVAILABLE', error: 'La transcription vocale AYROVI n’est pas encore activée.' });
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ success: false, code: 'AUDIO_REQUIRED', error: 'Enregistrement audio manquant.' });
    }

    const baseType = String(file.mimetype || '').split(';')[0].toLowerCase();
    if (!AUDIO_TYPES.has(baseType)) {
      return res.status(415).json({ success: false, code: 'AUDIO_UNSUPPORTED', error: 'Format audio non pris en charge.' });
    }

    const extension = baseType.includes('ogg') ? 'ogg' : baseType.includes('mpeg') ? 'mp3' : baseType.includes('wav') ? 'wav' : baseType.includes('mp4') || baseType.includes('m4a') ? 'm4a' : 'webm';

    // 1. Try Groq Whisper STT
    if (groqKey) {
      try {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(file.buffer)], { type: baseType }), `ayrovi-voice.${extension}`);
        form.append('model', String(process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'));
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append('prompt', 'Conversation AYROVI en arabe tunisien, français ou anglais. Transcrire fidèlement les noms de marques, prix, devises et références de commande.');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: form, signal: AbortSignal.timeout(25_000),
        });
        const payload: any = await response.json().catch(() => ({}));
        if (response.ok && payload?.text?.trim()) {
          const text = String(payload.text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 8000);
          return res.json({ success: true, data: { text, provider: 'groq-whisper' } });
        }
        const detail = String(payload?.error?.message || payload?.error || payload?.message || 'empty transcription').slice(0, 240);
        console.warn(`[Assistant STT] Groq HTTP ${response.status}: ${detail}`);
      } catch (err) {
        console.warn('[Assistant STT] Groq transcription error:', err);
      }
    }

    // 2. Try OpenAI Whisper STT
    if (openaiKey) {
      try {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(file.buffer)], { type: baseType }), `ayrovi-voice.${extension}`);
        form.append('model', 'whisper-1');
        form.append('response_format', 'json');
        form.append('temperature', '0');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: form, signal: AbortSignal.timeout(25_000),
        });
        const payload: any = await response.json().catch(() => ({}));
        if (response.ok && payload?.text?.trim()) {
          const text = String(payload.text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 8000);
          return res.json({ success: true, data: { text, provider: 'openai-whisper' } });
        }
        const detail = String(payload?.error?.message || payload?.error || payload?.message || 'empty transcription').slice(0, 240);
        console.warn(`[Assistant STT] OpenAI HTTP ${response.status}: ${detail}`);
      } catch (err) {
        console.warn('[Assistant STT] OpenAI transcription error:', err);
      }
    }

    return res.status(502).json({ success: false, code: 'TRANSCRIPTION_FAILED', error: 'La transcription vocale a échoué. Réessayez.' });
  });

  router.post('/chat', optionalCustomer(db), async (req: Request, res: Response) => {
    if (!assistantAiReady()) {
      return res.status(503).json({ success: false, code: 'ASSISTANT_UNAVAILABLE', error: 'L’assistant AYROVI n’est pas encore disponible.' });
    }
    const sessionId = validSessionId(req);
    const conversationId = String(req.body?.conversationId || '').trim();
    const messages = await cleanMessages(req.body?.messages);
    const clientState = cleanClientState(req.body?.state);
    if (!sessionId || !/^[A-Za-z0-9:_-]{1,120}$/.test(conversationId) || !messages.length || messages.at(-1)?.role !== 'user') {
      return res.status(400).json({ success: false, code: 'INVALID_ASSISTANT_REQUEST', error: 'Conversation ou message invalide.' });
    }

    const customer = (req as any).customer ? customerFromRequest(req) : null;
    const controller = new AbortController();
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: AssistantStreamEvent) => {
      if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    try {
      await runAssistantChat(db, scraper, { conversationId, sessionId, customer, messages, clientState }, emit, controller.signal);
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      console.warn('[Assistant chat]', error?.message || 'stream failed');
      emit({
        type: 'error',
        code: error instanceof AssistantUnavailableError ? error.code : 'ASSISTANT_ERROR',
        message: error instanceof AssistantUnavailableError
          ? 'L’assistant AYROVI ne répond pas pour le moment. Réessayez dans quelques instants.'
          : 'La réponse n’a pas pu être générée.',
      });
    } finally {
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  });

  router.use((error: any, _req: Request, res: Response, next: (error?: any) => void) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Le message vocal doit faire moins de 12 Mo.'
        : 'Le fichier audio envoyé est invalide.';
      return res.status(413).json({ success: false, code: error.code === 'LIMIT_FILE_SIZE' ? 'AUDIO_TOO_LARGE' : 'AUDIO_INVALID', error: message });
    }
    return next(error);
  });

  return router;
}
