/**
 * Mesure du parcours d'achat — l'angle mort fermé.
 *
 * Constat (audit du 2026-10-01) : le défaut corrigé plus tôt dans cette même journée — le
 * paiement à la livraison refusé par le serveur alors que la caisse l'affichait — a pu
 * exister sans être vu. Le tableau de bord comptait des commandes, des revenus et des
 * paniers moyens, mais rien ne mesurait le PARCOURS : un client qui remplit un panier et
 * échoue au paiement ne produit aucun de ces chiffres. Autrement dit, le système
 * comptait ce qui réussissait et ne pouvait pas voir ce qui échouait.
 *
 * Ce module comble ce trou avec un seul enregistreur et une seule lecture :
 *
 *   `recordFunnelEvent`  — une ligne par franchissement d'étape, et JAMAIS une exception :
 *                          mesurer ne doit pas pouvoir casser une vente.
 *   `funnelSummary`      — ce que le commerçant doit voir : le taux de conversion, les
 *                          étapes qui fuient, et POURQUOI (code d'échec, moyen de paiement).
 *   `observeCheckoutFunnel` — un middleware qui capture l'échec là où il est produit.
 *
 * Pourquoi un middleware plutôt qu'un appel à chaque `return` : la caisse produit une
 * douzaine de refus distincts (livraison, conditions, vérification, plafond, panier vide…)
 * et ce nombre grandit. Les instrumentation un par un aurait recréé le défaut d'origine —
 * une mesure qui ne couvre que les cas qu'on a pensé à câbler. L'observateur voit la
 * réponse RÉELLE, donc tout refus présent ou futur est compté, avec son code, sans que
 * personne ait à y penser. Le succès, lui, est enregistré explicitement là où le montant
 * est connu (une commande a une valeur, un refus n'en a pas).
 *
 * Vie privée : aucune donnée personnelle, et jamais l'identifiant de panier en clair — c'est
 * une capacité d'accès. On ne conserve qu'une empreinte HMAC (clé serveur) tronquée : stable
 * pour reconnaître un même visiteur, inexploitable sans le secret.
 *
 * Pourquoi une empreinte : un panier qui tente trois fois n'est pas trois clients. Les taux
 * se calculent donc sur des visiteurs DISTINCTS (paniers -> caisses -> commandes) ; les
 * lignes restent comptées séparément pour le volume et les causes d'échec.
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { keyedHash } from '../customer/auth';

export const FUNNEL_STEPS = ['cart_item_added', 'checkout_started', 'checkout_failed', 'order_created'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS funnel_events (
    id TEXT PRIMARY KEY,
    step TEXT NOT NULL CHECK(step IN ('cart_item_added','checkout_started','checkout_failed','order_created')),
    code TEXT,
    method TEXT,
    delivery_mode TEXT,
    locale TEXT,
    value_tnd REAL,
    visitor_key TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_funnel_step_created ON funnel_events(step, created_at);
`;

/** Évolution de schéma : les bases créées avant l'empreinte visiteur l'acquièrent sans perte. */
const FUNNEL_VISITOR_COLUMN = 'ALTER TABLE funnel_events ADD COLUMN visitor_key TEXT';
const FUNNEL_VISITOR_INDEX = 'CREATE INDEX IF NOT EXISTS idx_funnel_visitor ON funnel_events(step, visitor_key, created_at)';

export interface FunnelEventInput {
  code?: string | null;
  method?: string | null;
  deliveryMode?: string | null;
  locale?: string | null;
  valueTnd?: number | null;
  visitorKey?: string | null;
}

let ensured = false;

function ensureFunnelSchema(db: QatafoDatabase): void {
  if (ensured) return;
  db.runSchema(FUNNEL_SCHEMA_SQL);
  const columns = db.all<{ name: string }>('PRAGMA table_info(funnel_events)').map((row) => String(row.name));
  if (!columns.includes('visitor_key')) db.run(FUNNEL_VISITOR_COLUMN);
  db.runSchema(FUNNEL_VISITOR_INDEX);
  ensured = true;
}

