import { decodeConversation, type AssistantConversation } from './conversationCodec';
export type { AssistantConversation } from './conversationCodec';

const STORAGE_PREFIX = 'ayrovi_assistant_conversations_v1_';
export const MAX_CONVERSATIONS = 20;
// A whole-document budget, never a per-message text truncation. Browsers may have
// lower remaining quotas; setItem is still checked before reporting success.
export const MAX_HISTORY_CHARACTERS = 2_000_000;
export type HistoryStatus = 'ready' | 'unavailable' | 'corrupt' | 'limit' | 'quota' | 'invalid';
export interface HistoryResult { conversations: AssistantConversation[]; status: HistoryStatus }

const storageKey = (scope?: string | null) => {
  const value = String(scope || '').trim();
  if (!value) return `${STORAGE_PREFIX}guest`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619);
  }
  return `${STORAGE_PREFIX}account_${(hash >>> 0).toString(36)}`;
};
const sorted = (values: AssistantConversation[]) => [...values].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

export function readAssistantHistory(scope?: string | null): HistoryResult {
  let raw: string | null;
  try { raw = window.localStorage.getItem(storageKey(scope)); }
  catch { return { conversations: [], status: 'unavailable' }; }
  if (!raw) return { conversations: [], status: 'ready' };
  if (raw.length > MAX_HISTORY_CHARACTERS) return { conversations: [], status: 'limit' };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { conversations: [], status: 'corrupt' }; }
  if (!Array.isArray(parsed)) return { conversations: [], status: 'corrupt' };
  const conversations: AssistantConversation[] = [];
  let status: HistoryStatus = 'ready';
  const ids = new Set<string>();
  for (const value of parsed) {
    try {
      const conversation = decodeConversation(value);
      if (ids.has(conversation.id)) { status = 'corrupt'; continue; }
      ids.add(conversation.id); conversations.push(conversation);
    } catch { status = 'corrupt'; }
  }
  // A damaged record does not crash other conversations, but it must not be
  // erased by a later automatic write of only the successfully decoded subset.
  return { conversations: sorted(conversations).slice(0, MAX_CONVERSATIONS), status };
}

function write(scope: string | null | undefined, next: AssistantConversation[], current: HistoryResult): HistoryResult {
  if (current.status !== 'ready') return current;
  const raw = JSON.stringify(next);
  if (raw.length > MAX_HISTORY_CHARACTERS) return { ...current, status: 'limit' };
  try { window.localStorage.setItem(storageKey(scope), raw); }
  catch (error) {
    return { ...current, status: error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError' ? 'quota' : 'unavailable' };
  }
  return { conversations: next, status: 'ready' };
}

export function saveAssistantConversation(scope: string | null | undefined, conversation: AssistantConversation): HistoryResult {
  const current = readAssistantHistory(scope);
  if (current.status !== 'ready') return current;
  let decoded: AssistantConversation;
  try { decoded = decodeConversation(conversation); }
  catch { return { ...current, status: 'invalid' }; }
  if (!decoded.messages.length) return current;
  const next = sorted([decoded, ...current.conversations.filter(item => item.id !== decoded.id)]).slice(0, MAX_CONVERSATIONS);
  return write(scope, next, current);
}

export function deleteAssistantConversation(scope: string | null | undefined, id: string): HistoryResult {
  const current = readAssistantHistory(scope);
  return write(scope, current.conversations.filter(item => item.id !== id), current);
}
