/** Read-only projection of ZAYROVI payment attempts, not a bank statement or accounting ledger. */
export const FINANCE_REGISTER_PERIODS = [7, 30, 90] as const;
export const FINANCE_TRANSACTION_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REJECTED', 'REFUNDED'] as const;
export type FinanceTransactionStatus = typeof FINANCE_TRANSACTION_STATUSES[number];
export type FinanceRegisterRow = {
  id: string;
  transactionNumber: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  status: FinanceTransactionStatus;
  amountTnd: number;
  createdAt: string;
  confirmedAt: string | null;
};
export type FinanceRegisterResult = {
  rows: FinanceRegisterRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  window: { from: string; to: string; basis: 'attempt_created_at' };
};
