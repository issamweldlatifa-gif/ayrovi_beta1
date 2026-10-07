/**
 * Session du client : une seule source de vérité pour « qui est connecté ».
 *
 * Ce que ce fournisseur garantit :
 *   • l'application se DÉCLARE au serveur (`x-ayrovi-client`) avant toute
 *     connexion — sinon le serveur répondrait avec un cookie que l'application
 *     ne peut pas lire, et la connexion serait perdue à la fermeture ;
 *   • le jeton obtenu est rangé dans le trousseau de l'appareil, jamais dans les
 *     préférences ;
 *   • au démarrage, le jeton rangé est VALIDÉ auprès du serveur (`/auth/me`) :
 *     une session révoquée ailleurs ne laisse pas l'application croire qu'elle
 *     est encore connectée ;
 *   • une déconnexion révoque côté serveur ET vide l'appareil. Si le réseau
 *     empêche la révocation, le jeton est gardé en quarantaine et l'appel est
 *     rejoué au lancement suivant — « se déconnecter » ne doit jamais laisser
 *     une session vivante pendant trente jours.
 *
 * Le fournisseur ne peint rien et ne connaît aucun écran : les écrans lisent
 * `useSession()` et décident de leur mise en page.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { CLIENT_HEADER } from '@/api/config';
import { resetAuthContext, setAuthContext, setCsrfRefresher } from '@/api/client';
import {
  emailLogin, emailRegister, fetchMe, logout as apiLogout, requestOtp, verifyOtp,
  type AuthConfig, type CustomerAccount, type OtpChallenge, type SessionIssue,
} from '@/api/account';
import { fetchAuthConfig } from '@/api/account';
import { isApiError } from '@/api/errors';
import {
  clearSession, isExpired, loadSession, openSecureBackend, saveSession,
  type SecureBackend, type StoredSession,
} from './sessionStore';

const PENDING_REVOKE_KEY = 'ayrovi.session.pending-revoke.v1';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  locale: 'fr' | 'ar';
  marketingOptIn: boolean;
}

export interface SessionValue {
  status: SessionStatus;
  account: CustomerAccount | null;
  /** Capacités réelles du serveur — l'écran ne propose que celles-là. */
  authConfig: AuthConfig | null;
  /** Défi SMS en cours (entre « demander le code » et « valider »). */
  challenge: OtpChallenge | null;
  /** `false` = jeton rangé hors trousseau (aperçu web) — on le dit à l'écran. */
  storageSecure: boolean;
  /** Compte relu du serveur depuis le dernier lancement (session confirmée). */
  verified: boolean;
  /** Message d'anomalie non bloquante (stockage, révocation impossible…). */
  notice: string;
  /** Relit le compte depuis le serveur (après une modification de profil). */
  refreshAccount: () => Promise<void>;
  /**
   * Adopte la session qu'une réponse vient d'ouvrir. Nécessaire au changement de
   * mot de passe : le serveur ferme TOUTES les sessions puis en ouvre une seule,
   * et continuer avec l'ancien jeton donnerait un 401 au geste suivant.
   */
  adoptSession: (issue: SessionIssue) => Promise<void>;
  requestPhoneCode: (phone: string) => Promise<OtpChallenge>;
  confirmPhoneCode: (code: string) => Promise<SessionIssue>;
  cancelPhoneCode: () => void;
  signInWithEmail: (email: string, password: string) => Promise<SessionIssue>;
  signUpWithEmail: (input: SignUpInput) => Promise<SessionIssue>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Écrit le jeton dans le contexte réseau puis sur le disque. */
