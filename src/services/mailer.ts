/**
 * AYROVI Mailer — إرسال البريد عبر مزوّدات HTTP (بدون مكتبات إضافية).
 *
 * المزوّدات المدعومة عبر MAIL_PROVIDER:
 *   - resend    (https://resend.com)        → MAIL_API_KEY=re_...
 *   - brevo     (https://brevo.com)         → MAIL_API_KEY=xkeysib-...
 *   - sendgrid  (https://sendgrid.com)      → MAIL_API_KEY=SG....
 *
 * MAIL_FROM   : "AYROVI <no-reply@votredomaine.tn>" (يجب أن يكون مُتحققًا منه لدى المزوّد)
 *
 * بدون إعداد → يكتب في السجل فقط (console) ولا يفشل أبدًا.
 */
import fs from 'node:fs';

export interface MailAttachment { filename: string; path: string; type?: string }
export interface MailInput { to: string; subject: string; html: string; attachments?: MailAttachment[] }
export interface MailResult { provider: string; delivered: boolean; error?: string }

const SUPPORTED = new Set(['resend', 'brevo', 'sendgrid']);

export function mailerReady(): boolean {
  const provider = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  const from = parseFrom((process.env.MAIL_FROM || '').trim());
  return SUPPORTED.has(provider)
    && Boolean((process.env.MAIL_API_KEY || '').trim())
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.email);
}

function parseFrom(raw: string): { email: string; name?: string } {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { email: match[2].trim(), name: match[1].trim() || undefined };
  return { email: raw.trim() };
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const provider = (process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  const apiKey = (process.env.MAIL_API_KEY || '').trim();
  const from = (process.env.MAIL_FROM || '').trim() || 'AYROVI <no-reply@ayrovi.tn>';

  if (!mailerReady()) {
    console.info(`[Mail] (غير مفعّل — MAIL_PROVIDER=${provider || 'غير مضبوط'}) إلى=${input.to} الموضوع="${input.subject}"`);
    return { provider: provider || 'console', delivered: false, error: 'MAILER_NOT_CONFIGURED' };
  }

  const attachments = (input.attachments || []).map((item) => ({
    filename: item.filename,
    type: item.type || 'application/pdf',
    content: fs.readFileSync(item.path).toString('base64'),
  }));

  try {
    let response: Response;
    if (provider === 'resend') {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          attachments: attachments.map(({ filename, content }) => ({ filename, content })),
        }),
        signal: AbortSignal.timeout(12_000),
      });
    } else if (provider === 'brevo') {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: parseFrom(from),
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          attachment: attachments.map(({ filename, content }) => ({ name: filename, content })),
        }),
        signal: AbortSignal.timeout(12_000),
      });
    } else {
      response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.to }] }],
          from: parseFrom(from),
          subject: input.subject,
          content: [{ type: 'text/html', value: input.html }],
          attachments: attachments.map(({ filename, content, type }) => ({ filename, content, type })),
        }),
        signal: AbortSignal.timeout(12_000),
      });
    }

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.warn(`[Mail] فشل الإرسال عبر ${provider}: HTTP ${response.status} ${details.slice(0, 200)}`);
      return { provider, delivered: false, error: `HTTP_${response.status}` };
    }
    console.info(`[Mail] أُرسل عبر ${provider} إلى ${input.to} — "${input.subject}"`);
    return { provider, delivered: true };
  } catch (error: any) {
    console.warn('[Mail] خطأ أثناء الإرسال:', error?.message || error);
    return { provider, delivered: false, error: 'MAIL_EXCEPTION' };
  }
}
