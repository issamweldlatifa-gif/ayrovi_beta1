/**
 * Réservation temporaire du panier (20 minutes) — état partagé léger entre
 * la fiche produit, les feuilles d'ajout et le panier officiel.
 *
 * Dès qu'un article est ajouté au panier, un créneau de réservation de 20 minutes
 * démarre (ou se prolonge) afin d'alimenter la pastille compte à rebours `MM:SS`
 * en haut à droite de la fiche produit ainsi que le tiroir « Panier réservé ».
 */
import { useCallback, useEffect, useState } from 'react';

export const CART_RESERVATION_DURATION_MS = 20 * 60 * 1000;

let reservationExpiresAtMs = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function touchCartReservation(nowMs: number = Date.now()): number {
  reservationExpiresAtMs = nowMs + CART_RESERVATION_DURATION_MS;
  emit();
  return reservationExpiresAtMs;
}

export function clearCartReservation(): void {
  if (reservationExpiresAtMs === 0) return;
  reservationExpiresAtMs = 0;
  emit();
}

export function getCartReservationExpiresAt(): number {
  return reservationExpiresAtMs;
}

export function formatReservationCountdown(remainingMs: number): string {
  const clampedSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(clampedSeconds / 60);
  const seconds = clampedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getCartReservationSnapshot(
  activeItemCount: number,
  nowMs: number = Date.now(),
): { active: boolean; countdown: string; remainingMs: number } {
  const remainingMs = activeItemCount > 0 ? Math.max(0, reservationExpiresAtMs - nowMs) : 0;
  const active = activeItemCount > 0 && remainingMs > 0;
  return {
    active,
    countdown: formatReservationCountdown(remainingMs),
    remainingMs,
  };
}

export function useCartReservation(activeItemCount: number): {
  active: boolean;
  countdown: string;
  remainingMs: number;
  touch: () => void;
} {
  const [expiresAt, setExpiresAt] = useState<number>(() => reservationExpiresAtMs);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const sync = () => {
      setExpiresAt(reservationExpiresAtMs);
      setNow(Date.now());
    };
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  useEffect(() => {
    if (activeItemCount <= 0 || expiresAt <= Date.now()) return undefined;
    setNow(Date.now());
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [activeItemCount, expiresAt]);

  const remainingMs = activeItemCount > 0 ? Math.max(0, expiresAt - now) : 0;
  const active = activeItemCount > 0 && remainingMs > 0;
  const countdown = formatReservationCountdown(remainingMs);
  const touch = useCallback(() => {
    touchCartReservation();
  }, []);

  return { active, countdown, remainingMs, touch };
}
