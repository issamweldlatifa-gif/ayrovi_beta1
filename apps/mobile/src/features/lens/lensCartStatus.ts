import type { ZayroviCart } from '@/api/cart';

/** L'échéance la plus proche gouverne la capsule : c'est celle qui bloque en premier. */
export function earliestCartDeadline(cart: ZayroviCart | null | undefined): string {
  const deadlines = (cart?.items ?? [])
    .map((line) => line.priceTrustExpiresAt)
    .filter(Boolean)
    .map((value) => ({ value, at: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at);
  return deadlines[0]?.value ?? '';
}

export function remainingMs(deadline: string, now = Date.now()): number {
  const at = Date.parse(deadline);
  return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}

/** 30 minutes restent `30:00`; au-delà d'une heure on garde les minutes totales. */
export function formatCartCountdown(deadline: string, now = Date.now()): string {
  const seconds = Math.ceil(remainingMs(deadline, now) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Corrige l'horloge d'affichage avec l'instant renvoyé par le serveur. */
export function serverClockOffset(serverNow: string, receivedAt = Date.now()): number {
  const parsed = Date.parse(serverNow);
  return Number.isFinite(parsed) ? parsed - receivedAt : 0;
}
