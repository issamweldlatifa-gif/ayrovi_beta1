import { afterEach, describe, expect, test, vi } from 'vitest';
import { mailerReady, sendMail } from '../src/services/mailer';

const original = {
  provider: process.env.MAIL_PROVIDER,
  key: process.env.MAIL_API_KEY,
  from: process.env.MAIL_FROM,
};

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  restore('MAIL_PROVIDER', original.provider);
  restore('MAIL_API_KEY', original.key);
  restore('MAIL_FROM', original.from);
});

describe('transactional mail readiness', () => {
  test('requires a supported provider, API key and valid sender address', async () => {
    process.env.MAIL_PROVIDER = 'brevo';
    process.env.MAIL_API_KEY = 'test-key';
    process.env.MAIL_FROM = '';
    expect(mailerReady()).toBe(false);

    process.env.MAIL_FROM = 'not-an-email';
    expect(mailerReady()).toBe(false);

    process.env.MAIL_FROM = 'AYROVI <no-reply@ayrovi.tn>';
    expect(mailerReady()).toBe(true);

    process.env.MAIL_PROVIDER = 'unsupported';
    expect(mailerReady()).toBe(false);
    const disabled = await sendMail({ to: 'client@example.com', subject: 'Test', html: '<p>Test</p>' });
    expect(disabled).toMatchObject({ delivered: false, error: 'MAILER_NOT_CONFIGURED' });
  });
});


describe('mail provider transport contracts', () => {
  test.each(['resend', 'brevo', 'sendgrid'])('%s submits a real provider request and reports acceptance', async (provider) => {
    process.env.MAIL_PROVIDER = provider;
    process.env.MAIL_API_KEY = 'test-key-not-real';
    process.env.MAIL_FROM = 'AYROVI <no-reply@example.com>';
    const transport = vi.fn().mockResolvedValue(new Response('{}', {status: 202}));
    vi.stubGlobal('fetch', transport);
    expect(await sendMail({to: 'customer@example.com', subject: 'Welcome', html: '<p>Welcome</p>', idempotencyKey: 'test-job'})).toMatchObject({provider, delivered: true});
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(provider === 'resend' ? 'https://api.resend.com/emails' : provider === 'brevo' ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.sendgrid.com/v3/mail/send');
    const body = JSON.parse(init.body);
    if (provider === 'resend') { expect(body.to).toEqual(['customer@example.com']); expect(init.headers['Idempotency-Key']).toBe('test-job'); }
    if (provider === 'brevo') { expect(body.sender.email).toBe('no-reply@example.com'); expect(body.to[0].email).toBe('customer@example.com'); expect(body.htmlContent).toBe('<p>Welcome</p>'); }
    if (provider === 'sendgrid') { expect(body.personalizations[0].to[0].email).toBe('customer@example.com'); expect(body.content[0].value).toBe('<p>Welcome</p>'); }
  });
  test('provider rejection and network exceptions never report delivery', async () => {
    process.env.MAIL_PROVIDER = 'resend'; process.env.MAIL_API_KEY = 'test'; process.env.MAIL_FROM = 'no-reply@example.com';
    const transport = vi.fn().mockResolvedValueOnce(new Response('{}', {status: 401})).mockRejectedValueOnce(new Error('connection failed'));
    vi.stubGlobal('fetch', transport);
    const input = {to: 'customer@example.com', subject: 'Test', html: '<p>Test</p>'};
    expect(await sendMail(input)).toMatchObject({delivered:false,error:'HTTP_401'});
    expect(await sendMail(input)).toMatchObject({delivered:false,error:'MAIL_EXCEPTION'});
  });
});
