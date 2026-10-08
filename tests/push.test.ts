/**
 * Notifications push — ce que ces tests tiennent.
 *
 * Le point sensible n'est pas « est-ce que ça envoie » (on ne peut pas appeler
 * Firebase depuis un test), c'est « est-ce que ça ment ». Un répartiteur qui
 * annonce `sent` sans avoir envoyé, qui pousse deux fois la même commande, ou
 * qui réessaie éternellement un appareil disparu, sont trois pannes invisibles
 * en développement et insupportables en production. Elles sont testées ici.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { QatafoDatabase } from '../src/db/database';
import {
  buildFcmAssertion, fcmMessageBody, normalizePrivateKey, pushConfigured, resetPushTokenCache,
  sendFcmNotification, type FetchImpl,
} from '../src/services/push';
import {
  attachDevicesToAccount, dispatchPushNotifications, pendingPushTargets, registerPushDevice, revokePushDevice,
} from '../src/services/pushDispatch';

const databases: QatafoDatabase[] = [];
const freshDb = () => {
  const db = new QatafoDatabase(':memory:');
  databases.push(db);
  return db;
};
afterEach(() => {
  resetPushTokenCache();
  while (databases.length) databases.pop()!.close?.();
});

/* ── Configuration ─────────────────────────────────────────────────────────── */

describe('clé privée', () => {
  it('rétablit les \\n littéraux des variables d’environnement', () => {
    expect(normalizePrivateKey('-----BEGIN A\\nMIIB\\n-----END')).toBe('-----BEGIN A\nMIIB\n-----END');
  });

  it('ne touche pas une clé déjà sur plusieurs lignes', () => {
    const key = '-----BEGIN A\nMIIB\n-----END';
    expect(normalizePrivateKey(key)).toBe(key);
  });

  it('vide ⇒ vide', () => {
    expect(normalizePrivateKey('')).toBe('');
    expect(normalizePrivateKey(undefined as unknown as string)).toBe('');
  });
});

describe('configuration', () => {
  it('incomplète ⇒ non configuré (et on n’enverra rien)', () => {
    expect(pushConfigured({ projectId: '', clientEmail: '', privateKey: '' })).toBe(false);
    expect(pushConfigured({ projectId: 'p', clientEmail: 'c@x', privateKey: '' })).toBe(false);
  });

  it('complète ⇒ configuré', () => {
    expect(pushConfigured({
      projectId: 'ayrovi',
      clientEmail: 'sa@ayrovi.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----',
    })).toBe(true);
  });
});

/* ── Assertion JWT ─────────────────────────────────────────────────────────── */

