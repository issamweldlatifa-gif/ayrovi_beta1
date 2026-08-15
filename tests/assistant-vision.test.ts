import { expect, test, vi } from 'vitest';
import sharp from 'sharp';
import request from 'supertest';
import { app } from '../src/server';

async function postImage(dataUrl: string, type: string) {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const captured: any[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    if (url.includes('api.anthropic.com')) {
      captured.push(JSON.parse(init.body));
      const sse = ['data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Vu."}}',
        'data: {"type":"content_block_stop","index":0}', 'data: {"type":"message_stop"}'].map((l) => l + '\n\n').join('');
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response('not found', { status: 404 });
  });
  const res = await request(app).post('/api/assistant/chat')
    .set('x-session-id', 'attachtest123')
    .send({ conversationId: 'attach-1', messages: [{ role: 'user', text: 'قداش السعر', attachments: [{ id: 'a1', type, dataUrl }] }] });
  spy.mockRestore();
  process.env.ANTHROPIC_API_KEY = '';
  return { res, captured };
}

const imageBlockOf = (captured: any[]) => {
  const firstUser = captured[0].messages.find((m: any) => m.role === 'user');
  return Array.isArray(firstUser.content) ? firstUser.content.find((b: any) => b.type === 'image') : undefined;
};

test('chat transmet l\'image jointe au modèle vision (base64)', async () => {
  const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
  const { res, captured } = await postImage(`data:image/png;base64,${png.toString('base64')}`, 'image/png');
  expect(res.status).toBe(200);
  const imageBlock = imageBlockOf(captured);
  expect(imageBlock).toBeTruthy();
  expect(imageBlock.source.type).toBe('base64');
  expect(String(imageBlock.source.data).length).toBeGreaterThan(100);
});

test('alias MIME image/jpg accepté (appareils Android)', async () => {
  const jpeg = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 10, b: 200 } } }).jpeg().toBuffer();
  const { res, captured } = await postImage(`data:image/jpg;base64,${jpeg.toString('base64')}`, 'image/jpg');
  expect(res.status).toBe(200);
  expect(imageBlockOf(captured)).toBeTruthy();
});

test('attachment corrompu rejeté sans casser le chat', async () => {
  const { res, captured } = await postImage('data:image/png;base64,AAAA', 'image/png');
  expect(res.status).toBe(200);
  expect(imageBlockOf(captured)).toBeUndefined();
});
