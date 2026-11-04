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

// One active generation across the tab and any root-stack Sonim screen.
let activeGeneration: { owner: string; cancel: () => void } | null = null;
export function claimSonimGeneration(owner: string, cancel: () => void): boolean {
  if (!owner || activeGeneration) return false;
  activeGeneration = { owner, cancel };
  return true;
}
export function cancelSonimGeneration(owner: string): void {
  if (activeGeneration?.owner !== owner) return;
  const cancel = activeGeneration.cancel;
  activeGeneration = null;
  cancel();
}
export function releaseSonimGeneration(owner: string, cancel: () => void): void {
  if (activeGeneration?.owner === owner && activeGeneration.cancel === cancel) activeGeneration = null;
}

/** Memory only, one identity at a time. Never persisted to device storage. */
export const useSonimSession = create<State>((set, get) => ({
  ...empty(),
  open: (owner) => {
    const previous = get().owner;
    if (previous === owner) return;
    cancelSonimGeneration(previous);
    set(empty(owner));
  },
  update: (owner, key, value) => set((state) => {
    if (!owner || state.owner !== owner) return state;
    const next = typeof value === 'function' ? (value as (current: Data[typeof key]) => Data[typeof key])(state[key]) : value;
    return { [key]: next } as Pick<Data, typeof key>;
  }),
  clear: () => { cancelSonimGeneration(get().owner); set(empty()); },
}));

/** Clears private conversation data when the account signs out. */
export const clearSonimSession = () => useSonimSession.getState().clear();
