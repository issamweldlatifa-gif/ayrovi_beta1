import { afterEach, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, db } from '../src/server';
import { executeAssistantTool, type AssistantToolContext } from '../src/assistant/tools';
import { selectAssistantModel } from '../src/assistant/service';
import type { CustomerIdentity } from '../src/customer/auth';

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const unique = (prefix: string) => `${prefix}_${randomUUID()}`;

function customerIdentity(id: string, phone: string): CustomerIdentity {
  return {
    id, displayName: 'Client test', email: null, phone, avatarUrl: '', emailVerified: false,
    phoneVerified: true, status: 'ACTIVE', locale: 'fr-TN', marketingOptIn: false,
  };
}

function context(customer: CustomerIdentity | null, conversationId = unique('conversation')): AssistantToolContext {
  return {
    db, customer, sessionId: unique('session'), conversationId,
    messages: [{ role: 'user', text: 'J’ai besoin d’aide pour ma commande.' }],
  };
}

function seedOrder() {
  const suffix = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  const accountId = unique('assistant_account');
  const otherAccountId = unique('assistant_other_account');
  const customerId = unique('assistant_customer');
  const orderId = unique('assistant_order');
  const orderNumber = `AYR-9${suffix}`;
  const now = new Date().toISOString();
  db.run(`INSERT INTO customer_accounts (id,display_name,phone,phone_verified_at,status,created_at,updated_at)
    VALUES (?,'Client propriétaire',?,?,'ACTIVE',?,?)`, accountId, `+2169${suffix}0`.slice(0, 12), now, now, now);
  db.run(`INSERT INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
    VALUES (?,'Autre client',?,?, 'ACTIVE',?,?)`, otherAccountId, `${suffix}@example.test`, now, now, now);
  const phone = '98123456';
  db.run(`INSERT INTO customers (id,name,phone,governorate,address,registered_at,status,updated_at)
    VALUES (?,'Client assistant',?,'Tunis','Adresse test',?,'ACTIVE',?)`, customerId, phone, now, now);
  db.run(`INSERT INTO orders
    (id,order_number,customer_id,account_id,source,status,payment_status,payment_method,subtotal_tnd,customs_tnd,shipping_tnd,service_tnd,express_tnd,discount_tnd,total_tnd,pricing_snapshot,governorate,address,phone,notes,created_at,updated_at)
    VALUES (?,?,?,?,'OTHER','IN_TRANSIT','PAID','CARD',100,0,7,10,0,0,117,?,'Tunis','Adresse test',?,'',?,?)`,
  orderId, orderNumber, customerId, accountId, JSON.stringify({ version: 1 }), phone, now, now);
  return {
    accountId, otherAccountId, customerId, orderId, orderNumber, phone,
    cleanup: () => {
      db.run('DELETE FROM orders WHERE id=?', orderId);
      db.run('DELETE FROM customers WHERE id=?', customerId);
      db.run('DELETE FROM customer_accounts WHERE id IN (?,?)', accountId, otherAccountId);
    },
  };
}

