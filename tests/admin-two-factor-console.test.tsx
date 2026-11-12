/**
 * Double authentification — côté console (12/11/2026).
 * Le parcours HTTP est couvert par `admin-two-factor.test.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupSecret } from '../client/src/admin/back-office/AccountSecurity';

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

describe('console — double authentification', () => {
  it('la connexion demande le code seulement quand le serveur l’exige', () => {
    const app = read('client/src/admin/AdminApp.tsx');
    const api = read('client/src/admin/api.ts');
    expect(api).toContain('export async function login(email: string, password: string, otp?: string)');
    expect(api).toContain('body.otp = otp.trim()');
    expect(app).toContain("reason.code === 'TOTP_REQUIRED'");
    expect(app).toContain('autoComplete="one-time-code"');
    expect(app).toContain('{otpNeeded && (');
  });

  it('« Sécurité du compte » est dans le menu du profil (tous les rôles)', () => {
    const shell = read('client/src/admin/back-office/BackOfficeShell.tsx');
    expect(shell).toContain('<AccountSecurity open={security}');
    expect(shell).toContain('data-testid="bo-account-security"');
    const security = read('client/src/admin/back-office/AccountSecurity.tsx');
    for (const endpoint of ['/auth/2fa', '/auth/2fa/setup', '/auth/2fa/enable', '/auth/2fa/disable', '/auth/2fa/recovery']) {
      expect(security).toContain(`'${endpoint}'`);
    }
  });

  it('un responsable peut lever la 2FA d’un collègue depuis Utilisateurs', () => {
    const app = read('client/src/admin/AdminApp.tsx');
    expect(app).toContain("key:'totp_enabled',label:'2FA'");
    expect(app).toContain('JSON.stringify({resetTwoFactor:true})');
  });

  it('la clé est affichée en groupes de 4', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(groupSecret('')).toBe('');
  });
});
