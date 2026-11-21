export const orderPeriods = ['recent', 'all'] as const;
export type OrderPeriod = typeof orderPeriods[number];

export function orderDate(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export const orderMonth = (date: Date) => date.toISOString().slice(0, 7);
export function sixMonthsBefore(date: Date) {
  const start = new Date(date);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 6);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start;
}

export function formatOrderDate(value: string, locale: 'ar' | 'fr', monthOnly = false) {
  const date = orderDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
    year: 'numeric', month: 'long', ...(monthOnly ? {} : { day: 'numeric' }), timeZone: 'UTC',
  }).format(date);
}

const ORDER_STEPS: Readonly<Record<string, number>> = {
  CREATED: 0, AWAITING_DEPOSIT: 0, AWAITING_PAYMENT_VERIFICATION: 0, CONFIRMED: 0,
  PREPARING: 1, SHIPPED: 2, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4,
};
export const orderStep = (status: string) => Object.prototype.hasOwnProperty.call(ORDER_STEPS, status) ? ORDER_STEPS[status] ?? null : null;
