export interface OtpDeliveryResult {
  provider: 'console' | 'webhook';
  developmentCode?: string;
}

export function phoneOtpAvailable(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.CUSTOMER_OTP_PROVIDER === 'webhook'
    && Boolean(process.env.CUSTOMER_OTP_WEBHOOK_URL)
    && Boolean(process.env.CUSTOMER_OTP_WEBHOOK_TOKEN);
}

export async function deliverOtp(phone: string, code: string): Promise<OtpDeliveryResult> {
  const provider = (process.env.CUSTOMER_OTP_PROVIDER || (process.env.NODE_ENV === 'production' ? '' : 'console')).toLowerCase();
  if (provider === 'console' && process.env.NODE_ENV !== 'production') {
    if (process.env.NODE_ENV !== 'test') console.info(`[Customer OTP] ${phone}: ${code}`);
    return { provider: 'console', developmentCode: code };
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
  if (!response.ok) throw new Error('OTP_DELIVERY_FAILED');
  return { provider: 'webhook' };
}
