export type OtpProvider = 'console' | 'webhook' | 'twilio_verify';

export interface OtpDeliveryResult {
  provider: OtpProvider;
  developmentCode?: string;
}

function configuredProvider(): OtpProvider | '' {
  const raw = String(process.env.CUSTOMER_OTP_PROVIDER || (process.env.NODE_ENV === 'production' ? '' : 'console'))
    .trim().toLowerCase();
  if (raw === 'twilio' || raw === 'twilio_verify' || raw === 'twilio-verify') return 'twilio_verify';
  if (raw === 'webhook') return 'webhook';
  if (raw === 'console' && process.env.NODE_ENV !== 'production') return 'console';
  return '';
}

function twilioConfig() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const serviceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  return {
    accountSid,
    authToken,
    serviceSid,
    ready: /^AC[a-zA-Z0-9]{30,40}$/.test(accountSid)
      && authToken.length >= 16
      && /^VA[a-zA-Z0-9]{30,40}$/.test(serviceSid),
  };
}

export function otpProviderName(): OtpProvider | '' {
  return configuredProvider();
}

export function phoneOtpAvailable(): boolean {
  const provider = configuredProvider();
  if (provider === 'console') return process.env.NODE_ENV !== 'production';
  if (provider === 'webhook') {
    return String(process.env.CUSTOMER_OTP_WEBHOOK_URL || '').startsWith('https://')
      && Boolean(process.env.CUSTOMER_OTP_WEBHOOK_TOKEN);
  }
  if (provider === 'twilio_verify') return twilioConfig().ready;
  return false;
}

function twilioAuthorization(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

async function twilioRequest(path: 'Verifications' | 'VerificationCheck', body: URLSearchParams): Promise<Response> {
  const config = twilioConfig();
  if (!config.ready) throw new Error('OTP_PROVIDER_NOT_CONFIGURED');
  return fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: twilioAuthorization(config.accountSid, config.authToken),
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
}

export async function deliverOtp(phone: string, code: string): Promise<OtpDeliveryResult> {
  const provider = configuredProvider();
  if (provider === 'console') {
    if (process.env.NODE_ENV !== 'test') console.info(`[Customer OTP] ${phone}: ${code}`);
    return { provider: 'console', developmentCode: code };
  }
  if (provider === 'twilio_verify') {
    const response = await twilioRequest('Verifications', new URLSearchParams({ To: phone, Channel: 'sms' }));
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(response.status === 429 ? 'OTP_RATE_LIMITED' : 'OTP_DELIVERY_FAILED');
    }
    const payload = await response.json().catch(() => null) as any;
    if (!payload || !['pending', 'approved'].includes(String(payload.status || ''))) {
      throw new Error('OTP_DELIVERY_FAILED');
    }
    return { provider: 'twilio_verify' };
  }
  if (provider !== 'webhook') throw new Error('OTP_PROVIDER_NOT_CONFIGURED');

  const url = String(process.env.CUSTOMER_OTP_WEBHOOK_URL || '');
  const token = String(process.env.CUSTOMER_OTP_WEBHOOK_TOKEN || '');
  if (!url.startsWith('https://') || !token) throw new Error('OTP_PROVIDER_NOT_CONFIGURED');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: phone,
      code,
      message: `Votre code AYROVI est ${code}. Il expire dans 5 minutes.`,
      purpose: 'customer_login',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'OTP_RATE_LIMITED' : 'OTP_DELIVERY_FAILED');
  return { provider: 'webhook' };
}

/** Twilio Verify owns the code; console/webhook codes continue to be checked locally. */
export async function verifyProviderOtp(provider: string, phone: string, code: string): Promise<boolean | null> {
  if (provider !== 'twilio_verify') return null;
  const response = await twilioRequest('VerificationCheck', new URLSearchParams({ To: phone, Code: code }));
  if (response.status === 400 || response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return false;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(response.status === 429 ? 'OTP_RATE_LIMITED' : 'OTP_VERIFICATION_FAILED');
  }
  const payload = await response.json().catch(() => null) as any;
  return String(payload?.status || '') === 'approved';
}
