import { AssistantMessage } from './types';

export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PREFIX = 'ayrovi_assistant_conversations_v1_';
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 60;

const storageKey = (scope?: string | null) => {
  const value = String(scope || '').trim();
  if (!value) return `${STORAGE_PREFIX}guest`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${STORAGE_PREFIX}account_${(hash >>> 0).toString(36)}`;
};

const sanitizeMessage = (value: any): AssistantMessage | null => {
  if (!value || !['user', 'assistant'].includes(value.role)) return null;
  const id = String(value.id || '').slice(0, 120);
  const text = String(value.text || '').slice(0, 8_000);
  if (!id || !text) return null;
  return {
    id,
    role: value.role,
    text,
    fromVoice: value.fromVoice === true,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.slice(0, 4).map((item: any) => ({
          id: String(item?.id || '').slice(0, 120),
          name: String(item?.name || 'Pièce jointe').slice(0, 180),
          type: String(item?.type || '').slice(0, 120),
        }))
      : undefined,
  };
};

const sanitizeConversation = (value: any): AssistantConversation | null => {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').slice(0, 120);
  if (!id) return null;
  const now = new Date().toISOString();
  const messages = Array.isArray(value.messages)
    ? value.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES) as AssistantMessage[]
    : [];
  return {
    id,
    title: String(value.title || 'Nouvelle conversation').trim().slice(0, 80) || 'Nouvelle conversation',
    messages,
    createdAt: Number.isFinite(Date.parse(value.createdAt)) ? value.createdAt : now,
    updatedAt: Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : now,
  };
};

export const listAssistantConversations = (scope?: string | null): AssistantConversation[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(scope)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeConversation)
      .filter(Boolean)
      .sort((left, right) => String(right!.updatedAt).localeCompare(String(left!.updatedAt)))
      .slice(0, MAX_CONVERSATIONS) as AssistantConversation[];
  } catch {
    return [];
  }
};

const writeAssistantConversations = (scope: string | null | undefined, conversations: AssistantConversation[]) => {
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Private browsing and full storage must not prevent the assistant from working.
  }
};

export const saveAssistantConversation = (scope: string | null | undefined, conversation: AssistantConversation) => {
  const sanitized = sanitizeConversation(conversation);
  if (!sanitized || !sanitized.messages.length) return listAssistantConversations(scope);
  const current = listAssistantConversations(scope).filter((item) => item.id !== sanitized.id);
  const next = [sanitized, ...current].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_CONVERSATIONS);
  writeAssistantConversations(scope, next);
  return next;
};

export const deleteAssistantConversation = (scope: string | null | undefined, id: string) => {
  const next = listAssistantConversations(scope).filter((item) => item.id !== id);
  writeAssistantConversations(scope, next);
  return next;
};
