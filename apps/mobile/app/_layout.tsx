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
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import { useAyWebsSessionId } from '@/features/aywebs/session';
import { LoadingScreen } from '@/design/LoadingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Déjà masqué (rechargement à chaud) : sans effet, ne bloque pas le rendu.
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un réseau mobile tunisien n'est pas un réseau de bureau : on réessaie
      // deux fois, puis on montre l'erreur au lieu de tourner indéfiniment.
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function Navigation() {
  const theme = useTheme();
  const { ready, locale } = usePrefs();
  const sessionId = useAyWebsSessionId();
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);

  // Les polices sont embarquées : un échec est un défaut de construction, pas
  // une raison de rester sur l'écran de démarrage — on rend avec la police
  // système plutôt que de bloquer l'utilisateur sur un écran figé.
  const readyToPaint = ready && (fontsLoaded || Boolean(fontError));

  // Liens profonds : branchés une fois que la navigation existe, pas avant.
  useDeepLinkRouting(readyToPaint);

  // Notifications : l'appareil s'annonce au serveur, qui dit s'il peut
  // réellement envoyer. Branché ici — au démarrage — pour qu'une commande
  // passée plus tard puisse être annoncée.
  usePushNotifications(sessionId, locale);

  useEffect(() => {
    if (readyToPaint) SplashScreen.hideAsync().catch(() => {});
  }, [readyToPaint]);

  /**
   * Chargement : NOTRE marque animée, pas l'image figée du système.
   *
   * L'image native est masquée par `onShown`, donc APRÈS que cet écran a été
   * peint — la masquer plus tôt laisserait une frame vide entre les deux.
   */
  if (!readyToPaint) {
    return <LoadingScreen onShown={() => { SplashScreen.hideAsync().catch(() => {}); }} />;
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.canvas },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* Connexion : présentée par-dessus l'onglet courant, refermée au succès. */}
        <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
        <Stack.Screen name="forgot" options={{ presentation: 'modal' }} />
        <Stack.Screen name="orders" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <SessionProvider>
                <Navigation />
              </SessionProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
