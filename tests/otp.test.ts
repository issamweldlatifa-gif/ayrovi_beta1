import { afterEach, describe, expect, test, vi } from 'vitest';
import { deliverOtp, phoneOtpAvailable, verifyProviderOtp } from '../src/customer/otp';

const original = {
  provider: process.env.CUSTOMER_OTP_PROVIDER,
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
};

function configureTwilio() {
  process.env.CUSTOMER_OTP_PROVIDER = 'twilio_verify';
  process.env.TWILIO_ACCOUNT_SID = `AC${'a'.repeat(32)}`;
  process.env.TWILIO_AUTH_TOKEN = 'test-auth-token-0123456789abcdef';
  process.env.TWILIO_VERIFY_SERVICE_SID = `VA${'b'.repeat(32)}`;
}

afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  };
  restore('CUSTOMER_OTP_PROVIDER', original.provider);
  restore('TWILIO_ACCOUNT_SID', original.accountSid);
  restore('TWILIO_AUTH_TOKEN', original.authToken);
  restore('TWILIO_VERIFY_SERVICE_SID', original.serviceSid);
  vi.restoreAllMocks();
});

describe('Twilio Verify OTP adapter', () => {
  test('reports readiness only when all Twilio credentials are structurally valid', () => {
    process.env.CUSTOMER_OTP_PROVIDER = 'twilio_verify';
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    expect(phoneOtpAvailable()).toBe(false);
    configureTwilio();
    expect(phoneOtpAvailable()).toBe(true);
  });

  test('starts an SMS verification without exposing the locally generated code', async () => {
    configureTwilio();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ status: 'pending', channel: 'sms' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));

    const result = await deliverOtp('+21698123456', '654321');
    expect(result).toEqual({ provider: 'twilio_verify' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/Services/VA${'b'.repeat(32)}/Verifications`);
    expect(String(init?.body)).toContain('To=%2B21698123456');
    expect(String(init?.body)).toContain('Channel=sms');
    expect(String(init?.body)).not.toContain('654321');
    expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
  });

  test('checks the customer code through Twilio and distinguishes invalid codes', async () => {
    configureTwilio();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'approved' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 20404 }), {
        status: 404, headers: { 'content-type': 'application/json' },
      }));

    await expect(verifyProviderOtp('twilio_verify', '+21698123456', '123456')).resolves.toBe(true);
    await expect(verifyProviderOtp('twilio_verify', '+21698123456', '000000')).resolves.toBe(false);
    const firstBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(firstBody).toContain('Code=123456');
    expect(firstBody).toContain('To=%2B21698123456');
  });

  test('keeps local verification for console and generic webhook providers', async () => {
    await expect(verifyProviderOtp('console', '+21698123456', '123456')).resolves.toBeNull();
    await expect(verifyProviderOtp('webhook', '+21698123456', '123456')).resolves.toBeNull();
  });
});
