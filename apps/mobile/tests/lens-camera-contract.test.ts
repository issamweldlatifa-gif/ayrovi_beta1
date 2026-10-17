import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('contrat caméra Android Lens', () => {
  it('attend onCameraReady et verrouille la capture sur les deux écrans', () => {
    const lens = read('../app/lens.tsx');
    const ocerex = read('../src/features/lens/ocerex/OcerexFlow.tsx');

    for (const source of [lens, ocerex]) {
      expect(source).toContain('onCameraReady=');
      expect(source).toContain('cameraReady');
      expect(source).not.toContain('skipProcessing: true');
    }
    expect(lens).toContain('photoLock.current');
    expect(ocerex).toContain('captureLock.current');
    expect(lens).toContain('CAMERA_CAPTURE_FAILED');
  });

  it('envoie caméra et galerie avec le multipart natif, pas un FormData URI', () => {
    const lensApi = read('../src/api/lens.ts');
    const ocerexApi = read('../src/api/ocerex.ts');

    expect(lensApi).toContain("apiUploadFileData<unknown>(`${LENS_BASE}/analyze-image`");
    expect(ocerexApi).toContain("apiUploadFileData<unknown>(`${OCEREX_BASE}/analyze`");
    expect(lensApi).not.toContain("form.append('image'");
    expect(ocerexApi).not.toContain("form.append('image'");
  });
});
