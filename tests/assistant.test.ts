import { afterEach, describe, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import request from 'supertest';
import { app, db } from '../src/server';
import { executeAssistantTool, type AssistantToolContext } from '../src/assistant/tools';
import { selectAssistantModel } from '../src/assistant/service';
import type { CustomerIdentity } from '../src/customer/auth';
import { SmartLinkScraper } from '../src/scraper/scraper';
import { scanCodeFromImage } from '../src/ayrovix/services/codeScanner';

const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalSerpApiKey = process.env.SERPAPI_KEY;
const originalGroqKey = process.env.GROQ_API_KEY;
const testScraper = new SmartLinkScraper();
const unique = (prefix: string) => `${prefix}_${randomUUID()}`;

function customerIdentity(id: string, phone: string): CustomerIdentity {
  return {
    id, displayName: 'Client test', email: null, phone, avatarUrl: '', emailVerified: false,
    phoneVerified: true, status: 'ACTIVE', locale: 'fr-TN', marketingOptIn: false,
  };
}

function context(customer: CustomerIdentity | null, conversationId = unique('conversation')): AssistantToolContext {
  return {
    db, scraper: testScraper, customer, sessionId: unique('session'), conversationId,
    messages: [{ role: 'user', text: 'J’ai besoin d’aide pour ma commande.' }],
    imageAttachments: [],
    webSearchEnabled: true,
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

async function qrPng(value: string): Promise<Buffer> {
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 320, 320, new Map());
  const pixels = Buffer.alloc(matrix.getWidth() * matrix.getHeight() * 4);
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      const offset = (y * matrix.getWidth() + x) * 4;
      const channel = matrix.get(x, y) ? 0 : 255;
      pixels[offset] = channel;
      pixels[offset + 1] = channel;
      pixels[offset + 2] = channel;
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width: matrix.getWidth(), height: matrix.getHeight(), channels: 4 } }).png().toBuffer();
}