describe('assertion JWT', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it('a trois segments signés en RS256', () => {
    const jwt = buildFcmAssertion({ clientEmail: 'sa@ayrovi.iam', privateKey: pem }, Date.now());
    const [header, claims, signature] = jwt.split('.');
    expect(signature).toBeTruthy();
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toMatchObject({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({
      iss: 'sa@ayrovi.iam',
      aud: 'https://oauth2.googleapis.com/token',
    });
  });

  it('la signature SE VÉRIFIE avec la clé publique — sinon Google la refuse', () => {
    const jwt = buildFcmAssertion({ clientEmail: 'sa@ayrovi.iam', privateKey: pem }, Date.now());
    const [header, claims, signature] = jwt.split('.');
    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
  });

  it('demande la bonne portée et expire dans une heure', () => {
    const now = Date.now();
    const claims = JSON.parse(Buffer.from(buildFcmAssertion({ clientEmail: 'a@b', privateKey: pem }, now).split('.')[1]!, 'base64url').toString());
    expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

/* ── Corps du message ──────────────────────────────────────────────────────── */

describe('corps du message', () => {
  it('FCM n’accepte que des CHAÎNES : un nombre est converti', () => {
    const body: any = fcmMessageBody('tok', { title: 'T', body: 'B', data: { count: 42 as unknown as string } });
    expect(body.message.data.count).toBe('42');
  });

  it('priorité haute et canal Android', () => {
    const body: any = fcmMessageBody('tok', { title: 'T', body: 'B' });
    expect(body.message.android.priority).toBe('HIGH');
    expect(body.message.android.notification.channelId).toBe('ayrovi-default');
  });

  it('tronque au lieu de faire refuser tout le message', () => {
    const body: any = fcmMessageBody('tok', { title: 'T'.repeat(500), body: 'B'.repeat(5000) });
    expect(body.message.notification.title.length).toBe(200);
    expect(body.message.notification.body.length).toBe(1000);
  });
});

/* ── Envoi ─────────────────────────────────────────────────────────────────── */

const config = {
  projectId: 'ayrovi',
  clientEmail: 'sa@ayrovi.iam',
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('envoi', () => {
  it('non configuré ⇒ « failed », et SURTOUT pas « sent »', () => {
    return expect(sendFcmNotification('tok', { title: 'T', body: 'B' }, { config: { projectId: '', clientEmail: '', privateKey: '' } }))
      .resolves.toMatchObject({ status: 'failed' });
  });

  it('jeton vide ⇒ « invalid », sans appel réseau', async () => {
    const fetchImpl = (() => { throw new Error('ne doit pas être appelé'); }) as unknown as FetchImpl;
    await expect(sendFcmNotification('', { title: 'T', body: 'B' }, { config, fetchImpl }))
      .resolves.toMatchObject({ status: 'invalid' });
  });

  it('200 ⇒ « sent »', async () => {
    const fetchImpl: FetchImpl = async (url) => (url.includes('oauth2')
      ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'AT', expires_in: 3600 }), json: async () => ({ access_token: 'AT', expires_in: 3600 }) }
      : { ok: true, status: 200, text: async () => '{"name":"projects/x/messages/1"}', json: async () => ({}) });
    await expect(sendFcmNotification('tok', { title: 'T', body: 'B' }, { config, fetchImpl }))
      .resolves.toMatchObject({ status: 'sent' });
  });

  it('appareil disparu ⇒ « invalid » (et non « failed » : c’est un fait exploitable)', async () => {
    const fetchImpl: FetchImpl = async (url) => (url.includes('oauth2')
      ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'AT', expires_in: 3600 }), json: async () => ({ access_token: 'AT', expires_in: 3600 }) }
      : { ok: false, status: 404, text: async () => 'UNREGISTERED', json: async () => ({}) });
    await expect(sendFcmNotification('tok', { title: 'T', body: 'B' }, { config, fetchImpl }))
      .resolves.toMatchObject({ status: 'invalid' });
  });

  it('panne réseau ⇒ « failed », et NE JETTE JAMAIS (une commande ne doit pas échouer pour ça)', async () => {
    const fetchImpl: FetchImpl = async () => { throw new Error('timeout'); };
    await expect(sendFcmNotification('tok', { title: 'T', body: 'B' }, { config, fetchImpl }))
      .resolves.toMatchObject({ status: 'failed' });
  });
});

/* ── Répartiteur ───────────────────────────────────────────────────────────── */

const account = (db: QatafoDatabase, id = 'acc_1') => {
  const now = new Date().toISOString();
  db.run(`INSERT OR IGNORE INTO customer_accounts
    (id,display_name,email,phone,email_verified_at,phone_verified_at,locale,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?, 'fr-TN', 'ACTIVE', ?, ?)`,
    id, 'Test', `${id}@x.tn`, `2${String(id).length}000000`.slice(0, 8), now, now, now, now);
  return id;
};

