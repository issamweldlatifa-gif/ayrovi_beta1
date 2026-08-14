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

export async function streamAssistantChat(input: {
  conversationId: string;
  messages: AssistantMessage[];
  csrfToken?: string;
  signal?: AbortSignal;
  onEvent: (event: AssistantApiEvent) => void;
}): Promise<void> {
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
      messages: input.messages.map((message) => ({ role: message.role, text: message.text })).slice(-20),
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
