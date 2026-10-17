/**
 * Dernier compte utilisé sur cet appareil — pour proposer « Continuer avec ce compte »
 * comme le fait ChatGPT, sans retaper l'adresse.
 *
 *  • on ne range QU'un fournisseur, une adresse et un nom : jamais de jeton ;
 *  • le stockage est le coffre de l'appareil (SecureStore), via le même backend que la session ;
 *  • un contenu illisible est ignoré (aucun compte affiché) plutôt que deviné.
 */
import { useCallback, useEffect, useState } from 'react';
import { openSecureBackend, type SecureBackend } from '@/state/sessionStore';

export const LAST_ACCOUNT_KEY = 'ayrovi.lastAccount.v1';

export type LastAccount =
  | { provider: 'google'; email: string; name?: string }
  | { provider: 'email'; email: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/** Lit un contenu stocké ; tout ce qui n'est pas exactement attendu donne `null`. */
export function parseLastAccount(raw: string | null): LastAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastAccount> & { name?: unknown };
    const email = typeof value.email === 'string' ? value.email.trim() : '';
    if (!EMAIL_SHAPE.test(email)) return null;
    if (value.provider === 'google') {
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      return name ? { provider: 'google', email, name } : { provider: 'google', email };
    }
    if (value.provider === 'email') return { provider: 'email', email };
    return null;
  } catch {
    return null;
  }
}

export function serializeLastAccount(account: LastAccount): string {
  return JSON.stringify(account);
}

export async function loadLastAccount(backend: SecureBackend): Promise<LastAccount | null> {
  return parseLastAccount(await backend.get(LAST_ACCOUNT_KEY));
}

export async function rememberLastAccount(backend: SecureBackend, account: LastAccount): Promise<void> {
  if (!EMAIL_SHAPE.test(account.email.trim())) return;
  await backend.set(LAST_ACCOUNT_KEY, serializeLastAccount({ ...account, email: account.email.trim() }));
}

export async function forgetLastAccount(backend: SecureBackend): Promise<void> {
  await backend.remove(LAST_ACCOUNT_KEY);
}

/**
 * Hook de l'écran de connexion : le compte mémorisé (ou `null`), et les deux
 * actions. `ready` passe à vrai une fois la lecture faite, pour ne pas afficher
 * un bouton qui disparaîtrait aussitôt.
 */
export function useRememberedAccount() {
  const [backend, setBackend] = useState<SecureBackend | null>(null);
  const [account, setAccount] = useState<LastAccount | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const opened = await openSecureBackend();
        const loaded = await loadLastAccount(opened.backend);
        if (!alive) return;
        setBackend(opened.backend);
        setAccount(loaded);
      } catch {
        // Pas de coffre disponible : on n'affiche simplement aucun compte mémorisé.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback(async (next: LastAccount) => {
    setAccount(next);
    if (backend) await rememberLastAccount(backend, next);
  }, [backend]);

  return { account, ready, remember };
}
