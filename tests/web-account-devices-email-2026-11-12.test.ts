import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'client/src/components/account/AccountSettings.tsx'), 'utf8');

describe('Web — page Sécurité : appareils connectés et confirmation de l’adresse (12/11/2026)', () => {
  it('liste les appareils, en ferme un, ou ferme tous les autres sans toucher à la session courante', () => {
    expect(source).toContain("'/api/customer/account/sessions'");
    expect(source).toMatch(/\/api\/customer\/account\/sessions\/\$\{encodeURIComponent\(handle\)\}`,\{method:'DELETE'\},session\.csrfToken/);
    expect(source).toMatch(/'\/api\/customer\/auth\/logout-all',\{method:'POST',body:JSON\.stringify\(\{includeCurrent:false\}\)\},session\.csrfToken/);
    expect(source).toContain('{!row.current&&<button');
  });

  it('confirme l’adresse par un code saisi dans la session, seulement si elle n’est pas encore confirmée', () => {
    expect(source).toContain('{!summary.emailVerified&&session.account?.email&&<EmailConfirmPanel');
    expect(source).toContain("'/api/customer/account/email/verification/request'");
    expect(source).toContain("'/api/customer/account/email/verification/confirm'");
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain('challengeId:challenge.id,code,locale');
  });
});
