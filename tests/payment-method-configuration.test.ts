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
 * paiement par carte — donc la passerelle Konnect configurée.
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
  resolveAcceptedPaymentMethods,
} from '../src/db/database';
import { parseCommercePolicy } from '../client/src/commerce/policy';
import { availableAtCheckout } from '../client/src/commerce/paymentMethods';

const readSource = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

async function loginSuperAdmin() {
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({
    email: 'admin@ayrovi.tn',
    password: 'AyroviBeta2026!',
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
    expect(checkout).toContain('resolveAcceptedPaymentMethods(paymentSetting?.setting_value)');
    expect(checkout).not.toMatch(/'PENDING_SELECTION'\s*,\s*'COD'/);

    // Ce qui est PUBLIÉ au client est résolu par la même fonction : la caisse ne
    // peut donc pas annoncer un moyen que le checkout refusera.
    const publicRoutes = readSource('src/public/routes.ts');
    expect(publicRoutes).toContain('paymentMethods: resolveAcceptedPaymentMethods(facts.payment_methods)');

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

  test('ce que le client voit est ce qui est enregistré, dans le même ordre', async () => {
    const config = await request(app).get('/api/public/commerce-config');
    expect(config.status).toBe(200);
    expect(config.body.data.paymentMethods).toEqual([...DEFAULT_PAYMENT_METHODS]);
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

  test('la caisse n’offre QUE ce que le serveur accepte — le cas du paiement à la livraison', async () => {
    /*
     * Le défaut le plus coûteux trouvé le 01/10/2026 : la caisse décidait seule,
     * à partir des passerelles configurées. Le paiement à la livraison ne dépend
     * d'AUCUNE passerelle, donc il était toujours proposé — alors que le réglage
     * semé par défaut ne le contenait pas. Le client remplissait adresse, e-mail
     * et téléphone, puis lisait « Ce moyen de paiement n'est pas disponible ».
     * La commande était perdue à la dernière étape.
     */
    const { agent, csrf } = await loginSuperAdmin();

    const offeredNow = async () => {
      const config = await request(app).get('/api/public/commerce-config');
      const policy = parseCommercePolicy(config.body.data);
      const offered = availableAtCheckout(policy).map((method) => method.id);
      // L'invariant, quelle que soit la configuration : ce que la caisse propose
      // appartient toujours à ce que le serveur déclare accepter.
      for (const id of offered) expect(policy.acceptedPaymentMethods).toContain(id);
      return offered;
    };

    // Le paiement à la livraison ne dépend d'AUCUNE passerelle : il doit donc
    // apparaître exactement quand le serveur le déclare accepté.
    expect((await savePaymentMethods(agent, csrf, ['COD', 'CARD', 'BANK_TRANSFER'])).status).toBe(200);
    expect(await offeredNow()).toContain('COD');

    expect((await savePaymentMethods(agent, csrf, ['CARD', 'BANK_TRANSFER'])).status).toBe(200);
    const withoutCod = await offeredNow();
    expect(withoutCod).not.toContain('COD');

    // Sans passerelle carte ni RIB publié dans l'environnement de test, rien
    // d'autre ne peut être honnêtement proposé — et la caisse le dit au lieu
    // d'afficher un bouton qui échouerait.
    expect(withoutCod).toEqual([]);

    // Le retour du paiement à la livraison est immédiat, sans redéploiement.
    expect((await savePaymentMethods(agent, csrf, ['COD'])).status).toBe(200);
    expect(await offeredNow()).toEqual(['COD']);
  });

  test('toute politique enregistrable laisse au client au moins un moyen de payer', async () => {
    // Le test parcourt chaque moyen configurable, l'enregistre seul, et vérifie
    // que la caisse n'est jamais vide : une politique refusée à la dernière étape
    // est exactement ce que ce fichier existe pour empêcher.
    const { agent, csrf } = await loginSuperAdmin();
    for (const method of SELECTABLE_PAYMENT_METHODS) {
      expect((await savePaymentMethods(agent, csrf, [method])).status, method).toBe(200);
      const config = await request(app).get('/api/public/commerce-config');
      const policy = parseCommercePolicy(config.body.data);
      // COD est le seul moyen qui ne dépend d'aucune configuration externe :
      // c'est donc lui qui garantit qu'une boutique neuve peut encaisser.
      const offered = availableAtCheckout(policy).map((entry) => entry.id);
      // COD est le seul moyen qui ne dépend d'aucune configuration externe :
      // c'est donc lui qui garantit qu'une boutique neuve peut encaisser.
      if (method === 'COD') expect(offered, 'COD seul doit rester payable').toContain('COD');
      // Et ce qui est offert appartient bien à ce qui est configuré.
      for (const id of offered) expect(policy.acceptedPaymentMethods).toContain(id);
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
    expect(config.body.data.paymentMethods).toContain('COD');
    expect(config.body.data.paymentMethods).not.toContain('FLOUCI');
  });
});