/**
 * Empreinte d'un visiteur à partir de son panier. Le panier est une capacité d'accès :
 * on ne le stocke jamais tel quel. Une empreinte absente laisse la ligne dans les volumes
 * mais l'exclut des taux — mieux vaut un taux honnêtement inconnu qu'un taux inventé.
 */
export function funnelVisitorKey(sessionId: unknown): string | null {
  const raw = String(sessionId ?? '').trim();
  if (raw.length < 8 || raw.length > 160) return null;
  try {
    return keyedHash(raw).slice(0, 32);
  } catch {
    return null; // secret absent : on mesure ce qu'on peut, jamais au prix d'une exception
  }
}

/** Bornes défensives : une valeur d'analytique ne doit jamais pouvoir grandir sans limite. */
const bounded = (value: unknown, max: number): string | null => {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return text ? text.slice(0, max) : null;
};

/**
 * Enregistre un franchissement d'étape. Ne lève jamais : la mesure est un service rendu au
 * commerçant, pas une condition de la vente. Un échec d'écriture est signalé et oublié.
 */
export function recordFunnelEvent(db: QatafoDatabase, step: FunnelStep, input: FunnelEventInput = {}): void {
  try {
    ensureFunnelSchema(db);
    const value = Number(input.valueTnd);
    db.run(
      `INSERT INTO funnel_events (id,step,code,method,delivery_mode,locale,value_tnd,visitor_key,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      `fnl_${randomUUID()}`,
      step,
      bounded(input.code, 60),
      bounded(input.method, 40),
      bounded(input.deliveryMode, 40),
      bounded(input.locale, 12),
      Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null,
      bounded(input.visitorKey, 64),
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn('[funnel]', error instanceof Error ? error.message : 'failed');
  }
}

export interface FunnelVisitors {
  carts: number;
  checkouts: number;
  orders: number;
}

export interface FunnelSummary {
  windowDays: number;
  /** Volume : lignes franchies (une tentative = une ligne), pour la cause et le rythme. */
  counts: Record<FunnelStep, number>;
  /** Visiteurs distincts par étape : la base honnête des taux. */
  visitors: FunnelVisitors;
  /** Commandes créées / visiteurs entrés en caisse — le chiffre qui manquait. */
  conversionRate: number | null;
  /** Visiteurs entrés en caisse / visiteurs ayant rempli un panier. */
  cartToCheckoutRate: number | null;
  failures: Array<{ code: string; count: number }>;
  failuresByMethod: Array<{ method: string; count: number }>;
  daily: Array<{ date: string; started: number; failed: number; orders: number }>;
}

/**
 * Les deux taux, sur des visiteurs distincts. Une fonction pure, séparée de la base :
 * c'est cette règle-là que l'audit a trouvée fausse (des tentatives comptées comme des
 * personnes, un « taux » à 300 %), et une règle qui produit un pourcentage doit être
 * vérifiable seule, sans être noyée dans une requête SQL.
 */
export function computeFunnelRates(visitors: FunnelVisitors): { conversionRate: number | null; cartToCheckoutRate: number | null } {
  const rate = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
  return {
    conversionRate: rate(visitors.orders, visitors.checkouts),
    cartToCheckoutRate: rate(visitors.checkouts, visitors.carts),
  };
}

/**
 * Lecture unique du parcours. Les taux sont `null` — jamais 0 — quand le dénominateur est
 * nul : « aucune tentative » et « tentative échouée » ne sont pas la même information, et
 * les confondre est exactement l'erreur que ce module existe pour empêcher.
 */
export function funnelSummary(db: QatafoDatabase, days = 30): FunnelSummary {
  const windowDays = Math.min(Math.max(Math.trunc(Number(days)) || 30, 1), 365);
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    ensureFunnelSchema(db);
    const countOf = (step: FunnelStep): number => Number(db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM funnel_events WHERE step=? AND created_at>=?', step, since,
    )?.n ?? 0);

    const counts: Record<FunnelStep, number> = {
      cart_item_added: countOf('cart_item_added'),
      checkout_started: countOf('checkout_started'),
      checkout_failed: countOf('checkout_failed'),
      order_created: countOf('order_created'),
    };

    const visitorsOf = (step: FunnelStep): number => Number(db.get<{ n: number }>(
      `SELECT COUNT(DISTINCT visitor_key) AS n FROM funnel_events
       WHERE step=? AND created_at>=? AND visitor_key IS NOT NULL`, step, since,
    )?.n ?? 0);
    const visitors: FunnelVisitors = {
      carts: visitorsOf('cart_item_added'),
      checkouts: visitorsOf('checkout_started'),
      orders: visitorsOf('order_created'),
    };
    const { conversionRate, cartToCheckoutRate } = computeFunnelRates(visitors);

    const failures = db.all<{ code: string; count: number }>(
      `SELECT COALESCE(code,'INCONNU') AS code, COUNT(*) AS count FROM funnel_events
       WHERE step='checkout_failed' AND created_at>=? GROUP BY code ORDER BY count DESC, code ASC`, since,
    ).map((row) => ({ code: String(row.code), count: Number(row.count) }));

    const failuresByMethod = db.all<{ method: string; count: number }>(
      `SELECT COALESCE(method,'NON_PRECISE') AS method, COUNT(*) AS count FROM funnel_events
       WHERE step='checkout_failed' AND created_at>=? GROUP BY method ORDER BY count DESC, method ASC`, since,
    ).map((row) => ({ method: String(row.method), count: Number(row.count) }));

    const daily = db.all<any>(
      `SELECT substr(created_at,1,10) AS date,
              SUM(CASE WHEN step='checkout_started' THEN 1 ELSE 0 END) AS started,
              SUM(CASE WHEN step='checkout_failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN step='order_created' THEN 1 ELSE 0 END) AS orders
       FROM funnel_events WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY date`, since,
    ).map((row) => ({ date: String(row.date), started: Number(row.started), failed: Number(row.failed), orders: Number(row.orders) }));

    return { windowDays, counts, visitors, conversionRate, cartToCheckoutRate, failures, failuresByMethod, daily };
  } catch (error) {
    console.warn('[funnel]', error instanceof Error ? error.message : 'failed');
    return {
      windowDays, counts: { cart_item_added: 0, checkout_started: 0, checkout_failed: 0, order_created: 0 },
      visitors: { carts: 0, checkouts: 0, orders: 0 },
      conversionRate: null, cartToCheckoutRate: null, failures: [], failuresByMethod: [], daily: [],
    };
  }
}

/**
 * Observateur de la caisse : une ligne à l'entrée (`checkout_started`), une ligne au refus
 * (`checkout_failed`) avec le code RÉELLEMENT renvoyé.
 *
 * Le succès n'est pas tracé ici : il est tracé par la route, au moment où le montant de la
 * commande est connu. Un refus n'a pas de montant, une commande en a un — c'est la route qui
 * le sait, pas l'observateur.
 */
export function observeCheckoutFunnel(db: QatafoDatabase) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const visitorKey = funnelVisitorKey(req.headers['x-session-id']);
    const context = (): FunnelEventInput => ({
      method: typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod : null,
      deliveryMode: typeof req.body?.deliveryMode === 'string' ? req.body.deliveryMode : null,
      locale: typeof req.body?.locale === 'string' ? req.body.locale : null,
      visitorKey,
    });

    recordFunnelEvent(db, 'checkout_started', context());

    const sendJson = res.json.bind(res);
    let payload: any = null;
    res.json = ((body: any) => { payload = body; return sendJson(body); }) as Response['json'];

    res.on('finish', () => {
      res.json = sendJson as Response['json'];
      const refused = res.statusCode >= 400 || payload?.success === false;
      if (!refused) return; // une commande réussie est tracée par la route, avec sa valeur
      recordFunnelEvent(db, 'checkout_failed', {
        ...context(),
        code: typeof payload?.code === 'string' ? payload.code : `HTTP_${res.statusCode}`,
      });
    });

    next();
  };
}
