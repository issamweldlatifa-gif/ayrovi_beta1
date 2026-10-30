import { create } from 'zustand';
import { newAssistantConversationId, type AssistantAttachment, type AssistantState } from '@/api/assistant';
import type { SonimChatMessage } from './sonimModel';

type Update<T> = T | ((current: T) => T);
export type SonimAttachment = AssistantAttachment & { previewUri: string };
interface Data {
  owner: string;
  conversationId: string;
  messages: SonimChatMessage[];
  draft: string;
  attachments: SonimAttachment[];
  streamingState: AssistantState | null;
  isStreaming: boolean;
}
type Field = 'conversationId' | 'messages' | 'draft' | 'attachments' | 'streamingState' | 'isStreaming';
interface State extends Data {
  open: (owner: string) => void;
  update: <K extends Field>(owner: string, key: K, value: Update<Data[K]>) => void;
  clear: () => void;
}
const empty = (owner = ''): Data => ({
  owner, conversationId: owner ? newAssistantConversationId() : '', messages: [], draft: '',
  attachments: [], streamingState: null, isStreaming: false,
});

/** Memory only, one identity at a time. Never persisted to device storage. */
export const useSonimSession = create<State>((set) => ({
  ...empty(),
  open: (owner) => set((state) => state.owner === owner ? state : empty(owner)),
  update: (owner, key, value) => set((state) => {
    if (!owner || state.owner !== owner) return state;
    const next = typeof value === 'function' ? (value as (current: Data[typeof key]) => Data[typeof key])(state[key]) : value;
    return { [key]: next } as Pick<Data, typeof key>;
  }),
  clear: () => set(empty()),
}));

/** Clears private conversation data when the account signs out. */
export const clearSonimSession = () => useSonimSession.getState().clear();
