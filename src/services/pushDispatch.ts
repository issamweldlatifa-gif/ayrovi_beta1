/**
 * Répartiteur de notifications push — le lien entre « une notification écrite
 * en base » et « un téléphone qui sonne ».
 *
 * ── Pourquoi balayer la table plutôt que brancher les écritures ─────────────
 * L'envie naturelle est d'envoyer depuis `notifyCustomerAccount()`. Ce serait
 * une erreur : l'audit montre CINQ `INSERT INTO customer_notifications`
 * DIRECTS dans `src/db/database.ts` (changements de statut de commande,
 * paiements), plus un dans `priceWatch.ts`. Brancher UN seul chemin laissait
 * passer les notifications de commande — précisément les plus attendues —
 * sans que rien ne l'indique.
 *
 * On balaie donc la TABLE. Toute notification écrite, par n'importe quel
 * chemin, finit par être poussée. C'est plus robuste, et ça ne demande à aucun
 * appelant de « penser à envoyer ».
 *
 * ── La garantie anti-double ────────────────────────────────────────────────
 * `idx_customer_push_once` (appareil, notification) est UNIQUE : une
 * notification déjà poussée ne l'est jamais deux fois, même si le
 * répartiteur repasse. Réveiller quelqu'un deux fois pour la même commande
 * est pire que ne pas le prévenir du tout.
 *
 * ── Ce qu'on ne fait PAS ───────────────────────────────────────────────────
 * iOS n'est PAS poussé : un jeton APNs ne se délivre pas par l'API FCM v1.
 * Prétendre l'inverse donnerait des envois qui échouent en boucle. Les
 * appareils iOS sont enregistrés (l'information est utile) mais non ciblés.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { pushConfigured, sendFcmNotification, type FetchImpl, type PushConfig } from './push';

export const PUSH_BATCH_LIMIT = 25;

export interface PushDeviceInput {
  token: string;
  platform?: string;
  locale?: string;
  accountId?: string | null;
  sessionId?: string | null;
}

/**
 * Inscrit (ou réactive) un appareil. Le jeton est l'identité : réinscrire le
 * même jeton MET À JOUR la ligne au lieu d'en créer une autre — un appareil
 * qui ouvre l'application tous les jours ne doit pas laisser 365 lignes.
 */
export function registerPushDevice(db: QatafoDatabase, input: PushDeviceInput): string {
  const token = String(input.token || '').trim();
  if (!token || token.length > 4096) throw new Error('PUSH_TOKEN_INVALID');
  const platform = String(input.platform || 'android').toLowerCase() === 'ios' ? 'ios' : 'android';
  const locale = String(input.locale || 'fr').toLowerCase().startsWith('ar') ? 'ar' : 'fr';
  const now = new Date().toISOString();

  const existing = db.get<{ id: string }>('SELECT id FROM customer_push_devices WHERE token=?', token);
  if (existing?.id) {
    // Le rattachement au compte se fait SANS effacer l'existant : un appareil
    // qui se réinscrit en étant déjà connecté ne doit pas se détacher.
    if (input.accountId) {
      db.run(`UPDATE customer_push_devices
        SET account_id=?, session_id=?, platform=?, locale=?, enabled=1, updated_at=?
        WHERE id=?`, input.accountId, String(input.sessionId || ''), platform, locale, now, existing.id);
    } else {
      db.run(`UPDATE customer_push_devices
        SET session_id=?, platform=?, locale=?, enabled=1, updated_at=?
        WHERE id=?`, String(input.sessionId || ''), platform, locale, now, existing.id);
    }
    return existing.id;
  }

  const id = `pushdev_${randomUUID()}`;
  db.run(`INSERT INTO customer_push_devices
    (id,account_id,session_id,token,platform,locale,enabled,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,?,?)`,
    id, input.accountId || null, String(input.sessionId || ''), token, platform, locale, now, now);
  return id;
}

/** Retrait volontaire (déconnexion, réglage désactivé) : on DÉSACTIVE. */
export function revokePushDevice(db: QatafoDatabase, token: string): void {
  const clean = String(token || '').trim();
  if (!clean) return;
  db.run('UPDATE customer_push_devices SET enabled=0, updated_at=? WHERE token=?', new Date().toISOString(), clean);
}

