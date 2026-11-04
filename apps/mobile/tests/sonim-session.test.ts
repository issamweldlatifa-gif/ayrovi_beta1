import { afterEach, describe, expect, it } from 'vitest';
import { clearSonimSession, useSonimSession } from '../src/features/sonim/sonimSession';

describe('Sonim in-memory session', () => {
  afterEach(clearSonimSession);

  it('retains the same identity and replaces data on identity change', () => {
    const state = useSonimSession.getState();
    state.open('session:account:a');
    state.update('session:account:a', 'draft', 'private');
    state.update('session:account:a', 'attachments', [{ id: '1', type: 'image', dataUrl: 'data:image/jpeg;base64,AAAA', previewUri: 'file://image' }]);
    const conversation = useSonimSession.getState().conversationId;
    state.open('session:account:a');
    expect(useSonimSession.getState().draft).toBe('private');
    expect(useSonimSession.getState().conversationId).toBe(conversation);
    state.open('session:account:b');
    expect(useSonimSession.getState().draft).toBe('');
    expect(useSonimSession.getState().attachments).toEqual([]);
    expect(useSonimSession.getState().conversationId).not.toBe(conversation);
    state.update('session:account:a', 'draft', 'late response');
    expect(useSonimSession.getState().draft).toBe('');
  });

  it('clears all private data and rejects updates after sign-out', () => {
    const state = useSonimSession.getState();
    state.open('session:guest');
    state.update('session:guest', 'draft', 'secret');
    clearSonimSession();
    state.update('session:guest', 'draft', 'late response');
    expect(useSonimSession.getState().owner).toBe('');
    expect(useSonimSession.getState().draft).toBe('');
  });
});
