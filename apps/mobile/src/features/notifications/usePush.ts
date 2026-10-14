/**
 * Notifications push, côté application.
 *
 * ── Le jeton, et pourquoi celui-là ──────────────────────────────────────────
 * `expo-notifications` propose deux jetons. `getExpoPushTokenAsync` rend un
 * jeton Expo qui oblige à passer par le service d'Expo pour envoyer — une
 * dépendance de plus sur l'infrastructure d'un tiers. On prend donc
 * `getDevicePushTokenAsync`, le jeton FCM NATIF, que notre propre serveur
 * envoie directement à Google (voir `src/services/push.ts`). C'est plus
 * long à mettre en place et c'est le bon choix : la disponibilité des
 * notifications de commande ne doit pas dépendre d'un service tiers.
 *
 * ── Règles de conduite ──────────────────────────────────────────────────────
 *  • **jamais d'insistance** : un refus de permission n'est pas une erreur à
 *    corriger à coups de rappels, c'est un choix. On n'inscrit rien et on se
 *    tait.
 *  • **aucune promesse non tenue** : l'écran apprend `pushEnabled` du SERVEUR.
 *    Un jeton inscrit alors que Firebase n'est pas configuré ne prévient de
 *    rien — l'afficher comme « activé » serait le mensonge qu'on s'interdit.
 *  • **le canal Android porte le même identifiant que le serveur**
 *    (`ayrovi-default`) : sans cet accord, Android 8+ livre la notification
 *    SANS son ni affichage, et personne ne comprend pourquoi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { registerDevice } from '@/api/devices';
import { resolveDeepLink } from '@/features/links/resolve';

/** Doit correspondre EXACTEMENT à `fcmMessageBody` côté serveur. */
export const PUSH_CHANNEL_ID = 'ayrovi-default';

export interface PushState {
  /** Le serveur peut-il réellement envoyer ? C'est lui qui décide. */
  enabled: boolean;
  /** Permission refusée : un choix de la personne, pas une panne. */
  denied: boolean;
}

/**
 * Un appui sur une notification ouvre l'écran concerné — en passant par le
 * MÊME résolveur que les liens profonds. Deux chemins, une seule vérité :
 * sinon une notification ouvrirait une page qu'un lien n'ouvrirait pas.
 */
function routeFromNotification(response: Notifications.NotificationResponse): string | null {
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  const direct = typeof data.actionUrl === 'string' ? data.actionUrl : '';
  if (direct && direct.startsWith('/')) return resolveDeepLink(`https://ayrovi.tn${direct}`);
  return null;
}

export function usePushNotifications(sessionId: string, locale = 'fr'): PushState {
  const [state, setState] = useState<PushState>({ enabled: false, denied: false });
  // Un seul enregistrement par session : sans ce garde, chaque rendu
  // re-demanderait un jeton et réinscrirait l'appareil.
  const registered = useRef<string | null>(null);

  const setup = useCallback(async (currentSession: string) => {
    if (Platform.OS === 'web') return;
    if (registered.current === currentSession) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
        name: 'AYROVI',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    let granted = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) {
      // Refus : on le SIGNALE (l'écran peut l'expliquer) sans insister.
      setState({ enabled: false, denied: true });
      registered.current = currentSession;
      return;
    }

    try {
      const token = await Notifications.getDevicePushTokenAsync();
      const value = String(token?.data || '').trim();
      if (!value) return;
      const result = await registerDevice({ token: value, sessionId: currentSession, locale });
      registered.current = currentSession;
      setState({ enabled: result.pushEnabled, denied: false });
    } catch {
      // Pas de services Google Play, ou Expo Go : aucune notification n'est
      // possible sur cet appareil. On n'affiche RIEN — annoncer une panne
      // pour une fonctionnalité que la personne n'a pas demandée serait
      // disproportionné, et le reste de l'application fonctionne sans.
      registered.current = currentSession;
      setState({ enabled: false, denied: false });
    }
  }, [locale]);

  useEffect(() => {
    void setup(sessionId);
  }, [sessionId, setup]);

  useEffect(() => {
    // Réception au premier plan : on AFFICHE (sinon la notification arrive
    // sans rien montrer, ce qui est pire que de ne pas la recevoir).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotification(response);
      if (route) router.push(route as never);
    });
    return () => subscription.remove();
  }, []);

  return state;
}
