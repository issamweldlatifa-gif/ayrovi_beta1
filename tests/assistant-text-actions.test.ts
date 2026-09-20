import { describe, expect, it, vi } from 'vitest';
import { copyAssistantText, shareAssistantText } from '../client/src/components/assistant/messageActions';
const clipboard = () => ({ writeText: vi.fn(async (_text: string) => undefined) }) as unknown as Clipboard;
describe('SONIM displayed-text export policy', () => {
  it.each(['Premier paragraphe\n\nPrix {30 TND} https://example.test/item#size', 'نص كامل\n\nقياس ٣٠ ✅'])('copies exactly the visible AR/FR prose: %s', async text => {
    const port = { clipboard: clipboard() };
    expect(await copyAssistantText('[[OPEN_LENS]]\n'+text, port)).toBe('copied');
    expect(port.clipboard.writeText).toHaveBeenCalledWith(text);
  });
  it.each(['', '  ', '[[OPEN_LENS]]'])('does not export an empty tool-only response: %s', async text => {
    const port = { clipboard: clipboard(), share: vi.fn() };
    expect(await copyAssistantText(text, port)).toBe('empty');
    expect(await shareAssistantText(text, port)).toBe('empty');
    expect(port.share).not.toHaveBeenCalled(); expect(port.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('shares native text without touching the clipboard', async () => {
    const port = { clipboard: clipboard(), share: vi.fn(async () => {}) };
    expect(await shareAssistantText('Texte [[OPEN_LENS]]', port)).toBe('shared');
    expect(port.share).toHaveBeenCalledWith({ title: 'AYROVI', text: 'Texte' });
    expect(port.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('reports clipboard fallback explicitly when Web Share is absent', async () => {
    expect(await shareAssistantText('Texte', { clipboard: clipboard() })).toBe('copied');
  });
  it.each([['AbortError', 'cancelled'], ['NotAllowedError', 'error'], ['TypeError', 'error']])('distinguishes %s and does not silently copy', async (name, result) => {
    const port = { clipboard: clipboard(), share: vi.fn(async () => { throw { name }; }) };
    expect(await shareAssistantText('Texte', port)).toBe(result);
    expect(port.clipboard.writeText).not.toHaveBeenCalled();
  });
  it('handles missing APIs and clipboard permission failures honestly', async () => {
    expect(await copyAssistantText('Texte', {})).toBe('unavailable');
    expect(await shareAssistantText('Texte', {})).toBe('unavailable');
    const port = { clipboard: clipboard() }; vi.mocked(port.clipboard.writeText).mockRejectedValue(new Error('denied'));
    expect(await copyAssistantText('Texte', port)).toBe('error');
    expect(await shareAssistantText('Texte', port)).toBe('error');
  });
});