/**
 * Rattache les appareils d'une session au compte qui vient de se connecter.
 * C'est ce qui permet de prévenir quelqu'un qui a commandé EN VISITEUR puis
 * s'est connecté — sans quoi l'appareil resterait orphelin à tout jamais.
 */
export function attachDevicesToAccount(db: QatafoDatabase, sessionId: string, accountId: string): number {
  const id = String(sessionId || '').trim();
  const account = String(accountId || '').trim();
  if (!id || !account) return 0;
  return db.run(
    `UPDATE customer_push_devices SET account_id=?, updated_at=?
     WHERE session_id=? AND (account_id IS NULL OR account_id='')`,
    account, new Date().toISOString(), id,
  ).changes ?? 0;
}

export interface PushTarget {
  deviceId: string;
  notificationId: string;
  token: string;
  title: string;
  body: string;
  actionUrl: string;
}

/**
 * Notifications à pousser : écrites, rattachées à un compte, et jamais encore
 * envoyées à cet appareil. `ORDER BY created_at ASC` — une commande confirmée
 * hier ne doit pas passer devant une commande expédiée aujourd'hui.
 */
export function pendingPushTargets(db: QatafoDatabase, limit = PUSH_BATCH_LIMIT): PushTarget[] {
  const rows = db.all<{
    device_id: string; notification_id: string; token: string;
    title: string; message: string; action_url: string | null;
  }>(`SELECT d.id AS device_id, n.id AS notification_id, d.token,
        n.title, n.message, n.action_url
      FROM customer_notifications n
      JOIN customer_push_devices d
        ON d.account_id IS NOT NULL
       AND d.account_id = n.account_id
       AND d.enabled = 1
       AND d.platform = 'android'
      LEFT JOIN customer_push_dispatched p
        ON p.device_id = d.id AND p.notification_id = n.id
      WHERE p.id IS NULL
      ORDER BY n.created_at ASC
      LIMIT ?`, Math.max(1, Math.floor(limit)));

  return rows.map((row) => ({
    deviceId: String(row.device_id),
    notificationId: String(row.notification_id),
    token: String(row.token || ''),
    title: String(row.title || ''),
    body: String(row.message || ''),
    actionUrl: String(row.action_url || ''),
  }));
}

export interface DispatchSummary {
  sent: number;
  invalid: number;
  failed: number;
  skipped: string | null;
}

/**
 * Pousse les notifications en attente. Ne jette jamais : c'est une tâche de
 * fond, son échec ne doit pas faire tomber le serveur ni la requête en cours.
 */
export async function dispatchPushNotifications(
  db: QatafoDatabase,
  options: { limit?: number; config?: PushConfig; fetchImpl?: FetchImpl } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, invalid: 0, failed: 0, skipped: null };
  if (!pushConfigured(options.config)) {
    // Non configuré n'est pas « envoyé » : on le DIT, l'appelant n'annonce rien.
    summary.skipped = 'PUSH_NOT_CONFIGURED';
    return summary;
  }

  const targets = pendingPushTargets(db, options.limit ?? PUSH_BATCH_LIMIT);
  for (const target of targets) {
    const outcome = await sendFcmNotification(
      target.token,
      { title: target.title, body: target.body, data: target.actionUrl ? { actionUrl: target.actionUrl, notificationId: target.notificationId } : { notificationId: target.notificationId } },
      { config: options.config, fetchImpl: options.fetchImpl },
    );
    const now = new Date().toISOString();
    db.run(`INSERT OR IGNORE INTO customer_push_dispatched
      (id,device_id,notification_id,status,detail,created_at) VALUES (?,?,?,?,?,?)`,
      `push_${randomUUID()}`, target.deviceId, target.notificationId, outcome.status,
      'reason' in outcome ? outcome.reason : 'sent', now);

    if (outcome.status === 'sent') summary.sent += 1;
    else if (outcome.status === 'invalid') {
      summary.invalid += 1;
      // Le jeton n'existe plus chez Google : le garder actif ferait réessayer
      // pour rien à chaque passage. On le désactive, c'est le seul moment où
      // on apprend qu'un appareil est parti.
      db.run('UPDATE customer_push_devices SET enabled=0, updated_at=? WHERE id=?', now, target.deviceId);
    } else summary.failed += 1;
  }
  return summary;
}