function anthropicSse(events: any[]): Response {
  const payload = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('AYROVI Claude assistant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  });

  test('routes simple requests to Haiku and long complex requests to Sonnet', () => {
    process.env.ASSISTANT_HAIKU_MODEL = 'haiku-test';
    process.env.ASSISTANT_SONNET_MODEL = 'sonnet-test';
    expect(selectAssistantModel([{ role: 'user', text: 'Bonjour' }])).toBe('haiku-test');
    expect(selectAssistantModel([{ role: 'user', text: 'x'.repeat(700) }])).toBe('sonnet-test');
    delete process.env.ASSISTANT_HAIKU_MODEL;
    delete process.env.ASSISTANT_SONNET_MODEL;
  });

  test('order tool reveals guest data only after matching phone and blocks another signed-in account', async () => {
    const seeded = seedOrder();
    try {
      const owner = await executeAssistantTool('get_order_status', { order_id: seeded.orderNumber }, context(customerIdentity(seeded.accountId, seeded.phone)));
      expect(owner.modelResult.success).toBe(true);
      expect(owner.presentation?.order.status).toBe('IN_TRANSIT');

      const guestRejected = await executeAssistantTool('get_order_status', { order_id: seeded.orderNumber, phone: '97111111' }, context(null));
      expect(guestRejected.modelResult.success).toBe(false);
      expect(guestRejected.presentation).toBeUndefined();

      const guestVerified = await executeAssistantTool('get_order_status', { order_id: seeded.orderNumber, phone: seeded.phone }, context(null));
      expect(guestVerified.modelResult.success).toBe(true);
      expect(guestVerified.presentation?.order.orderId).toBe(seeded.orderNumber);

      const wrongAccount = await executeAssistantTool('get_order_status', { order_id: seeded.orderNumber, phone: seeded.phone }, context(customerIdentity(seeded.otherAccountId, seeded.phone)));
      expect(wrongAccount.modelResult.code).toBe('NOT_ORDER_OWNER');
      expect(wrongAccount.presentation).toBeUndefined();
    } finally { seeded.cleanup(); }
  });

  test('price tool uses current backend Calculator rules', async () => {
    const result = await executeAssistantTool('calculate_price', { product_price: 20, currency: 'EUR', quantity: 2, express: true }, context(null));
    expect(result.modelResult.success).toBe(true);
    expect(result.presentation?.breakdown.totalTND).toBeGreaterThan(0);
    expect(result.presentation?.breakdown.originalPrice).toBe(40);
  });

  test('support escalation requires guest contact and deduplicates an open conversation ticket', async () => {
    const conversationId = unique('support_conversation');
    const toolContext = context(null, conversationId);
    const missing = await executeAssistantTool('escalate_to_human', { reason: 'Réclamation livraison' }, toolContext);
    expect(missing.modelResult.code).toBe('CONTACT_REQUIRED');

    const first = await executeAssistantTool('escalate_to_human', { reason: 'Réclamation livraison', contact: '98112233' }, toolContext);
    const second = await executeAssistantTool('escalate_to_human', { reason: 'Même réclamation', contact: '98112233' }, toolContext);
    expect(first.modelResult.success).toBe(true);
    expect(second.presentation?.ticket.id).toBe(first.presentation?.ticket.id);
    expect(second.presentation?.ticket.duplicate).toBe(true);

    const reviewer = request.agent(app);
    const login = await reviewer.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const listed = await reviewer.get('/api/admin/assistant-support').query({ search: first.presentation?.ticket.id });
    expect(listed.status).toBe(200);
    expect(listed.body.data[0].id).toBe(first.presentation?.ticket.id);
    const updated = await reviewer.put(`/api/admin/assistant-support/${first.presentation?.ticket.id}`)
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({ status: 'RESOLVED', priority: 'HIGH', adminNote: 'Traitement confirmé par le test.' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('RESOLVED');
    expect(updated.body.data.priority).toBe('HIGH');
    db.run('DELETE FROM assistant_support_tickets WHERE conversation_id=?', conversationId);
  });

  test('chat endpoint streams Claude tool use, a real price card and the final text', async () => {
    process.env.ANTHROPIC_API_KEY = 'assistant-test-key';
    const rounds = [
      anthropicSse([
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-price-1', name: 'calculate_price', input: {} } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"product_price":25,"currency":"EUR"}' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ]),
      anthropicSse([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Voici votre estimation réelle.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_stop' },
      ]),
    ];
    const fetchMock = vi.fn(async () => rounds.shift()!);
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app)
      .post('/api/assistant/chat')
      .set('x-session-id', unique('assistant-session'))
      .send({ conversationId: unique('conversation'), messages: [{ role: 'user', text: 'Calcule 25 EUR.' }] });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('"type":"tool","name":"calculate_price"');
    expect(response.text).toContain('Voici votre estimation réelle.');
    expect(response.text).toContain('"type":"done"');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