const notify = (db: QatafoDatabase, accountId: string, id: string, at: string) => {
  db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
    VALUES (?,?, 'ORDER', 'Titre', 'Message', '/orders/1', ?)`, id, accountId, at);
};

describe('répartiteur', () => {
  it('non configuré ⇒ on ne prétend rien envoyer', async () => {
    const db = freshDb();
    account(db);
    const device = registerPushDevice(db, { token: 't1', accountId: 'acc_1' });
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    const summary = await dispatchPushNotifications(db, { config: { projectId: '', clientEmail: '', privateKey: '' } });
    expect(summary.skipped).toBe('PUSH_NOT_CONFIGURED');
    expect(summary.sent).toBe(0);
    expect(db.get('SELECT COUNT(*) AS n FROM customer_push_dispatched WHERE device_id=?', device)?.n).toBe(0);
  });

  it('cible les notifications d’un compte, dans l’ordre de création', () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 't1', accountId: 'acc_1' });
    notify(db, 'acc_1', 'n_new', '2026-10-08T10:02:00.000Z');
    notify(db, 'acc_1', 'n_old', '2026-10-08T10:01:00.000Z');
    // Une commande expédiée aujourd’hui passe AVANT celle d’hier.
    expect(pendingPushTargets(db).map((target) => target.notificationId)).toEqual(['n_old', 'n_new']);
  });

  it('ignore un appareil DÉSACTIVÉ (déconnexion, réglage coupé)', () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 't1', accountId: 'acc_1' });
    revokePushDevice(db, 't1');
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    expect(pendingPushTargets(db)).toHaveLength(0);
  });

  it('ignore un appareil sans compte : on ne pousse pas à un inconnu', () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 'anonyme' });
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    expect(pendingPushTargets(db)).toHaveLength(0);
  });

  it('UNE SEULE FOIS par appareil : jamais deux fois la même notification', async () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 't1', accountId: 'acc_1' });
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    const fetchImpl: FetchImpl = async (url) => (url.includes('oauth2')
      ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'AT', expires_in: 3600 }), json: async () => ({ access_token: 'AT', expires_in: 3600 }) }
      : { ok: true, status: 200, text: async () => '{}', json: async () => ({}) });

    const first = await dispatchPushNotifications(db, { config, fetchImpl });
    expect(first.sent).toBe(1);
    // Second passage : la notification est déjà partie, on ne la repousse pas.
    const second = await dispatchPushNotifications(db, { config, fetchImpl });
    expect(second.sent).toBe(0);
    expect(pendingPushTargets(db)).toHaveLength(0);
  });

  it('appareil disparu ⇒ DÉSACTIVÉ, pour ne pas réessayer à chaque passage', async () => {
    const db = freshDb();
    account(db);
    const device = registerPushDevice(db, { token: 't1', accountId: 'acc_1' });
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    const fetchImpl: FetchImpl = async (url) => (url.includes('oauth2')
      ? { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'AT', expires_in: 3600 }), json: async () => ({ access_token: 'AT', expires_in: 3600 }) }
      : { ok: false, status: 404, text: async () => 'UNREGISTERED', json: async () => ({}) });

    const summary = await dispatchPushNotifications(db, { config, fetchImpl });
    expect(summary.invalid).toBe(1);
    expect(db.get('SELECT enabled FROM customer_push_devices WHERE id=?', device)?.enabled).toBe(0);
  });

  it('inscrire deux fois le même jeton MET À JOUR au lieu de dupliquer', () => {
    const db = freshDb();
    const first = registerPushDevice(db, { token: 't1' });
    const second = registerPushDevice(db, { token: 't1' });
    expect(second).toBe(first);
    expect(db.all('SELECT id FROM customer_push_devices').length).toBe(1);
  });

  it('rattache les appareils d’une session au compte (commande de visiteur)', () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 't1', sessionId: 'sess_1' });
    expect(attachDevicesToAccount(db, 'sess_1', 'acc_1')).toBe(1);
    expect(db.get('SELECT account_id FROM customer_push_devices WHERE token=?', 't1')?.account_id).toBe('acc_1');
  });

  it('un appareil DÉJÀ rattaché n’est pas écrasé par une session', () => {
    const db = freshDb();
    account(db, 'acc_keep');
    account(db, 'acc_new');
    registerPushDevice(db, { token: 't1', accountId: 'acc_keep' });
    attachDevicesToAccount(db, 'sess_1', 'acc_new');
    expect(db.get('SELECT account_id FROM customer_push_devices WHERE token=?', 't1')?.account_id).toBe('acc_keep');
  });

  it('iOS est enregistré mais NON ciblé : FCM v1 ne délivre pas un jeton APNs', () => {
    const db = freshDb();
    account(db);
    registerPushDevice(db, { token: 'apns-token', platform: 'ios', accountId: 'acc_1' });
    notify(db, 'acc_1', 'n1', new Date().toISOString());
    expect(pendingPushTargets(db)).toHaveLength(0);
  });

  it('refuse un jeton vide plutôt que d’enregistrer une ligne inutilisable', () => {
    const db = freshDb();
    expect(() => registerPushDevice(db, { token: '   ' })).toThrow();
  });
});
