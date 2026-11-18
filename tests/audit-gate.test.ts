import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const WORKFLOWS = ['ci.yml', 'mobile-android.yml', 'mobile.yml', 'security-review.yml'].map((f) => `.github/workflows/${f}`);

describe('dependency audit gate', () => {
  it('every workflow audits through scripts/audit-gate.mjs (never a raw npm audit that an unpatched advisory can wedge, never no audit)', () => {
    for (const file of WORKFLOWS) {
      const yml = read(file);
      expect(yml, file).not.toMatch(/npm audit\b/);
      expect(yml, file).toMatch(/node (\.\.\/\.\.\/)?scripts\/audit-gate\.mjs/);
    }
  });

  it('the gate blocks high and critical, and checks id, package, range and expiry of each exception', () => {
    const src = read('scripts/audit-gate.mjs');
    expect(src).toContain("new Set(['high', 'critical'])");
    expect(src).toMatch(/a\.id === adv\.id && a\.package === adv\.package/);
    expect(src).toMatch(/entry\.range !== adv\.range/);
    expect(src).toMatch(/entry\.expires < today/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it('allowlist entries are reviewed, justified and expire within 90 days', () => {
    const { advisories } = JSON.parse(read('security/audit-allowlist.json')) as {
      advisories: Array<Record<string, string>>;
    };
    for (const a of advisories) {
      expect(a.id).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(a.package).toBeTruthy();
      expect(a.range).toBeTruthy();
      expect(a.reason.length).toBeGreaterThan(80);
      const reviewed = Date.parse(a.reviewed);
      const expires = Date.parse(a.expires);
      expect(Number.isFinite(reviewed) && Number.isFinite(expires)).toBe(true);
      expect(expires).toBeGreaterThan(reviewed);
      expect((expires - reviewed) / 86_400_000).toBeLessThanOrEqual(90);
    }
  });
});