async function adoptSession(backend: SecureBackend, issue: SessionIssue): Promise<void> {
  setAuthContext({ token: issue.sessionToken, csrfToken: issue.csrfToken, clientHeader: CLIENT_HEADER });
  await saveSession(backend, {
    token: issue.sessionToken,
    csrfToken: issue.csrfToken,
    expiresAt: issue.expiresAt,
    displayName: issue.account.displayName,
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [storageSecure, setStorageSecure] = useState(true);
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState('');
  const backendRef = useRef<SecureBackend | null>(null);

  /** Rejoue une révocation qui avait échoué faute de réseau. */
  const replayPendingRevocation = useCallback(async (backend: SecureBackend) => {
    let raw: string | null = null;
    try {
      raw = await backend.get(PENDING_REVOKE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as { token?: string; csrfToken?: string };
      if (!pending?.token || !pending?.csrfToken) throw new Error('invalide');
      setAuthContext({ token: pending.token, csrfToken: pending.csrfToken });
      await apiLogout();
      await backend.remove(PENDING_REVOKE_KEY);
    } catch {
      // Toujours impossible (hors-ligne, session déjà morte) : on garde la
      // trace, elle ne bloque rien et sera retentée au prochain lancement.
      resetAuthContext();
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const opened = await openSecureBackend();
      if (!alive) return;
      backendRef.current = opened.backend;
      setStorageSecure(opened.isSecure);
      // Le client se déclare AVANT toute requête d'authentification.
      setAuthContext({ clientHeader: CLIENT_HEADER });

      await replayPendingRevocation(opened.backend);
      if (!alive) return;

      const { session, storageError } = await loadSession(opened.backend);
      if (!alive) return;
      if (storageError) setNotice(storageError);

      // Capacités du serveur : informatives. Un échec réseau ne doit pas
      // empêcher l'écran de connexion de s'afficher.
      fetchAuthConfig().then((config) => { if (alive) setAuthConfig(config); }).catch(() => {});

      if (!session || isExpired(session)) {
        if (session) await clearSession(opened.backend);
        resetAuthContext();
        setStatus('signedOut');
        return;
      }

      setAuthContext({ token: session.token, csrfToken: session.csrfToken });
      try {
        const me = await fetchMe();
        if (!alive) return;
        if (!me) {
          // Le serveur ne reconnaît plus ce jeton : révocation faite ailleurs,
          // session expirée côté base. On repart proprement.
          await clearSession(opened.backend);
          resetAuthContext();
          setStatus('signedOut');
          return;
        }
        setAccount(me.account);
        setVerified(true);
        setAuthContext({ csrfToken: me.csrfToken });
        await saveSession(opened.backend, {
          token: session.token,
          csrfToken: me.csrfToken,
          expiresAt: me.expiresAt || session.expiresAt,
          displayName: me.account.displayName || session.displayName,
        });
      } catch {
        // Serveur injoignable : le jeton rangé n'est ni confirmé ni infirmé. On
        // reste connecté avec ce qu'on sait, `verified` dit la vérité à l'écran.
        if (!alive) return;
        setAccount({
          id: '', displayName: session.displayName, email: '', phone: '', avatarUrl: '',
          emailVerified: false, phoneVerified: false, status: 'ACTIVE', locale: '', marketingOptIn: false,
        });
        setVerified(false);
      }
      setStatus('signedIn');
    })().catch(() => {
      // Aucun chemin ne doit laisser l'application sur l'écran d'attente : au
      // pire, on affiche l'écran de connexion.
      if (alive) setStatus('signedOut');
    });
    return () => { alive = false; };
  }, [replayPendingRevocation]);

  const backend = () => {
    if (!backendRef.current) throw new Error('Stockage de session non initialisé.');
    return backendRef.current;
  };

  /*
   * Renouvellement du jeton CSRF après un `INVALID_CSRF` (voir client.ts) :
   * `/auth/me` fait tourner le jeton, on récupère le nouveau et on le range.
   * Retourner `false` laisse l'erreur remonter telle quelle à l'écran.
   */
  useEffect(() => {
    setCsrfRefresher(async () => {
      const store = backendRef.current;
      if (!store) return false;
      const me = await fetchMe();
      if (!me) return false;
      setAuthContext({ csrfToken: me.csrfToken });
      const { session } = await loadSession(store);
      if (session) await saveSession(store, { ...session, csrfToken: me.csrfToken });
      return true;
    });
    return () => setCsrfRefresher(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    const me = await fetchMe();
    if (!me) return;
    setAccount(me.account);
    setVerified(true);
    setAuthContext({ csrfToken: me.csrfToken });
    const store = backendRef.current;
    if (store) {
      const { session } = await loadSession(store);
      if (session) await saveSession(store, { ...session, csrfToken: me.csrfToken, displayName: me.account.displayName });
    }
  }, []);

  const adoptIssued = useCallback(async (issue: SessionIssue) => {
    if (!issue.sessionToken) throw new Error('Le serveur n’a pas ouvert de session pour l’application.');
    await adoptSession(backend(), issue);
    setAccount(issue.account);
    setVerified(true);
    setStatus('signedIn');
  }, []);

  const requestPhoneCode = useCallback(async (phone: string) => {
    const issued = await requestOtp(phone.trim());
    setChallenge(issued);
    return issued;
  }, []);

  const confirmPhoneCode = useCallback(async (code: string) => {
    if (!challenge) throw new Error('Aucun code demandé. Demandez d’abord un SMS.');
    const issue = await verifyOtp(challenge.challengeId, code.trim());
    if (!issue.sessionToken) {
      // Le serveur ne nous a pas reconnu comme client mobile : continuer
      // laisserait l'utilisateur « connecté » jusqu'au prochain démarrage.
      throw new Error('Le serveur n’a pas ouvert de session pour l’application.');
    }
    await adoptSession(backend(), issue);
    setAccount(issue.account);
    setVerified(true);
    setChallenge(null);
    setStatus('signedIn');
    return issue;
  }, [challenge]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const issue = await emailLogin(email.trim(), password);
    if (!issue.sessionToken) throw new Error('Le serveur n’a pas ouvert de session pour l’application.');
    await adoptSession(backend(), issue);
    setAccount(issue.account);
    setVerified(true);
    setStatus('signedIn');
    return issue;
  }, []);

  const signUpWithEmail = useCallback(async (input: SignUpInput) => {
    const issue = await emailRegister({
      displayName: input.displayName.trim(),
      email: input.email.trim(),
      password: input.password,
      locale: input.locale,
      marketingOptIn: input.marketingOptIn,
    });
    if (!issue.sessionToken) throw new Error('Le serveur n’a pas ouvert de session pour l’application.');
    await adoptSession(backend(), issue);
    setAccount(issue.account);
    setVerified(true);
    setStatus('signedIn');
    return issue;
  }, []);

  const signOut = useCallback(async () => {
    const store = backend();
    const { session } = await loadSession(store);
    setChallenge(null);
    try {
      await apiLogout();
      await store.remove(PENDING_REVOKE_KEY).catch(() => {});
    } catch (error) {
      // Deux cas très différents, il ne faut pas les confondre :
      //   • le serveur a RÉPONDU (401/403/404) : la session est déjà morte chez
      //     lui, il n'y a plus rien à révoquer ;
      //   • le réseau a lâché : la session vit encore trente jours côté serveur.
      //     On garde le jeton en quarantaine et on rejouera l'appel.
      const responded = isApiError(error) && error.status > 0;
      if (!responded && session) {
        setNotice('Déconnecté sur cet appareil — la révocation serveur sera retentée.');
        await store.set(PENDING_REVOKE_KEY, JSON.stringify({ token: session.token, csrfToken: session.csrfToken }))
          .catch(() => {
            // Même la quarantaine a échoué : le jeton est tout de même retiré de
            // l'appareil ci-dessous, personne ne peut plus s'en servir ici.
          });
      }
    }
    await clearSession(store);
    resetAuthContext();
    setAccount(null);
    setVerified(false);
    setStatus('signedOut');
  }, []);

  const value = useMemo<SessionValue>(() => ({
    status, account, authConfig, challenge, storageSecure, verified, notice,
    refreshAccount, adoptSession: adoptIssued,
    requestPhoneCode, confirmPhoneCode, cancelPhoneCode: () => setChallenge(null),
    signInWithEmail, signUpWithEmail, signOut,
  }), [
    status, account, authConfig, challenge, storageSecure, verified, notice,
    refreshAccount, adoptIssued,
    requestPhoneCode, confirmPhoneCode, signInWithEmail, signUpWithEmail, signOut,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession doit être utilisé sous <SessionProvider>.');
  return value;
}
