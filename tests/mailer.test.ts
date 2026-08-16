import { afterEach, describe, expect, test } from 'vitest';
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
