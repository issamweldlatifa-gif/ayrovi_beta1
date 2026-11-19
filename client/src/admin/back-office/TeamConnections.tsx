import React, { useEffect, useState } from 'react';
import { CONNECTION_CATALOG, CONNECTED_TEAMS, type ConnectedAccess, type ConnectedTeam, type ConnectionRequest } from '../../../../shared/teamConnections';
import { Link2, ShieldCheck } from '../../components/QatafoIcons';
import { adminApi } from '../api';
import { Button, Field, Modal } from '../components';
import { useOfficeText } from './OfficeLocale';

type Envelope<T> = { data: T };
type Member = { id: string; role: string; name: string; eligible: ConnectedTeam[]; assigned: ConnectedTeam[] };

export function useConnectedAccess() {
  const [access, setAccess] = useState<ConnectedAccess>();
  useEffect(() => {
    const abort = new AbortController();
    adminApi<Envelope<ConnectedAccess>>('/connections/access', { signal: abort.signal })
      .then(response => { if (!abort.signal.aborted) setAccess(response.data); }).catch(() => { /* fail closed */ });
    return () => abort.abort();
  }, []);
  return access;
}

export function ConnectedButton({ onClick }: { onClick: () => void }) {
  const t = useOfficeText();
  return <button type="button" className="bo-connected-link" onClick={onClick}><Link2 size={16} /><span>Connected <small>{t('Outils de l’équipe', 'أدوات الفريق')}</small></span></button>;
}

