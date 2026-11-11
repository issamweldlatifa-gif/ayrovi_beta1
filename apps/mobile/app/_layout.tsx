import { shouldRetryQuery, queryRetryDelay } from '@/api/queryRetry';
/**
 * Racine de l'application : fournisseurs, polices, écran de démarrage.
 *
 * Ordre imposé : Préférences → Langue → Thème → Requêtes → Session → Navigation.
 * Les préférences viennent en premier parce que la langue et le thème en
 * dépendent ; on ne peint rien tant que le disque n'a pas répondu.
 *
 * La session vient APRÈS le thème et la langue (ses écrans en ont besoin) et
 * AVANT la navigation : au premier rendu, l'application sait déjà si elle
 * parle en tant que visiteur ou en tant que client connecté.
 */
import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useNetworkState } from 'expo-network';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FONT_SOURCES } from '@/config/app';
import { ThemeProvider, useTheme } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider, usePrefs } from '@/state/prefs';
import { SessionProvider } from '@/state/session';
import { useDeepLinkRouting } from '@/features/links/useDeepLinkRouting';
import { usePushNotifications } from '@/features/notifications/usePush';
import { useSessionId } from '@/session/session';
import { BrandEntrance } from '@/design/BrandEntrance';
import { NetworkBanner } from '@/design/NetworkBanner';
import { AppErrorBoundary, RouteErrorBoundary } from '@/design/AppErrorBoundary';
import { useImageCacheGuard } from '@/design/appImage';
import { useReduceMotion } from '@/design/motion';
import { stackMotion } from '@/design/navigationMotion';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Déjà masqué (rechargement à chaud) : sans effet, ne bloque pas le rendu.
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One recovery for transient failures; never retry auth, cancellation or bad data.
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Filet de sécurité d'expo-router : si une route lève pendant son rendu, elle
 * est remplacée par ce repli au lieu de fermer l'application.
 */
export { RouteErrorBoundary as ErrorBoundary };

function Navigation() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const motion = stackMotion(theme.isRTL, reduceMotion);
  const [bootDone, setBootDone] = useState(false);
  const { ready, locale } = usePrefs();
  const sessionId = useSessionId();
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);
  // `isConnected === false` = coupure avérée ; `null` = inconnu, on n'affiche rien.
  const network = useNetworkState();
  const offline = network.isConnected === false;

  // Les polices sont embarquées : un échec est un défaut de construction, pas
  // une raison de rester sur l'écran de démarrage — on rend avec la police
  // système plutôt que de bloquer l'utilisateur sur un écran figé.
  const readyToPaint = ready && (fontsLoaded || Boolean(fontError));

  // Purge le cache disque d'images si l'empreinte de build de l'APK a changé.
  useImageCacheGuard();

  // Subscribe immediately; queue links until the navigator is ready.
  useDeepLinkRouting(readyToPaint);

  // Notifications : l'appareil s'annonce au serveur, qui dit s'il peut
  // réellement envoyer. Branché ici — au démarrage — pour qu'une commande
  // passée plus tard puisse être annoncée.
  usePushNotifications(sessionId, locale);

  const content = readyToPaint ? (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {/* Hors ligne : bandeau DANS LE FLUX — le contenu est poussé, jamais
          recouvert (un `absolute` ici violerait le verrou §17). */}
      {offline ? <NetworkBanner /> : null}
      {/* `Stack` n'a pas de prop `style` : le View flex:1 lui rend la place. */}
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.canvas },
            // Mouvement des réseaux sociaux (11/11) : on POUSSE l'écran depuis le
            // bord de lecture, retour au geste — jamais un écran qui « apparaît ».
            ...motion.push,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="panier" />
          <Stack.Screen name="sonim-assistant" options={motion.sheet} />
          {/* Média plein écran : fondu (la vidéo/caméra ne glisse pas). */}
          <Stack.Screen name="z-lens" options={motion.media} />
          <Stack.Screen name="lens" options={motion.media} />
          <Stack.Screen name="reels-viewer" options={motion.media} />
          <Stack.Screen name="reels" options={motion.media} />
          <Stack.Screen name="stories" options={motion.media} />
          {/* Connexion : présentée par-dessus l'onglet courant, refermée au succès. */}
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', ...motion.sheet }} />
          <Stack.Screen name="forgot" options={{ presentation: 'modal', ...motion.sheet }} />
          <Stack.Screen name="orders" />
        </Stack>
      </View>
    </View>
  ) : null;
  return <View style={{ flex: 1 }}>{content}{!bootDone ? <BrandEntrance ready={readyToPaint}
    onShown={() => { SplashScreen.hideAsync().catch(() => {}); }} onDone={() => setBootDone(true)} /> : null}</View>;
}

export default function RootLayout() {
  return (
    <>
      <SafeAreaProvider>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <QueryClientProvider client={queryClient}>
                <SessionProvider>
                  <AppErrorBoundary resetKey="root">
                    <Navigation />
                  </AppErrorBoundary>
                </SessionProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </>
  );
}
