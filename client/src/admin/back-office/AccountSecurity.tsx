/**
 * Sécurité du compte — double authentification (TOTP) de la console, 12/11/2026.
 *
 * Ouvert depuis le menu du profil, accessible à TOUS les rôles (chacun protège son
 * propre compte). Trois états :
 *  • inactive → mot de passe → clé + lien `otpauth://` → code → 8 codes de secours ;
 *  • active   → régénérer les codes de secours, ou désactiver (mot de passe + code) ;
 *  • chaque écriture passe par `adminApi` (session + CSRF) et le serveur l'audite.
 *
 * Pas de QR code dessiné ici (aucune dépendance ajoutée) : la clé s'ajoute dans
 * l'application d'authentification par « Saisir une clé », et le lien `otpauth://`
 * s'ouvre directement sur un téléphone.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Button, Field, Modal } from '../components';

type Status = { enabled: boolean; pending: boolean; recoveryRemaining: number };
type Stage = 'idle' | 'password' | 'verify' | 'codes' | 'disable' | 'regenerate';

/** Clé lisible : groupes de 4 caractères. */
export function groupSecret(secret: string): string {
  return String(secret || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export const AccountSecurity: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setStatus((await adminApi<{ data: Status }>('/auth/2fa')).data); }
    catch (reason: any) { setError(reason?.message || 'Lecture impossible.'); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStage('idle'); setPassword(''); setCode(''); setSetup(null); setCodes([]); setError('');
    void load();
  }, [load, open]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); } catch (reason: any) { setError(reason?.message || 'Opération impossible.'); } finally { setBusy(false); }
  };

  const post = <T,>(path: string, body: Record<string, string>) =>
    adminApi<{ data: T }>(path, { method: 'POST', body: JSON.stringify(body) }).then((result) => result.data);

  const startSetup = () => run(async () => {
    setSetup(await post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { password }));
    setPassword(''); setCode(''); setStage('verify');
  });
  const enable = () => run(async () => {
    const result = await post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code });
    setCodes(result.recoveryCodes); setSetup(null); setCode(''); setStage('codes'); await load();
  });
  const disable = () => run(async () => {
    await post('/auth/2fa/disable', { password, code });
    setPassword(''); setCode(''); setStage('idle'); await load();
  });
  const regenerate = () => run(async () => {
    const result = await post<{ recoveryCodes: string[] }>('/auth/2fa/recovery', { password, code });
    setCodes(result.recoveryCodes); setPassword(''); setCode(''); setStage('codes'); await load();
  });

  const copyCodes = () => { void navigator.clipboard?.writeText(codes.join('\n')).catch(() => undefined); };

  const passwordField = (
    <Field label="Mot de passe actuel" required full>
      <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    </Field>
  );
  const codeField = (hint: string) => (
    <Field label="Code de vérification" hint={hint} required full>
      <input value={code} autoComplete="one-time-code" maxLength={12} placeholder="123 456" onChange={(event) => setCode(event.target.value)} required data-testid="account-security-code" />
    </Field>
  );

  return (
    <Modal open={open} onClose={onClose} title="Sécurité du compte" eyebrow="DOUBLE AUTHENTIFICATION">
      <div className="admin-form" data-testid="account-security">
        {!status && !error && <p>Chargement…</p>}
        {status && stage === 'idle' && (
          <>
            <p data-testid="account-security-state">
              {status.enabled
                ? <>Double authentification <b>active</b> · {status.recoveryRemaining} code(s) de secours restant(s).</>
                : <>Double authentification <b>inactive</b> : un mot de passe seul ouvre ce compte.</>}
            </p>
            {status.enabled ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => setStage('regenerate')}>Nouveaux codes de secours</Button>
                <Button variant="ghost" onClick={() => setStage('disable')}>Désactiver</Button>
              </div>
            ) : (
              <Button onClick={() => setStage('password')}>Activer la double authentification</Button>
            )}
          </>
        )}
        {stage === 'password' && (
          <form onSubmit={(event) => { event.preventDefault(); void startSetup(); }}>
            <p>Confirmez votre mot de passe pour générer la clé.</p>
            {passwordField}
            <Button busy={busy} type="submit">Continuer</Button>
          </form>
        )}
        {stage === 'verify' && setup && (
          <form onSubmit={(event) => { event.preventDefault(); void enable(); }}>
            <ol>
              <li>Dans Google Authenticator, Microsoft Authenticator, 1Password ou Aegis : « Ajouter » → « Saisir une clé ».</li>
              <li>Clé : <code data-testid="account-security-secret" style={{ userSelect: 'all' }}>{groupSecret(setup.secret)}</code> (type « basé sur le temps »).</li>
              <li>Sur téléphone, ce lien l’ajoute directement : <a href={setup.otpauthUrl}>ouvrir dans l’application</a>.</li>
            </ol>
            {codeField('Le code à 6 chiffres affiché par l’application.')}
            <Button busy={busy} type="submit">Activer</Button>
          </form>
        )}
        {stage === 'codes' && (
          <>
            <p><b>Codes de secours</b> — chacun ne sert qu’une fois, si le téléphone est perdu. Ils ne seront plus affichés.</p>
            <pre data-testid="account-security-recovery" style={{ userSelect: 'all' }}>{codes.join('\n')}</pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={copyCodes}>Copier</Button>
              <Button onClick={() => setStage('idle')}>J’ai noté mes codes</Button>
            </div>
          </>
        )}
        {(stage === 'disable' || stage === 'regenerate') && (
          <form onSubmit={(event) => { event.preventDefault(); void (stage === 'disable' ? disable() : regenerate()); }}>
            {passwordField}
            {codeField('Code de l’application, ou un code de secours.')}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button busy={busy} type="submit">{stage === 'disable' ? 'Désactiver' : 'Générer'}</Button>
              <Button variant="ghost" type="button" onClick={() => setStage('idle')}>Annuler</Button>
            </div>
          </form>
        )}
        {error && <div className="admin-login-error" role="alert">{error}</div>}
      </div>
    </Modal>
  );
};
