/**
 * خلاص الطلب — P5، الشريحة 3: اختيار الوسيلة، الكارطة، ووصل التحويل.
 *
 * الطلب يتخلق في `/api/checkout` (P5.2)؛ هنا **يتعلّق بيه الخلاص**:
 *  • `POST …/deposit/method` ⇐ اختيار CARD / BANK_TRANSFER / POSTE (الخادم يعيد
 *    حساب قسط العربون ويعطي الحالة).
 *  • `POST …/deposit-proof` ⇐ وصل التحويل/البرّيد (multipart، مع مرجع العملية).
 *  • الكارطة: `initiateCardPayment` في `checkout.ts` (نفس العقد، مستعمل هنا).
 *
 * ملاحظات عقد (مقروءة من `src/customer/routes.ts`):
 *  • ردود هذي المسارات **مغلّفة بـ`data`** — عكس `/api/checkout`. لهذا
 *    `apiSendData`.
 *  • الخادم يرفض الوصل كان الطلب ما هوش `AWAITING_DEPOSIT` أو الوسيلة موش
 *    تحويل/برّيد (`409`) — نعرضوا الحالة قبل ما نعرضوا زرّ الرفع.
 *  • الإحداثيات (RIB/الحساب البريدي) لازم تكون منشورة في الإعدادات، وإلا `503`
 *    `TRANSFER_DETAILS_UNAVAILABLE`: نقولوها، ما نخبّيوهاش.
 */
import { ApiError } from './errors';
import { apiSendData, type RequestOptions } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export type DepositMethod = 'CARD' | 'BANK_TRANSFER' | 'POSTE';

export interface DepositQuote {
  percent: number | null;
  baseAmountTND: number | null;
  discountPercent: number | null;
  discountTND: number | null;
  amountTND: number | null;
  balanceTND: number | null;
}

export interface DepositSelection {
  method: DepositMethod;
  paymentStatus: string;
  cardGatewayAvailable: boolean;
  quote: DepositQuote;
}

const parseQuote = (payload: unknown): DepositQuote => {
  const quote = isRecord(payload) ? payload : {};
  return {
    percent: num(quote.percent),
    baseAmountTND: num(quote.baseAmountTnd),
    discountPercent: num(quote.discountPercent),
    discountTND: num(quote.discountTnd),
    amountTND: num(quote.amountTnd),
    balanceTND: num(quote.balanceTnd),
  };
};

/** `POST /api/customer/account/orders/:id/deposit/method` (ردّ مغلّف بـ`data`). */
export async function selectDepositMethod(
  input: { orderId: string; method: DepositMethod },
  options: RequestOptions = {},
): Promise<DepositSelection> {
  const data = await apiSendData<unknown>(
    'POST',
    `/api/customer/account/orders/${encodeURIComponent(input.orderId)}/deposit/method`,
    { body: { method: input.method }, signal: options.signal, timeoutMs: options.timeoutMs },
  );
  if (!isRecord(data) || str(data.method) !== input.method) {
    throw new ApiError('malformed', 'Le serveur n’a pas confirmé le moyen choisi.');
  }
  return {
    method: input.method,
    paymentStatus: str(data.paymentStatus),
    cardGatewayAvailable: data.cardGatewayAvailable === true,
    quote: parseQuote(data.quote),
  };
}

export interface DepositProofInput {
  orderId: string;
  /** مسار الملف على الجهاز (JPG/PNG). الـPDF يقبلو الخادم، وتطبيق الصور ما يقراهش. */
  uri: string;
  mimeType: string;
  fileName?: string;
  /** مرجع العملية — إلزامي عند الخادم. */
  transferReference: string;
}

/** `POST …/deposit-proof` — الوصل يتبعث صورة مع مرجع العملية. */
export async function uploadDepositProof(
  input: DepositProofInput,
  options: RequestOptions = {},
): Promise<{ paymentStatus: string; proofStatus: string; submittedAt: string }> {
  const reference = input.transferReference.trim();
  if (!input.uri) throw new ApiError('malformed', 'Aucun justificatif à envoyer.');
  if (!reference) throw new ApiError('malformed', 'Référence du virement manquante.');

  const form = new FormData();
  const extension = input.mimeType === 'image/png' ? 'png' : 'jpg';
  form.append('proof', {
    uri: input.uri,
    name: input.fileName || `virement.${extension}`,
    type: input.mimeType,
  } as unknown as Blob);
  form.append('transferReference', reference);

  const data = await apiSendData<unknown>(
    'POST',
    `/api/customer/account/orders/${encodeURIComponent(input.orderId)}/deposit-proof`,
    { form, signal: options.signal, timeoutMs: options.timeoutMs ?? 60_000 },
  );
  if (!isRecord(data) || !str(data.proofStatus)) {
    throw new ApiError('malformed', 'Le serveur n’a pas confirmé la réception du justificatif.');
  }
  return {
    paymentStatus: str(data.paymentStatus),
    proofStatus: str(data.proofStatus),
    submittedAt: str(data.submittedAt),
  };
}

/** الوسائل اللي يسمح بيها الخادم في `deposit/method` — قائمة مغلقة. */
export const DEPOSIT_METHODS: DepositMethod[] = ['CARD', 'BANK_TRANSFER', 'POSTE'];

/** حالة الخلاص: هل ينجّم المستعمل يكمّل توّا؟ */
export function depositActionable(order: {
  status: string;
  paymentStatus: string;
  paymentMethod: string;
}): { canSelectMethod: boolean; canUploadProof: boolean; canPayByCard: boolean } {
  const settled = ['PAID', 'REFUNDED'].includes(order.paymentStatus);
  const acceptable = ['PENDING', 'FAILED', 'REJECTED'].includes(order.paymentStatus);
  const awaiting = order.status === 'AWAITING_DEPOSIT';
  return {
    // اختيار الوسيلة يتاح على طلب مازال ما تأكّدش خلاصه.
    canSelectMethod: !settled && awaiting,
    // الوصل: نفس شرط الخادم بالحرف (`AWAITING_DEPOSIT` + تحويل/برّيد + حالة مقبولة).
    canUploadProof: awaiting
      && (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'POSTE')
      && acceptable,
    canPayByCard: !settled && (awaiting || order.paymentMethod === 'CARD'),
  };
}
