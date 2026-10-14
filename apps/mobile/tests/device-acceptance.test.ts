import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEMO_PACKAGE,
  declaredDemoFingerprint,
  parseAdbDevices,
  parseDomainVerificationStates,
  parseResolvedPackage,
  validateAssetLinks,
} from '../scripts/device-acceptance.mjs';

const EXPECTED_SHA256 = '8E:20:AB:BB:68:D8:AE:88:21:C6:08:A5:77:C7:DB:CD:97:80:66:B2:86:7C:D5:BF:84:7B:3C:2E:5D:A1:52:53';

describe('قبول Android على جهاز حقيقي — parsers بلا جهاز', () => {
  it('يميز جهازاً مصرحاً به من offline/unauthorized', () => {
    expect(parseAdbDevices(`List of devices attached
emulator-5554\tdevice product:sdk model:Pixel
R58M123\tunauthorized usb:1-2
old-phone\toffline
`)).toEqual([
      { serial: 'emulator-5554', state: 'device' },
      { serial: 'R58M123', state: 'unauthorized' },
      { serial: 'old-phone', state: 'offline' },
    ]);
  });

  it('يقرا حالة النطاق من pm get-app-links', () => {
    const states = parseDomainVerificationStates(`
  app.ayrovi.mobile.demo:
    ID: 1234
    Signatures: [8e20]
    Domain verification state:
      ayrovi.tn: legacy_failure
      ayrovi-beta1-moo8.onrender.com: verified
`);
    expect(states).toEqual({
      'ayrovi.tn': 'legacy_failure',
      'ayrovi-beta1-moo8.onrender.com': 'verified',
    });
  });

  it('يعرف الحزمة اللي اختارها resolver وما يقبلش Android Chooser', () => {
    expect(parseResolvedPackage('app.ayrovi.mobile.demo/.MainActivity')).toBe(DEMO_PACKAGE);
    expect(parseResolvedPackage('android/com.android.internal.app.ResolverActivity')).toBe('android');
    expect(parseResolvedPackage('No activity found')).toBeNull();
  });

  it('يتطلب package الديمو والبصمة المطابقة في نفس البيان', () => {
    const document = [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: DEMO_PACKAGE,
        sha256_cert_fingerprints: [EXPECTED_SHA256.toLowerCase()],
      },
    }];
    expect(validateAssetLinks(document, DEMO_PACKAGE, EXPECTED_SHA256).ok).toBe(true);
    expect(validateAssetLinks(document, 'app.ayrovi.mobile', EXPECTED_SHA256)).toMatchObject({ ok: false });
    expect(validateAssetLinks(document, DEMO_PACKAGE, `AA:${EXPECTED_SHA256.slice(3)}`)).toMatchObject({ ok: false });
    expect(validateAssetLinks({}, DEMO_PACKAGE, EXPECTED_SHA256)).toMatchObject({ ok: false });
  });

  it('البصمة اللي يفحصها السكريبت هي نفسها عقد الخادم المعلن', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../shared/appLinks.ts', import.meta.url)), 'utf8');
    expect(declaredDemoFingerprint(source)).toBe(EXPECTED_SHA256);
  });
});
