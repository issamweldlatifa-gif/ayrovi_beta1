/**
 * AYROVI Invoice Service — توليد فاتورة PDF محلية بدون متصفح headless.
 *
 * - تُحفظ الفواتير في  <dataDir>/uploads/invoices/<invoice_number>.pdf
 *   (على Render: داخل القرص الدائم ayrovi-data).
 * - لا يعتمد التوليد على Chromium، لذلك يعمل بنفس النتيجة محليًا وفي الإنتاج.
 * - المسار يُبنى دائمًا من رقم الفاتورة المخزَّن في قاعدة البيانات (لا مدخلات مستخدم).
 */
import fs from 'node:fs';
import path from 'node:path';
import { QatafoDatabase } from '../db/database';
import { writeSimplePdf, PdfLine } from './simplePdf';

function uploadsRoot(): string {
  const dbPath = process.env.DATABASE_PATH || './data/qatafo_cart.sqlite';
  return path.join(path.dirname(path.resolve(dbPath)), 'uploads');
}

export function uploadsDir(kind: 'invoices' | 'deposits'): string {
  const dir = path.join(uploadsRoot(), kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function invoiceAbsolutePath(invoiceNumber: string): string {
  // رقم الفاتورة يأتي من قاعدة البيانات فقط — نعقم الاسم دفاعيًا مع ذلك.
  const safe = invoiceNumber.replace(/[^A-Z0-9-]/gi, '');
  return path.join(uploadsDir('invoices'), `${safe}.pdf`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(value: any): string {
  return `${Number(value || 0).toFixed(3)} DT`;
}

const METHOD_LABELS: Record<string, string> = {
  CARD: 'Carte bancaire',
  FLOUCI: 'Flouci',
  BANK_TRANSFER: 'Virement bancaire',
  POSTE: 'Mandat postal',
  COD: 'À la livraison',
  D17: 'D17',
};

export function buildInvoiceHtml(db: QatafoDatabase, orderId: string): string {
  const order = db.get<any>('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const items = db.all<any>('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at', orderId);
  const customer = db.get<any>('SELECT * FROM customers WHERE id=?', order.customer_id);
  const account = order.account_id ? db.get<any>('SELECT id,display_name,email FROM customer_accounts WHERE id=?', order.account_id) : null;
  const setting = (key: string, fallback = '') => db.get<any>('SELECT setting_value FROM settings WHERE setting_key=?', key)?.setting_value ?? fallback;

  const company = {
    name: String(setting('company_legal_name', '') || setting('company_name', 'AYROVI')),
    email: String(setting('company_email', 'contact@ayrovi.tn')),
    phone: String(setting('company_phone', '')),
    address: String(setting('company_address', 'Tunis, Tunisie')),
  };
  const deposit = Number(order.deposit_amount_tnd || 0);
  const total = Number(order.total_tnd || 0);
  const balance = Math.max(0, Math.round((total - deposit) * 1000) / 1000);
  const issuedAt = new Date(order.deposit_paid_at || order.updated_at || order.created_at);
  const methodLabel = METHOD_LABELS[String(order.payment_method || '').toUpperCase()] || order.payment_method;
  const depositPaid = String(order.deposit_status) === 'PAID';
  const depositState = depositPaid ? 'encaissé' : String(order.deposit_status) === 'REJECTED' ? 'à régulariser' : 'à régler';

  const itemRows = items.map((item: any) => `
    <tr>
      <td>
        <strong>${escapeHtml(item.product_name)}</strong>
        <small>${escapeHtml(item.source_platform)}${item.variant ? ` · ${escapeHtml(item.variant)}` : ''}</small>
      </td>
      <td class="num">${Number(item.quantity)}</td>
      <td class="num">${money(item.converted_price_tnd)}</td>
      <td class="num">${money(item.total_tnd)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Facture ${escapeHtml(order.invoice_number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1A1A1A; font-size: 13px; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #003B39; padding-bottom: 20px; }
  .brand { font-size: 26px; font-weight: 900; color: #003B39; letter-spacing: -0.5px; }
  .brand small { display: block; font-size: 11px; color: #6b7280; font-weight: 600; margin-top: 6px; letter-spacing: 0; }
  .doc { text-align: right; }
  .doc h1 { font-size: 22px; font-weight: 900; }
  .doc .num { color: #003B39; font-family: ui-monospace, monospace; font-size: 15px; margin-top: 4px; }
  .meta { display: flex; gap: 24px; margin: 24px 0; }
  .card { flex: 1; border: 1px solid #e5e7f0; border-radius: 12px; padding: 14px 16px; }
  .card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #8b8494; margin-bottom: 8px; }
  .card p { line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; }
  th { background: #EDE6DE; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #003B39; padding: 10px 12px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eef0f6; vertical-align: top; }
  td small { display: block; color: #8b8494; margin-top: 3px; font-size: 11px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { width: 320px; margin-left: auto; }
  .totals td { padding: 7px 12px; }
  .totals .grand td { font-size: 15px; font-weight: 900; border-top: 2px solid #1A1A1A; }
  .deposit { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; margin-top: 20px; }
  .deposit strong { color: #047857; }
  .deposit table { margin: 6px 0 0; }
  .deposit td { border: none; padding: 4px 0; }
  .tracking { background: #EDE6DE; border: 1px dashed #003B39; border-radius: 12px; padding: 14px 16px; margin-top: 16px; text-align: center; }
  .tracking b { font-family: ui-monospace, monospace; font-size: 17px; color: #003B39; letter-spacing: 1px; }
  footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e5e7f0; color: #8b8494; font-size: 11px; text-align: center; line-height: 1.6; }
</style></head><body>
  <div class="header">
    <div class="brand">${escapeHtml(company.name)}
      <small>${escapeHtml(company.address)} · ${escapeHtml(company.email)}${company.phone ? ` · ${escapeHtml(company.phone)}` : ''}</small>
    </div>
    <div class="doc">
      <h1>FACTURE ÉLECTRONIQUE</h1>
      <div class="num">${escapeHtml(order.invoice_number)}</div>
      <p>Émise le ${issuedAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
    </div>
  </div>

  <div class="meta">
    <div class="card">
      <h3>Facturé à</h3>
      <p><strong>${escapeHtml(customer?.name || account?.display_name || 'Client AYROVI')}</strong><br>
      ${escapeHtml(order.address)}<br>${escapeHtml(order.governorate)}<br>
      ${escapeHtml(order.phone)}${order.contact_email || account?.email ? `<br>${escapeHtml(order.contact_email || account.email)}` : ''}</p>
    </div>
    <div class="card">
      <h3>Commande</h3>
      <p><strong>${escapeHtml(order.order_number)}</strong><br>
      Passée le ${new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br>
      Paiement de l'acompte : <strong>${escapeHtml(methodLabel)}</strong></p>
    </div>
  </div>

  <table>
    <thead><tr><th>Article</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals"><tbody>
    <tr><td>Sous-total articles</td><td class="num">${money(order.subtotal_tnd)}</td></tr>
    ${Number(order.customs_tnd) ? `<tr><td>Douane & formalités</td><td class="num">${money(order.customs_tnd)}</td></tr>` : ''}
    ${Number(order.shipping_tnd) ? `<tr><td>Transport international</td><td class="num">${money(order.shipping_tnd)}</td></tr>` : ''}
    ${Number(order.service_tnd) ? `<tr><td>Frais de service AYROVI</td><td class="num">${money(order.service_tnd)}</td></tr>` : ''}
    ${Number(order.express_tnd) ? `<tr><td>Express</td><td class="num">${money(order.express_tnd)}</td></tr>` : ''}
    ${Number(order.discount_tnd) ? `<tr><td>Remise</td><td class="num">−${money(order.discount_tnd)}</td></tr>` : ''}
    <tr class="grand"><td>Total de la commande</td><td class="num">${money(total)}</td></tr>
  </tbody></table>

  <div class="deposit">
    <strong>${depositPaid ? '✓' : '•'} Acompte de confirmation ${depositState} (${Number(order.deposit_percent || 20)}%)</strong>
    <table><tbody>
      ${Number(order.deposit_discount_tnd) ? `<tr><td>Acompte (${Number(order.deposit_percent || 20)}%) avant remise</td><td class="num">${money(Number(deposit) + Number(order.deposit_discount_tnd))}</td></tr>
      <tr><td>Remise paiement par carte</td><td class="num" style="color:#047857;">−${money(order.deposit_discount_tnd)}</td></tr>` : ''}
      <tr><td>Acompte ${depositState} (${escapeHtml(methodLabel)})</td><td class="num"><strong>${money(deposit)}</strong></td></tr>
      <tr><td>${depositPaid ? 'Solde restant à la livraison' : 'Solde après règlement de l’acompte'}</td><td class="num">${money(balance)}</td></tr>
    </tbody></table>
  </div>

  ${order.tracking_code ? `<div class="tracking">Code de suivi de votre commande<br><b>${escapeHtml(order.tracking_code)}</b></div>` : ''}

  <footer>
    Facture électronique générée automatiquement par ${escapeHtml(company.name)} — ${escapeHtml(company.address)}.<br>
    ${depositPaid ? 'Acompte encaissé ; le solde est payable à la livraison.' : 'Commande enregistrée ; sa confirmation reste soumise au règlement de l’acompte.'} Merci de votre confiance.
  </footer>
</body></html>`;
}

/** نموذج نصي مسطّح للفاتورة — المصدر الحتمي لمولد PDF المحلي بدون Chromium. */
export function buildInvoiceLines(db: QatafoDatabase, orderId: string): PdfLine[] {
  const DARK_TEAL: [number, number, number] = [0, 0.231, 0.224];
  const GREY: [number, number, number] = [0.32, 0.38, 0.37];
  const order = db.get<any>('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const items = db.all<any>('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at', orderId);
  const customer = db.get<any>('SELECT * FROM customers WHERE id=?', order.customer_id);
  const setting = (key: string, fallback = '') => db.get<any>('SELECT setting_value FROM settings WHERE setting_key=?', key)?.setting_value ?? fallback;
  const company = String(setting('company_legal_name', '') || setting('company_name', 'AYROVI'));
  const m = (v: any) => `${Number(v || 0).toFixed(3)} DT`;
  const deposit = Number(order.deposit_amount_tnd || 0);
  const balance = Math.max(0, Math.round((Number(order.total_tnd) - deposit) * 1000) / 1000);
  const methodLabel = METHOD_LABELS[String(order.payment_method || '').toUpperCase()] || order.payment_method;
  const depositPaid = String(order.deposit_status) === 'PAID';
  const depositState = depositPaid ? 'encaissé' : String(order.deposit_status) === 'REJECTED' ? 'à régulariser' : 'à régler';

  const lines: PdfLine[] = [
    { text: company, size: 22, bold: true, color: DARK_TEAL },
    { text: `${setting('company_address', 'Tunis, Tunisie')} · ${setting('company_email', '')}`.replace(/ · $/, ''), size: 9, color: GREY },
    { text: '', size: 4 },
    { text: 'FACTURE ÉLECTRONIQUE', size: 16, bold: true },
    { text: String(order.invoice_number), size: 12, bold: true, color: DARK_TEAL },
    { text: `Commande ${order.order_number} — ${new Date(order.created_at).toLocaleDateString('fr-FR')}`, size: 9, color: GREY },
    { text: `Statut : ${String(order.status).replaceAll('_', ' ')} · Acompte ${depositState}`, size: 9, color: GREY },
    { text: '', size: 4 },
    { text: `Facturé à : ${customer?.name || 'Client AYROVI'} — ${order.governorate} — ${order.phone}`, size: 10 },
    { text: `Adresse : ${String(order.address).slice(0, 90)}`, size: 9, color: GREY },
    { text: `Paiement de l'acompte : ${methodLabel}`, size: 9, color: GREY },
    { text: '', size: 4 }, { text: '', rule: true },
    { text: 'Article', size: 10, bold: true },
  ];
  lines.push({ text: '', rule: true });
  for (const item of items) {
    const name = String(item.product_name).length > 58 ? `${String(item.product_name).slice(0, 58)}…` : String(item.product_name);
    lines.push({ text: `${item.quantity} × ${name}`, size: 10 });
    lines.push({ text: `${item.source_platform} — ${m(item.converted_price_tnd)} / unité`, size: 9, color: GREY, right: true, x: 300 });
    lines.push({ text: m(item.total_tnd), size: 10, bold: true, right: true });
  }
  lines.push({ text: '', rule: true }, { text: '', size: 4 });
  const addTotal = (label: string, value: any, bold = false, color?: [number, number, number]) => lines.push({ text: `${label}`, size: 10, bold, color, x: 300 }, { text: m(value), size: 10, bold, color, right: true });
  if (Number(order.shipping_tnd)) addTotal('Transport international', order.shipping_tnd);
  if (Number(order.customs_tnd)) addTotal('Douane & formalités', order.customs_tnd);
  if (Number(order.service_tnd)) addTotal('Frais de service', order.service_tnd);
  if (Number(order.discount_tnd)) addTotal('Remise', -Number(order.discount_tnd));
  addTotal('TOTAL DE LA COMMANDE', order.total_tnd, true);
  lines.push({ text: '', size: 3 });
  if (Number(order.deposit_discount_tnd)) addTotal('Remise paiement par carte', -Number(order.deposit_discount_tnd), false, [0.02, 0.47, 0.36]);
  addTotal(`Acompte ${depositState} (${Number(order.deposit_percent || 20)}%) — ${methodLabel}`, deposit, true, depositPaid ? [0.02, 0.47, 0.36] : [0.65, 0.47, 0.19]);
  addTotal(depositPaid ? 'Solde restant à la livraison' : 'Solde après règlement de l’acompte', balance, true);
  if (order.tracking_code) {
    lines.push({ text: '', size: 4 }, { text: `Code de suivi : ${order.tracking_code}`, size: 12, bold: true, color: DARK_TEAL });
  }
  lines.push(
    { text: '', size: 8 },
    { text: `Facture électronique générée automatiquement par ${company}.`, size: 8, color: GREY, x: 120 },
    { text: depositPaid
      ? 'Acompte encaissé ; le solde est payable à la livraison. Merci de votre confiance.'
      : 'Commande enregistrée ; sa confirmation reste soumise au règlement de l’acompte.', size: 8, color: GREY, x: 90 },
  );
  return lines;
}

export async function generateInvoicePdf(db: QatafoDatabase, orderId: string): Promise<string> {
  const order = db.get<any>('SELECT id,invoice_number FROM orders WHERE id=?', orderId);
  if (!order?.invoice_number) throw new Error('INVOICE_NUMBER_MISSING');
  const target = invoiceAbsolutePath(String(order.invoice_number));

  // Deterministic local generation: no browser binary, sandbox flags or system libraries.
  writeSimplePdf(buildInvoiceLines(db, orderId), target);
  db.run('UPDATE orders SET invoice_path=?, updated_at=? WHERE id=?', target, new Date().toISOString(), orderId);
  return target;
}

export function invoiceEmailHtml(input: { customerName: string; orderNumber: string; invoiceNumber: string; trackingCode: string; totalLabel: string; depositLabel: string; balanceLabel: string; company: string }): string {
  const e = escapeHtml;
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#1A1A1A;background:#F9F8F4;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e2ee;">
    <div style="background:#003B39;padding:22px 26px;color:#fff;">
      <strong style="font-size:20px;">${e(input.company)}</strong>
      <p style="margin:4px 0 0;font-size:12px;opacity:.85;">Confirmation d'acompte & facture électronique</p>
    </div>
    <div style="padding:26px;">
      <p>Bonjour <strong>${e(input.customerName)}</strong>,</p>
      <p style="margin-top:10px;line-height:1.6;">Votre acompte de <strong>${e(input.depositLabel)}</strong> a bien été reçu pour la commande
      <strong>${e(input.orderNumber)}</strong> (total ${e(input.totalLabel)}). Votre commande est <strong>confirmée</strong> et passe en préparation.</p>
      <table style="width:100%;margin:18px 0;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Facture</td><td style="text-align:right;font-weight:700;">${e(input.invoiceNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Acompte encaissé</td><td style="text-align:right;font-weight:700;color:#047857;">${e(input.depositLabel)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Solde à la livraison</td><td style="text-align:right;font-weight:700;">${e(input.balanceLabel)}</td></tr>
        ${input.trackingCode ? `<tr><td style="padding:8px 0;color:#6b7280;">Code de suivi</td><td style="text-align:right;font-weight:700;color:#003B39;font-family:monospace;">${e(input.trackingCode)}</td></tr>` : ''}
      </table>
      <p style="line-height:1.6;color:#374151;">Votre facture électronique est jointe à cet e-mail en PDF. Vous pouvez aussi la télécharger à tout moment depuis votre espace client AYROVI (Commandes → ${e(input.orderNumber)}).</p>
      <p style="margin-top:22px;font-size:12px;color:#8b8494;">Merci de votre confiance — l'équipe ${e(input.company)}</p>
    </div>
  </div>
</body></html>`;
}
