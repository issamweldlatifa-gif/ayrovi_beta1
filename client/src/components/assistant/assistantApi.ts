import { getSessionId } from '../../utils/session';
import type { AyroviMotionState } from '../AyroviMotion';
import type { AssistantMessage } from './types';

export type AssistantApiEvent =
  | { type: 'state'; state: Exclude<AyroviMotionState, 'idle'> }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; data: Record<string, any> }
  | { type: 'done'; model: string }
  | { type: 'error'; code: string; message: string };

export class AssistantApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const directImageUrlAttachment = (message: AssistantMessage) => {
  const urls = message.text.match(/https?:\/\/[^\s<>'"]+/gi) || [];
  for (const raw of urls.slice(0, 3)) {
    try {
      const url = new URL(raw.replace(/[),.;!?]+$/, ''));
      const extension = url.pathname.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[1];
      if (!extension) continue;
      const type = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
      return { id: `url_${message.id}`.slice(0, 120), type, url: url.toString() };
    } catch { /* Continue with the next URL. */ }
  }
  return null;
};

export async function streamAssistantChat(input: {
  conversationId: string;
  messages: AssistantMessage[];
  state?: Record<string, unknown>;
  csrfToken?: string;
  signal?: AbortSignal;
  onEvent: (event: AssistantApiEvent) => void;
}): Promise<void> {
  let imageBudget = 2;
  const serializedMessages = input.messages.slice(-30).reverse().map((message) => {
    const localImages = message.role === 'user' ? (message.attachments || [])
      .filter((attachment) => attachment.type.startsWith('image/') && attachment.preview?.startsWith('data:image/'))
      .slice(0, imageBudget)
      .map((attachment) => ({ id: attachment.id, type: attachment.type, dataUrl: attachment.preview })) : [];
    const directUrl = message.role === 'user' && localImages.length < imageBudget ? directImageUrlAttachment(message) : null;
    const images = [...localImages, ...(directUrl ? [directUrl] : [])].slice(0, imageBudget);
    imageBudget -= images.length;
    return { role: message.role, text: message.text, attachments: images };
  }).reverse();

  const response = await fetch('/api/assistant/chat', {
    method: 'POST',
    credentials: 'same-origin',
    signal: input.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': getSessionId(),
      ...(input.csrfToken ? { 'x-csrf-token': input.csrfToken } : {}),
    },
    body: JSON.stringify({
      conversationId: input.conversationId,
      state: input.state,
      messages: serializedMessages,
    }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new AssistantApiError(String(payload.code || 'ASSISTANT_ERROR'), String(payload.error || 'L’assistant ne répond pas.'), response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const packet = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = packet.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      if (data) {
        try {
          const event = JSON.parse(data) as AssistantApiEvent;
          input.onEvent(event);
          if (event.type === 'error') throw new AssistantApiError(event.code, event.message, response.status);
        } catch (error) {
          if (error instanceof AssistantApiError) throw error;
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export async function transcribeAssistantAudio(input: {
  audio: Blob;
  csrfToken?: string;
  signal?: AbortSignal;
}): Promise<{ text: string; language?: string; duration?: number }> {
  const form = new FormData();
  const extension = input.audio.type.includes('ogg') ? 'ogg'
    : input.audio.type.includes('mpeg') ? 'mp3'
      : input.audio.type.includes('wav') ? 'wav'
        : input.audio.type.includes('mp4') ? 'm4a' : 'webm';
  form.append('audio', input.audio, `ayrovi-voice.${extension}`);
  const response = await fetch('/api/assistant/transcribe', {
    method: 'POST',
    credentials: 'same-origin',
    signal: input.signal,
    headers: {
      'x-session-id': getSessionId(),
      ...(input.csrfToken ? { 'x-csrf-token': input.csrfToken } : {}),
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AssistantApiError(
      String(payload.code || 'VOICE_ERROR'),
      String(payload.error || 'La transcription vocale n’est pas disponible.'),
      response.status,
    );
  }
  return {
    text: String(payload?.data?.text || '').trim(),
    language: payload?.data?.language ? String(payload.data.language) : undefined,
    duration: Number.isFinite(Number(payload?.data?.duration)) ? Number(payload.data.duration) : undefined,
  };
}
