import type { QatafoDatabase } from '../db/database';
import { FINANCE_REGISTER_PERIODS, FINANCE_TRANSACTION_STATUSES, type FinanceRegisterResult, type FinanceRegisterRow, type FinanceTransactionStatus } from '../../shared/financeTransactionRegister';

const PAGE_SIZE = 25;
export function parseRegisterQuery(query: Record<string, unknown>) {
  const days = query.days === undefined ? 30 : typeof query.days === 'string' ? Number(query.days) : NaN;
  const page = query.page === undefined ? 1 : typeof query.page === 'string' ? Number(query.page) : NaN;
  const status = query.status ?? '';
  const reference = query.reference ?? '';
  if (!FINANCE_REGISTER_PERIODS.some(value => value === days) || !Number.isSafeInteger(page) || page < 1 || page > 10_000 ||
      typeof status !== 'string' || (status && !FINANCE_TRANSACTION_STATUSES.some(value => value === status)) ||
      typeof reference !== 'string' || reference.length > 80 || !/^[A-Za-z0-9_-]*$/.test(reference.trim())) return null;
  return { days, page, status: status as FinanceTransactionStatus | '', reference: reference.trim().toUpperCase() };
}

export function readRegister(db: QatafoDatabase, filter: NonNullable<ReturnType<typeof parseRegisterQuery>>, now = new Date()): FinanceRegisterResult {
  const to = now.toISOString();
  const from = new Date(now.getTime() - filter.days * 86_400_000).toISOString();
  const where = ['t.created_at >= ?', 't.created_at <= ?'];
  const args: string[] = [from, to];
  if (filter.status) { where.push('t.status = ?'); args.push(filter.status); }
  if (filter.reference) { where.push('(t.transaction_number = ? OR o.order_number = ?)'); args.push(filter.reference, filter.reference); }
  const scope = `FROM payment_transactions t JOIN orders o ON o.id=t.order_id WHERE ${where.join(' AND ')}`;
  // Positive allowlist: no customer identity, provider payload, banking reference, or payment link.
  return db.transaction(() => {
    const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) count ${scope}`, ...args)?.count ?? 0);
    const rows = db.all<FinanceRegisterRow>(`SELECT t.id,t.transaction_number AS transactionNumber,
      o.id AS orderId,o.order_number AS orderNumber,t.provider,t.status,t.amount_tnd AS amountTnd,
      t.created_at AS createdAt,t.confirmed_at AS confirmedAt ${scope}
      ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?`, ...args, PAGE_SIZE, (filter.page - 1) * PAGE_SIZE);
    return { rows, window: { from, to, basis: 'attempt_created_at' }, pagination: { page: filter.page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) } };
  });
}
