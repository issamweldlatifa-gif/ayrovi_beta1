import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { androidObserverEnvelope, ANDROID_OBSERVER_ENVELOPE_PREFIX } from '../src/features/aywebs/networkObservers/androidEnvelope';
import { AMAZON_NETWORK_OBSERVER_SCRIPT } from '../src/features/aywebs/networkObservers/amazon';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '../src/features/aywebs/networkObserverScript';

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'aywebs-native-test-')); temporary.push(dir);
  const real = resolve('node_modules/react-native-webview');
  cpSync(join(real, 'package.json'), join(dir, 'package.json'));
  cpSync(join(real, 'android'), join(dir, 'android'), { recursive: true });
  return dir;
}
function patch(dir: string) {
  return execFileSync(process.execPath, [resolve('scripts/experimental/patch-android-observer.cjs'), dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('experimental Android native single-script transport', () => {
  it('encodes independent scripts as data, not a combined executable script', () => {
    const payload = androidObserverEnvelope();
    expect(payload.startsWith(ANDROID_OBSERVER_ENVELOPE_PREFIX)).toBe(true);
    const data = JSON.parse(payload.slice(ANDROID_OBSERVER_ENVELOPE_PREFIX.length));
    expect(data.amazonScript).toBe(AMAZON_NETWORK_OBSERVER_SCRIPT);
    expect(data.legacyScript).toBe(AYWEBS_NETWORK_OBSERVER_SCRIPT);
    expect(data.amazonScript).not.toContain(data.legacyScript);
    expect(data.amazonDomains).toContain('amazon.fr');
  });
  it('patches an isolated native source copy and is idempotent', () => {
    const dir = fixture();
    expect(patch(dir)).toContain('patch applied');
    const source = readFileSync(join(dir, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java'), 'utf8');
    const client = readFileSync(join(dir, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java'), 'utf8');
    expect(client).toContain('callInjectedJavaScriptBeforeContentLoaded(url)');
    expect(source).toContain('aywebsObserverForPage(injectedJSBeforeContentLoaded, pageUrl)');
    expect(source).toContain('if (!source.startsWith("AYWEBS_OBSERVER_V1:")) return source;');
    expect(source).toContain('evaluateJavascriptWithFallback("(function() {\\n" + selected');
    expect(patch(dir)).toContain('already applied');
  });
  it('fails closed on changed native source without partially patching the client', () => {
    const dir = fixture();
    const client = join(dir, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java');
    const web = join(dir, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java');
    const beforeClient = readFileSync(client, 'utf8');
    const changedWeb = readFileSync(web, 'utf8').replace('public void callInjectedJavaScriptBeforeContentLoaded()', 'public void upstreamChanged()');
    writeFileSync(web, changedWeb);
    expect(() => patch(dir)).toThrow();
    expect(readFileSync(client, 'utf8')).toBe(beforeClient);
    expect(readFileSync(web, 'utf8')).toBe(changedWeb);
  });
  it('refuses unsupported versions without changing native files', () => {
    const dir = fixture();
    const pkg = join(dir, 'package.json');
    const original = JSON.parse(readFileSync(pkg, 'utf8')); original.version = '999.0.0';
    writeFileSync(pkg, JSON.stringify(original));
    const web = join(dir, 'android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java');
    const originalSource = readFileSync(web, 'utf8');
    expect(() => patch(dir)).toThrow();
    expect(readFileSync(web, 'utf8')).toBe(originalSource);
  });
});
