import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildAyWebsCaptureScript, AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { ZALANDO_MOBILE_CAPTURE_SCRIPT } from '../src/aywebs/storeScripts/zalando';

function run(url: string): unknown {
  const dom = new JSDOM('<html><head><title>Coat</title></head><body><h1>Coat</h1></body></html>', { url, runScripts: 'outside-only' });
  try { const result = dom.window.eval(ZALANDO_MOBILE_CAPTURE_SCRIPT); return result === null ? null : JSON.parse(String(result)); }
  finally { dom.window.close(); }
}

describe('Zalando independent capture reader', () => {
  it('serves its own bundle rather than Amazon or the legacy core', () => {
    expect(buildAyWebsCaptureScript('zalando')).toBe(ZALANDO_MOBILE_CAPTURE_SCRIPT);
    expect(ZALANDO_MOBILE_CAPTURE_SCRIPT).not.toBe(AYWEBS_CAPTURE_SCRIPT);
    expect(ZALANDO_MOBILE_CAPTURE_SCRIPT).not.toBe(buildAyWebsCaptureScript('amazon'));
    expect(ZALANDO_MOBILE_CAPTURE_SCRIPT).not.toMatch(/IS_AMAZON|IS_SHEIN|IS_TEMU|IS_ALIEXPRESS/);
  });
  it('accepts recognized Zalando desktop and mobile hosts, reports its own version', () => {
    for (const host of ['www.zalando.fr', 'm.zalando.fr', 'www.zalando.de']) {
      expect(run(`https://${host}/example-ni315d0a2-a11.html`)).toMatchObject({ reader: { id: 'zalando', version: 2 } });
    }
  });
  it('refuses other merchants and deceptive host names', () => {
    for (const host of ['amazon.fr', 'shein.com', 'zalando.fr.evil.test', 'fakezalando.fr']) {
      expect(run(`https://${host}/example`)).toBeNull();
    }
  });
});