describe('AYROVI Claude assistant', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    if (originalSerpApiKey === undefined) delete process.env.SERPAPI_KEY;
    else process.env.SERPAPI_KEY = originalSerpApiKey;
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
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

  test('multimodal chat forwards sanitized image blocks and structured client state to Claude', async () => {
    process.env.ANTHROPIC_API_KEY = 'assistant-vision-test-key';
    const fetchMock = vi.fn(async (_url: any, _init: any) => anthropicSse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Image analysée.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop' },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const response = await request(app)
      .post('/api/assistant/chat')
      .set('x-session-id', unique('assistant-session'))
      .send({
        conversationId: unique('conversation'),
        state: {
          orderStage: 'PRODUCT_CONFIGURATION',
          activeProduct: { title: 'Sneaker test', price: 99 },
          accessToken: 'must-never-reach-claude',
          apiKey: 'must-also-stay-server-side',
          preview: 'data:image/png;base64,secret-preview',
        },
        messages: [{
          role: 'user',
          text: 'Trouve ce produit.',
          attachments: [
            { id: 'image_test_1', type: 'image/png', dataUrl: `data:image/png;base64,${imageData}` },
            { id: 'image_url_1', type: 'image/webp', url: 'https://cdn.example.org/products/shoe.webp' },
          ],
        }],
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Image analysée.');
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestBody.system).toContain('PRODUCT_CONFIGURATION');
    expect(requestBody.system).toContain('Sneaker test');
    expect(requestBody.system).not.toContain('must-never-reach-claude');
    expect(requestBody.system).not.toContain('must-also-stay-server-side');
    expect(requestBody.system).not.toContain('secret-preview');
    expect(requestBody.messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: 'AYROVI attachment id: image_test_1' }),
      expect.objectContaining({ type: 'image', source: expect.objectContaining({ type: 'base64', media_type: 'image/png', data: imageData }) }),
      expect.objectContaining({ type: 'text', text: 'AYROVI attachment id: image_url_1' }),
      expect.objectContaining({ type: 'image', source: { type: 'url', url: 'https://cdn.example.org/products/shoe.webp' } }),
    ]));
    expect(requestBody.tools.some((tool: any) => tool.name === 'lens_search')).toBe(true);
    expect(requestBody.tool_choice).toEqual({ type: 'tool', name: 'lens_search' });
  });

  test('manual URL confirmation in an active order does not force a new Lens extraction', async () => {
    process.env.ANTHROPIC_API_KEY = 'assistant-order-test-key';
    const fetchMock = vi.fn(async (_url: any, _init: any) => anthropicSse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Lien conservé pour la commande.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop' },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app)
      .post('/api/assistant/chat')
      .set('x-session-id', unique('assistant-session'))
      .send({
        conversationId: unique('conversation'),
        state: { orderStage: 'PRODUCT_CONFIGURATION', activeProduct: { title: 'Produit actif' } },
        messages: [{ role: 'user', text: 'Voici le lien exact https://shop.example.org/products/confirmed' }],
      });
    expect(response.status).toBe(200);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestBody.tool_choice).toEqual({ type: 'auto' });
  });

  test('explicit product search deterministically forces the real search tool', async () => {
    process.env.ANTHROPIC_API_KEY = 'assistant-search-test-key';
    const fetchMock = vi.fn(async (_url: any, _init: any) => anthropicSse([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Recherche.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop' },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    await request(app)
      .post('/api/assistant/chat')
      .set('x-session-id', unique('assistant-session'))
      .send({ conversationId: unique('conversation'), messages: [{ role: 'user', text: 'ابحث لي عن Nike Air Max 95' }] });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestBody.tool_choice).toEqual({ type: 'tool', name: 'search_products' });
  });

  test('lens_search sends a pasted product URL through the real AYROVIX extractor and opens the in-chat order product', async () => {
    vi.spyOn(testScraper, 'scrapeProduct').mockResolvedValue({
      id: 'scraped_test', store: 'generic', storeName: 'Merchant Test',
      url: 'https://shop.example.org/products/air-max-95', externalId: 'sku-95',
      title: 'Nike Air Max 95', description: 'Chaussure test',
      images: ['https://cdn.example.org/air-max-95.jpg'], mainImage: 'https://cdn.example.org/air-max-95.jpg',
      sourcePrice: 180, sourceCurrency: 'EUR', convertedPriceTND: 0,
      estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: {
        sizes: ['42'], colors: ['Noir'],
        details: [{ id: 'variant-42', label: '42 / Noir', size: '42', color: 'Noir', available: true, price: 185 }],
      },
      availability: 'in_stock', brand: 'Nike', priceVerified: true,
      verificationProvider: 'merchant', verificationMethod: 'structured-data', verificationFailureCode: null,
      scrapedAt: new Date().toISOString(),
    });
    const result = await executeAssistantTool('lens_search', {
      product_url: 'https://shop.example.org/products/air-max-95',
    }, context(null));

    expect(result.modelResult.success).toBe(true);
    expect(result.modelResult.mode).toBe('url');
    expect(result.presentation?.product.title).toBe('Nike Air Max 95');
    expect(result.presentation?.product.priceToken).toBeTruthy();
    expect(result.presentation?.product.variantOptions[0].priceToken).toBeTruthy();
    expect(result.modelResult.product.priceToken).toBeUndefined();
    expect(result.modelResult.product.variants[0].priceToken).toBeUndefined();
    expect(testScraper.scrapeProduct).toHaveBeenCalledWith('https://shop.example.org/products/air-max-95');
  });

  test('server-side AYROVIX scanner reads QR links from assistant image attachments', async () => {
    const code = await scanCodeFromImage(await qrPng('https://shop.example.org/products/qr-product'));
    expect(code).toMatchObject({ kind: 'url', value: 'https://shop.example.org/products/qr-product' });
  });

  test('lens_search reuses Google Lens and returns real presentation cards without exposing quote tokens to the model', async () => {
    process.env.SERPAPI_KEY = 'serpapi-assistant-test-key';
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn(async (url: any) => {
      if (String(url).startsWith('https://serpapi.com/image?')) {
        return new Response(JSON.stringify({ image_id: 'image_test_id' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        visual_matches: [{
          title: 'Nike Air Max Test',
          link: 'https://shop.example.org/products/nike-air-max-test',
          source: 'Shop Test',
          thumbnail: 'https://images.example.org/nike.jpg',
          price: { extracted_value: 120, currency: 'EUR' },
          exact_matches: true,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const imageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const toolContext = context(null);
    toolContext.imageAttachments = [{ id: 'image_test_2', mediaType: 'image/png', data: imageData.toString('base64') }];
    const result = await executeAssistantTool('lens_search', { image_attachment_id: 'image_test_2' }, toolContext);

    expect(result.modelResult.success).toBe(true);
    expect(result.modelResult.imageAnalyzed).toBe(true);
    expect(result.presentation?.products[0].title).toBe('Nike Air Max Test');
    expect(result.presentation?.products[0].priceToken).toBeTruthy();
    expect(result.presentation?.product.title).toBe('Nike Air Max Test');
    expect(result.presentation?.product.priceToken).toBeTruthy();
    expect(result.presentation?.product.priceTnd).toBeGreaterThan(0);
    expect(result.modelResult.products[0].priceToken).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('voice endpoint validates audio and returns Groq Whisper transcription', async () => {
    const page = await request(app).get('/');
    expect(page.headers['permissions-policy']).toContain('microphone=(self)');
    delete process.env.GROQ_API_KEY;
    const unavailable = await request(app)
      .post('/api/assistant/transcribe')
      .set('x-session-id', unique('assistant-session'))
      .attach('audio', Buffer.from('voice'), { filename: 'voice.webm', contentType: 'audio/webm' });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe('VOICE_UNAVAILABLE');

    process.env.GROQ_API_KEY = 'groq-test-key';
    const unsupported = await request(app)
      .post('/api/assistant/transcribe')
      .set('x-session-id', unique('assistant-session'))
      .attach('audio', Buffer.from('voice'), { filename: 'voice.txt', contentType: 'text/plain' });
    expect(unsupported.status).toBe(415);

    const fetchMock = vi.fn(async (_url: any, init: any) => {
      expect(init.headers.Authorization).toBe('Bearer groq-test-key');
      expect(init.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({ text: 'Je cherche ces chaussures', language: 'fr', duration: 2.4 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const transcribed = await request(app)
      .post('/api/assistant/transcribe')
      .set('x-session-id', unique('assistant-session'))
      .attach('audio', Buffer.from('voice-bytes'), { filename: 'voice.webm', contentType: 'audio/webm' });
    expect(transcribed.status).toBe(200);
    expect(transcribed.body.data).toEqual({ text: 'Je cherche ces chaussures', provider: 'groq-whisper' });
    expect(fetchMock).toHaveBeenCalledOnce();
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
