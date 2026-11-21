import { afterEach, expect, it, vi } from 'vitest';
import { fetchZayroviHighlights } from '../src/api/zayroviHighlights';

vi.mock('../src/state/session', () => ({ useSession: () => ({ status: 'signedOut' }) }));

const response = (body: object) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

it('reads eligible selection payloads and the explicit CRM off switch, including older envelopes', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ success: true, data: [{ id: 'reel-1', video_url: '/media/video.mp4' }] }))
    .mockResolvedValueOnce(response({ success: true, data: [], highlightsEnabled: false }));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchZayroviHighlights()).resolves.toMatchObject({ enabled: true, reels: [{ id: 'reel-1' }] });
  await expect(fetchZayroviHighlights()).resolves.toEqual({ enabled: false, reels: [] });
});
