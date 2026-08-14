import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import { customerFromRequest, optionalCustomer } from '../customer/auth';
import {
  assistantAiReady,
  AssistantUnavailableError,
  runAssistantChat,
  type AssistantStreamEvent,
} from './service';
import type { AssistantConversationLine } from './tools';

function validSessionId(req: Request): string {
  const raw = Array.isArray(req.headers['x-session-id']) ? req.headers['x-session-id'][0] : req.headers['x-session-id'];
  const value = String(raw || '').trim();
  return /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : '';
}

function cleanMessages(value: unknown): AssistantConversationLine[] {
  if (!Array.isArray(value)) return [];
  let total = 0;
  const messages: AssistantConversationLine[] = [];
  for (const item of value.slice(-20)) {
    if (!item || !['user', 'assistant'].includes(item.role)) continue;
    const text = String(item.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 8000);
    if (!text || total + text.length > 40_000) continue;
    total += text.length;
    messages.push({ role: item.role, text });
  }
  return messages;
}

export function createAssistantRouter(db: QatafoDatabase): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ success: true, data: { ready: assistantAiReady(), provider: 'anthropic', streaming: true } });
  });

  router.post('/chat', optionalCustomer(db), async (req: Request, res: Response) => {
    if (!assistantAiReady()) {
      return res.status(503).json({ success: false, code: 'ASSISTANT_UNAVAILABLE', error: 'L’assistant Claude n’est pas encore activé.' });
    }
    const sessionId = validSessionId(req);
    const conversationId = String(req.body?.conversationId || '').trim();
    const messages = cleanMessages(req.body?.messages);
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
      await runAssistantChat(db, { conversationId, sessionId, customer, messages }, emit, controller.signal);
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      console.warn('[Assistant chat]', error?.message || 'stream failed');
      emit({
        type: 'error',
        code: error instanceof AssistantUnavailableError ? error.code : 'ASSISTANT_ERROR',
        message: error instanceof AssistantUnavailableError
          ? 'Claude ne répond pas pour le moment. Réessayez dans quelques instants.'
          : 'La réponse n’a pas pu être générée.',
      });
    } finally {
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  });

  return router;
}
