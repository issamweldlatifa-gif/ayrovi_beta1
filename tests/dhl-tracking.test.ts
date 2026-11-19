import { describe, expect, it, vi } from 'vitest';
import { readDhlStatus } from '../src/shipping/dhlRead';
import { readBoundedResponse } from '../src/services/boundedResponse';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
describe('DHL read-only boundary', () => {
  it('sends only the saved reference to the fixed API, verifies identity, and projects no carrier PII', async () => {
    const upstream = vi.fn<typeof fetch>(async () => json({ shipments: [
      { id: 'other', service: 'express', status: { statusCode: 'delivered' } },
      { id: 'TRACK-100', service: 'express', status: { statusCode: 'transit', timestamp: '2026-11-19T12:00:00+01:00', location: { address: 'Private address' }, description: 'Private message' }, events: ['Private events'] },
    ] }));
    expect(await readDhlStatus('TRACK-100', 'fixture-key-not-real', upstream)).toEqual({ kind: 'verified', data: { status: 'transit', observedAt: '2026-11-19T11:00:00.000Z' } });
    expect(upstream.mock.calls[0]?.[0]?.toString()).toBe('https://api-eu.dhl.com/track/shipments?trackingNumber=TRACK-100&service=express');
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', method: 'GET' });
  });
  it('never treats wrong reference, HTML, large payloads or 429 as verified', async () => {
    const body = { shipments: [{ id: 'DIFFERENT', service: 'express', status: { statusCode: 'transit' } }] };
    const wrong = vi.fn<typeof fetch>(async () => json(body));
    expect(await readDhlStatus('TRACK-100', 'fixture-key-not-real', wrong)).toEqual({ kind: 'missing' });
    expect(await readDhlStatus('TRACK-100', 'fixture-key-not-real', async () => new Response('<html>'))).toEqual({ kind: 'unavailable' });
    expect(await readDhlStatus('TRACK-100', 'fixture-key-not-real', async () => json({ giant: 'x'.repeat(160_000) }))).toEqual({ kind: 'unavailable' });
    expect(await readDhlStatus('TRACK-100', 'fixture-key-not-real', async () => json({}, 429))).toEqual({ kind: 'rate-limited' });
    wrong.mockClear();
    expect(await readDhlStatus('https://somewhere.example/path', 'fixture-key-not-real', wrong)).toEqual({ kind: 'missing' });
    expect(wrong).not.toHaveBeenCalled();
  });
  it('the bounded response reader rejects or truncates at a byte limit', async () => {
    await expect(readBoundedResponse(new Response('abcdefgh'), 3)).rejects.toThrow('RESPONSE_TOO_LARGE');
    await expect(readBoundedResponse(new Response('abcdefgh'), 3, true)).resolves.toBe('abc');
  });
});
