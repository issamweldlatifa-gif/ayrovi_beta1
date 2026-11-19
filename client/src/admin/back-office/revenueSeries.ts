const DAY_MS = 86_400_000;

/** The API groups ISO timestamps by UTC date. Fill missing days without inventing sales. */
export function makeRevenueSeries(daily: readonly { date: string; revenue: number }[], days: number, now = new Date()) {
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const byDate = new Map(daily.map(row => [row.date, Number.isFinite(row.revenue) ? row.revenue : 0]));
  return Array.from({ length: days + 1 }, (_, offset) => {
    const date = new Date(todayUTC - (days - offset) * DAY_MS).toISOString().slice(0, 10);
    return { date, value: byDate.get(date) ?? 0 };
  });
}
