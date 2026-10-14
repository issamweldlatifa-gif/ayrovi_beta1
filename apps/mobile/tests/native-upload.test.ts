import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiUploadFileData } from '../src/api/nativeUpload';
import { API_BASE_URL } from '../src/api/config';

const uploadMock = vi.hoisted(() => vi.fn());

vi.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class MockFile {
    uri: string;
    exists: boolean;
    size: number;
    type = 'image/jpeg';
    constructor(uri: string) {
      this.uri = uri;
      this.exists = !uri.includes('missing');
      this.size = this.exists ? 123 : 0;
    }
    upload(url: string, options: unknown) {
      return uploadMock(url, options);
    }
  },
}));

describe('upload natif des photos', () => {
  beforeEach(() => uploadMock.mockReset());

  it('envoie le file:// en multipart natif et lit l’enveloppe API', async () => {
    uploadMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, data: { eventId: 'evt-mobile' } }),
    });

    const result = await apiUploadFileData<{ eventId: string }>(
      '/api/ayrovix/analyze-image',
      'image',
      { uri: 'file:///cache/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
      { parameters: { roi: '{"x":1}' }, timeoutMs: 2_000 },
    );

    expect(result).toEqual({ eventId: 'evt-mobile' });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [url, options] = uploadMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/ayrovix/analyze-image`);
    expect(options).toMatchObject({
      httpMethod: 'POST',
      uploadType: 1,
      fieldName: 'image',
      mimeType: 'image/jpeg',
      parameters: { roi: '{"x":1}' },
      headers: expect.objectContaining({ Accept: 'application/json', 'x-ayrovi-native': '1' }),
    });
  });

  it('signale le fichier Android illisible avant le réseau avec un code précis', async () => {
    await expect(apiUploadFileData(
      '/api/ayrovix/analyze-image',
      'image',
      { uri: 'file:///cache/missing.jpg', name: 'capture.jpg', type: 'image/jpeg' },
    )).rejects.toMatchObject({ kind: 'device', code: 'IMAGE_FILE_UNREADABLE' });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('conserve le code d’un refus du serveur', async () => {
    uploadMock.mockResolvedValue({
      status: 429,
      headers: { 'Retry-After': '3' },
      body: JSON.stringify({ success: false, code: 'RATE_LIMITED', error: 'Attendez.' }),
    });
    await expect(apiUploadFileData(
      '/api/ayrovix/analyze-image',
      'image',
      { uri: 'file:///cache/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
    )).rejects.toMatchObject({ kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterMs: 3_000 });
  });
});