export function TeamConnections({ team, access, onClose }: { team: ConnectedTeam; access: ConnectedAccess; onClose: () => void }) {
  const t = useOfficeText();
  const [rows, setRows] = useState<ConnectionRequest[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<'tools' | 'members'>('tools');
  const base = `/connections/teams/${team}`;
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError('');
    adminApi<Envelope<ConnectionRequest[]>>(base, { signal: abort.signal })
      .then(response => { if (!abort.signal.aborted) setRows(response.data); })
      .catch(reason => { if (!abort.signal.aborted) setError(reason.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [base, revision]);
  const teamName = t(CONNECTED_TEAMS[team].fr, CONNECTED_TEAMS[team].ar);
  async function change(provider: string, action: 'REQUEST' | 'APPROVE' | 'CLOSE') {
    if (busy || !access.mfa) return;
    setBusy(provider); setError('');
    try {
      await adminApi(`${base}/${provider}`, { method: 'POST', body: JSON.stringify({ action }) });
      setRevision(value => value + 1);
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(''); }
  }
  const states = {
    REQUESTED: t('Demande envoyée', 'الطلب تسجّل'), APPROVED_FOR_SETUP: t('Approuvé · non connecté', 'موافق عليه · موش مربوط'), CLOSED: t('Demande clôturée', 'الطلب تسكّر'),
  };
  return <Modal open title={`Connected — ${teamName}`} eyebrow="ZAYROVI · WORKSPACE" onClose={onClose} wide>
    <div className="admin-stack">
      <p className="admin-muted">{t('Demandez les services nécessaires au travail de votre équipe. L’approbation autorise la préparation, pas l’activation. Aucun compte externe n’est connecté depuis cet écran.', 'اطلب الأدوات اللي تحتاجها الخدمة. الموافقة تسمح بالتحضير، موش بالتفعيل. الشاشة هاذي ما تربطش الحسابات الخارجية وحدها.')}</p>
      {!access.mfa && <p className="bo-notice"><ShieldCheck size={18} />{t('Actions verrouillées : activez la 2FA dans Sécurité du compte, puis reconnectez-vous avec votre code.', 'التغيير مسكّر: فعّل التحقّق بخطوتين من أمان الحساب، وبعد عاود ادخل بالكود.')}</p>}
      {access.manage && <div className="admin-form-actions">
        <Button variant="secondary" aria-pressed={view === 'tools'} onClick={() => setView('tools')}>{t('Services', 'الخدمات')}</Button>
        <Button variant="secondary" aria-pressed={view === 'members'} onClick={() => setView('members')}>{t('Affectations', 'تعيين المكلّفين')}</Button>
      </div>}
      {view === 'members' && access.manage ? <MemberAccess team={team} mfa={access.mfa} /> : <>
        {error && <p role="alert">{error} <Button variant="ghost" onClick={() => setRevision(value => value + 1)}>{t('Actualiser', 'حدّث')}</Button></p>}
        {loading ? <p role="status">{t('Chargement…', 'جاري التحميل…')}</p> : !error && <ul className="bo-connected-grid">
          {CONNECTION_CATALOG.filter(item => item.team === team).map(item => {
            const state = rows.find(row => row.provider === item.id)?.status;
            return <li className="admin-card" key={item.id}>
              <header><Link2 size={18} /><strong>{item.name}</strong></header>
              <p className="admin-muted">{item.method}</p>
              <span className="status-badge status-badge--neutral">{state ? states[state] : t('Non connecté', 'موش مربوط')}</span>
              <div className="admin-form-actions">
                {(!state || state === 'CLOSED') && <Button variant="secondary" disabled={!access.mfa || Boolean(busy)} onClick={() => void change(item.id, 'REQUEST')}>{t('Demander le raccordement', 'اطلب الربط')}</Button>}
                {access.manage && state === 'REQUESTED' && <Button disabled={!access.mfa || Boolean(busy)} onClick={() => void change(item.id, 'APPROVE')}>{t('Approuver la préparation', 'وافق على التحضير')}</Button>}
                {access.manage && state && state !== 'CLOSED' && <Button variant="ghost" disabled={!access.mfa || Boolean(busy)} onClick={() => void change(item.id, 'CLOSE')}>{t('Clôturer', 'سكّر الطلب')}</Button>}
              </div>
            </li>;
          })}
        </ul>}
      </>}
    </div>
  </Modal>;
}

function MemberAccess({ team, mfa }: { team: ConnectedTeam; mfa: boolean }) {
  const t = useOfficeText();
  const [email, setEmail] = useState('');
  const [member, setMember] = useState<Member | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function find(event: React.FormEvent) {
    event.preventDefault();
    setMember(null); setNotice(''); setError(''); setBusy(true);
    try {
      const result = await adminApi<Envelope<Member | null>>(`/connections/members?${new URLSearchParams({ email })}`);
      setMember(result.data);
      if (!result.data) setNotice(t('Aucun compte actif et affectable trouvé.', 'ما لقيناش حساب نشط ينجم يتعيّن.'));
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function update(entry: Member, granted: boolean) {
    if (busy || !mfa) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await adminApi(`/connections/members/${encodeURIComponent(entry.id)}/${team}`, { method: 'PUT', body: JSON.stringify({ granted }) });
      setMember({ ...entry, assigned: granted ? [...entry.assigned, team] : entry.assigned.filter(value => value !== team) });
      setNotice(t('Affectation mise à jour.', 'التعيين تحدّث.'));
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack">
    <p>{t('Assignez Connected à un compte interne précis. Le rôle du compte doit déjà couvrir cette équipe.', 'عيّن Connected لحساب داخلي بعينو. الدور متاع الحساب لازم أصلاً يسمحلو يخدم مع الفريق هذا.')}</p>
    <form className="admin-stack" onSubmit={find}>
      <Field label={t('Adresse interne exacte', 'الإيميل الداخلي الكامل')}><input type="email" required maxLength={254} disabled={busy} value={email} onChange={event => { setEmail(event.target.value); setMember(null); setNotice(''); }} /></Field>
      <Button type="submit" busy={busy}>{t('Rechercher le compte', 'لوّج على الحساب')}</Button>
    </form>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {member && <div><p><strong>{member.name}</strong> · <code>{member.role}</code></p>
      {member.eligible.includes(team) ? <Button variant="secondary" disabled={!mfa || busy} onClick={() => void update(member, !member.assigned.includes(team))}>
        {member.assigned.includes(team) ? t('Retirer l’accès', 'نحّي النفاذ') : t('Affecter à cette équipe', 'عيّن للفريق هذا')}
      </Button> : <p>{t('Ce rôle ne permet pas cette affectation.', 'الدور هذا ما يسمحش بالتعيين للفريق.')}</p>}
    </div>}
  </div>;
}
