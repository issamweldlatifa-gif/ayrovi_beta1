import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGetData, apiSend } from '../src/api/client';
import { fetchPublicationLook, savePublicationLook } from '../src/api/referencePublications';

vi.mock('../src/api/client', () => ({ apiGetData: vi.fn(), apiSend: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const video = (id: string, width = 720, height = 1280) => ({
  id, saved: 1, media_json: [{ type: 'video', url: '/media/look.mp4', width, height }],
  products: [{ id: 'sku', name: 'Veste', price: 75 }],
});

describe('publication look', () => {
  it('reads just the requested ID using the normal public-feed visibility and parses its linked products', async () => {
    vi.mocked(apiGetData).mockResolvedValueOnce({ nextCursor: null, items: [video('elsewhere'), video('post-1')] });
    const options = { signal: new AbortController().signal };
    await expect(fetchPublicationLook('post-1', options)).resolves.toMatchObject({ id: 'post-1', saved: true, products: [{ id: 'sku' }] });
    expect(apiGetData).toHaveBeenCalledWith('/api/public/social/publication-feed?post=post-1&limit=1', options);
  });
  it('does not load invalid IDs and supports panoramic video, but only in the editorial flow', async () => {
    await expect(fetchPublicationLook('../foo')).resolves.toBeNull();
    expect(apiGetData).not.toHaveBeenCalled();
    vi.mocked(apiGetData).mockResolvedValueOnce({ nextCursor: null, items: [video('post-1', 1280, 720)] });
    await expect(fetchPublicationLook('post-1')).resolves.toMatchObject({ layout: 'video-panoramic' });
    vi.mocked(apiGetData).mockResolvedValueOnce({ nextCursor: null, items: [{ ...video('post-1'), template_id: 'campaign_red' }] });
    await expect(fetchPublicationLook('post-1')).resolves.toBeNull();
  });
  it('uses the account preference endpoint and only reports a confirmed save', async () => {
    vi.mocked(apiSend).mockResolvedValueOnce({ data: { saved: true } } as Awaited<ReturnType<typeof apiSend>>);
    await expect(savePublicationLook('post-1', true)).resolves.toBe(true);
    expect(apiSend).toHaveBeenCalledWith('PUT', '/api/public/social/publications/post-1/preferences', { body: { saved: true } });
    vi.mocked(apiSend).mockResolvedValueOnce({ data: { saved: false } } as Awaited<ReturnType<typeof apiSend>>);
    await expect(savePublicationLook('post-1', true)).rejects.toThrow('Unconfirmed');
  });
});
