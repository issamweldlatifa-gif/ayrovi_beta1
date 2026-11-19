/*
 * MOYENS DE PAIEMENT — LA CONFIGURATION COMMERCIALE DOIT ÊTRE MODIFIABLE (01/10/2026).
 *
 * Ce que ce fichier empêche de revivre :
 *
 * Trois listes décrivaient les moyens de paiement — celle du checkout, celle du
 * validateur de l'Admin, et celle semée par défaut. Elles avaient divergé.
 * `PUT /api/admin/settings/:id` sur `payment_methods` acceptait uniquement
 * `COD`/`D17`/`FLOUCI` alors que la plateforme sème
 * `["CARD","FLOUCI","BANK_TRANSFER","POSTE"]`. Conséquence : l'Admin recevait
 * « Les paiements autorisés sont COD, D17 et FLOUCI » en enregistrant la valeur
 * que le produit affiche lui-même, et la SEULE alternative acceptée retirait le
 * paiement par carte — donc la passerelle Stripe configurée.
 *
 * Le paiement à la livraison manquait aussi à la valeur semée, alors que le
 * journal des changements l'annonçait comme ajouté : une boutique neuve
 * n'offrait donc aucun moyen encaissable sans passerelle.
 *
 * La garantie tenue ici est structurelle : les listes ne peuvent plus diverger,
 * parce qu'il n'y en a plus qu'une.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  DEFAULT_PAYMENT_METHODS,
  PAYMENT_METHOD_CODES,
  SELECTABLE_PAYMENT_METHODS,
  resolveAcceptedPaymentMethods, resolvePrepaidCheckoutMethods,
} from '../src/db/database';
import { parseCommercePolicy } from '../client/src/commerce/policy';
import { availableAtCheckout } from '../client/src/commerce/paymentMethods';

const readSource = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

async function loginSuperAdmin() {
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({
    email: 'admin@zayrovi.com',
    password: 'ZayroviBeta2026!',
  });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken as string };
}

const savePaymentMethods = (agent: any, csrf: string, value: unknown) =>
  agent.put('/api/admin/settings/setting_payment_methods').set('x-csrf-token', csrf).send({ value });

describe('moyens de paiement — une seule liste, aucune dérive', () => {
  test('la liste partagée est cohérente et sans doublon', () => {
    const codes = [...PAYMENT_METHOD_CODES];
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('PENDING_SELECTION');

    // Un moyen proposé au client est forcément compris par le serveur.
    for (const method of SELECTABLE_PAYMENT_METHODS) expect(codes).toContain(method);
    // `PENDING_SELECTION` décrit « pas encore choisi » : il ne se configure pas.
    expect(SELECTABLE_PAYMENT_METHODS).not.toContain('PENDING_SELECTION');

    // Chaque valeur par défaut doit être configurable, sinon l'Admin ne pourrait
    // pas enregistrer la valeur qu'il affiche — c'est exactement le défaut d'origine.
    for (const method of DEFAULT_PAYMENT_METHODS) expect(SELECTABLE_PAYMENT_METHODS).toContain(method);
  });

  test('une boutique neuve peut réellement encaisser : le paiement à la livraison est proposé', () => {
    // Le seul moyen qui n'exige AUCUNE passerelle. L'omettre laisse une
    // installation fraîche incapable d'encaisser quoi que ce soit.
    expect(DEFAULT_PAYMENT_METHODS).toContain('COD');
    expect(DEFAULT_PAYMENT_METHODS.length).toBeGreaterThan(1);
  });

  test('le checkout, la config publique et le validateur Admin lisent la liste partagée', () => {
    // Une copie locale est précisément ce qui a permis la dérive : le test échoue
    // si quelqu'un en réintroduit une.
    const checkout = readSource('src/api/routes.ts');
    expect(checkout).toContain('new Set<PaymentMethodCode>(PAYMENT_METHOD_CODES)');
    // Le checkout résout la configuration par la fonction partagée, pas à la main.
    expect(checkout).toContain('resolvePrepaidCheckoutMethods(paymentSetting?.setting_value)');
    expect(checkout).not.toMatch(/'PENDING_SELECTION'\s*,\s*'COD'/);

    // Ce qui est PUBLIÉ au client est résolu par la même fonction : la caisse ne
    // peut donc pas annoncer un moyen que le checkout refusera.
    const publicRoutes = readSource('src/public/routes.ts');
    expect(publicRoutes).toContain('paymentMethods: resolvePrepaidCheckoutMethods(facts.payment_methods)');

    const admin = readSource('src/admin/routes.ts');
    expect(admin).toContain('SELECTABLE_PAYMENT_METHODS');
    expect(admin).not.toContain("['COD','D17','FLOUCI']");
  });

  test('une politique incomplète ou illisible retombe sur les valeurs par défaut', () => {
    // Une configuration commerciale cassée ne doit jamais laisser le client sans
    // aucun moyen de payer — c'est le repli du checkout, ici vérifié.
    for (const broken of [[], null, undefined, 'pas du json', ['BITCOIN'], [{}], ['CARD', 'BITCOIN']]) {
      const resolved = resolveAcceptedPaymentMethods(broken);
      expect(resolved.length, JSON.stringify(broken)).toBeGreaterThan(0);
      for (const method of resolved) expect(SELECTABLE_PAYMENT_METHODS).toContain(method);
    }
    // Une valeur partiellement valide garde ce qui est valide.
    expect(resolveAcceptedPaymentMethods(['CARD', 'BITCOIN'])).toEqual(['CARD']);
    // Les doublons et la casse ne créent pas d'entrées fantômes.
    expect(resolveAcceptedPaymentMethods(['card', 'CARD', ' card '])).toEqual(['CARD']);
  });

  test('la valeur semée est exactement la valeur par défaut de la plateforme', () => {
    const row = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='payment_methods'");
    expect(JSON.parse(row.setting_value)).toEqual([...DEFAULT_PAYMENT_METHODS]);
  });

  test('la politique publique conserve l’ordre des choix prépayés', async () => {
    const config = await request(app).get('/api/public/commerce-config');
    expect(config.status).toBe(200);
    expect(config.body.data.paymentMethods).toEqual(resolvePrepaidCheckoutMethods(DEFAULT_PAYMENT_METHODS));
  });

  test('l’Admin peut enregistrer la valeur par défaut de la plateforme (régression d’origine)', async () => {
    const { agent, csrf } = await loginSuperAdmin();
    const saved = await savePaymentMethods(agent, csrf, [...DEFAULT_PAYMENT_METHODS]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.success).toBe(true);

    const row = db.get<any>("SELECT setting_value FROM settings WHERE setting_key='payment_methods'");
    expect(JSON.parse(row.setting_value)).toEqual([...DEFAULT_PAYMENT_METHODS]);
  });

  test('chaque moyen configurable est accepté par l’Admin, seul ou avec les autres', async () => {
    const { agent, csrf } = await loginSuperAdmin();
    // Le cas qui cassait : la liste complète telle que le produit la publie.
    const all = await savePaymentMethods(agent, csrf, [...SELECTABLE_PAYMENT_METHODS]);
    expect(all.status, JSON.stringify(all.body)).toBe(200);

    for (const method of SELECTABLE_PAYMENT_METHODS) {
      const single = await savePaymentMethods(agent, csrf, [method]);
      expect(single.status, `${method}: ${JSON.stringify(single.body)}`).toBe(200);
    }
  });

  test('un moyen inconnu reste refusé, et le message dit ce qui est accepté', async () => {
    const { agent, csrf } = await loginSuperAdmin();
    const rejected = await savePaymentMethods(agent, csrf, ['CARD', 'BITCOIN']);
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('PAYMENT_METHODS_INVALID');
    for (const method of SELECTABLE_PAYMENT_METHODS) expect(rejected.body.error).toContain(method);

    // Une liste vide ou mal formée ne doit pas vider la configuration commerciale.
    for (const invalid of [[], 'CARD', null]) {
      const response = await savePaymentMethods(agent, csrf, invalid);
      expect(response.status, JSON.stringify(invalid)).toBe(400);
    }

    // `PENDING_SELECTION` n'est pas un moyen choisissable : il ne se configure jamais.
    const pending = await savePaymentMethods(agent, csrf, ['PENDING_SELECTION']);
    expect(pending.status).toBe(400);
    expect(pending.body.code).toBe('PAYMENT_METHODS_INVALID');
  });

  test('la caisse ne propose jamais la livraison contre remboursement, même avec une ancienne configuration', async () => {
    const { agent, csrf } = await loginSuperAdmin();
    for (const methods of [['COD'], ['COD', 'CARD', 'BANK_TRANSFER'], ['CARD', 'BANK_TRANSFER']]) {
      expect((await savePaymentMethods(agent, csrf, methods)).status).toBe(200);
      const config = await request(app).get('/api/public/commerce-config');
      const policy = parseCommercePolicy(config.body.data);
      expect(policy.acceptedPaymentMethods).toEqual(resolvePrepaidCheckoutMethods(methods));
      expect(policy.acceptedPaymentMethods).not.toContain('COD');
      const offered = availableAtCheckout(policy).map(method => method.id);
      expect(offered).not.toContain('COD');
      for (const method of offered) expect(policy.acceptedPaymentMethods).toContain(method);
    }
  });

  test('enregistrer une politique ne fait pas perdre la carte bancaire', async () => {
    // Le scénario réel : l'Admin ouvre les réglages, garde la carte activée,
    // enregistre. La carte doit survivre — c'est elle qui porte la passerelle.
    const { agent, csrf } = await loginSuperAdmin();
    const withCard = await savePaymentMethods(agent, csrf, ['COD', 'CARD', 'BANK_TRANSFER']);
    expect(withCard.status).toBe(200);

    const config = await request(app).get('/api/public/commerce-config');
    expect(config.body.data.paymentMethods).toContain('CARD');
    expect(config.body.data.paymentMethods).not.toContain('COD');
    expect(config.body.data.paymentMethods).not.toContain('FLOUCI');
  });
});
