/**
 * ZAYROVI — DERNIER FILET DE SÉCURITÉ.
 *
 * ── Le problème que ce fichier règle ─────────────────────────────────────────
 * En production, React Native n'a pas d'écran rouge : une erreur pendant le
 * rendu d'un composant remonte jusqu'à la racine et l'application se FERME.
 * C'est exactement ce que le client a vécu en ouvrant une carte produit
 * (ordre des hooks, voir `app/product/[id].tsx`). Corriger cette erreur-là ne
 * suffit pas : la suivante se comportera pareil. Un écran qui échoue doit
 * rester UN ÉCRAN, avec un bouton — jamais une application qui disparaît.
 *
 * ── Pourquoi ce repli n'utilise AUCUN contexte ───────────────────────────────
 * Un repli qui appellerait `useTheme()` ou `useT()` planterait à son tour si
 * l'erreur vient justement d'un fournisseur (thème, langue, préférences). Il
 * lit donc les jetons DIRECTEMENT dans `tokens.*` — des constantes, sans hook,
 * sans état, sans effet : le seul code de l'application dont on sait qu'il ne
 * peut pas lever. C'est aussi pour cela qu'il est en français ET en arabe :
 * aucune langue à charger pour afficher le message.
 *
 * ── Deux façons de s'en servir ───────────────────────────────────────────────
 *  · `<AppErrorBoundary>{enfants}</AppErrorBoundary>` — enveloppe manuelle.
 *  · `export { RouteErrorBoundary as ErrorBoundary }` dans un fichier de
 *    route : expo-router remplace alors l'écran fautif par ce repli, sans
 *    toucher à la navigation (l'utilisateur peut revenir en arrière).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACE, TYPE_SCALE } from './tokens.generated';
import { ICON_SIZE, RADIUS } from './tokens.mobile';

/** Palette de secours : mode clair, toujours lisible, jamais dépendante d'un état. */
const SAFE = COLORS.light;

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Notifié à chaque erreur capturée (journalisation, diagnostic). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * Quand cette valeur change, la frontière oublie l'erreur et retente le
   * rendu des enfants. Pratique pour « réessayer » après un changement de
   * route ou de données.
   */
  resetKey?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Un seul point de sortie : demain, c'est ici qu'on branche un rapport de
    // plantage. Aujourd'hui, on ne perd pas l'information en développement.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[AppErrorBoundary]', error?.message ?? error, info?.componentStack ?? '');
    }
    this.props.onError?.(error, info);
  }

  componentDidUpdate(previous: AppErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

/**
 * Le repli lui-même. Exporté : il sert aussi de contenu aux frontières de
 * route d'expo-router, qui reçoivent `{ error, retry }` et non des enfants.
 */
export function ErrorFallback({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // `error.message` peut être vide (une promesse rejetée sans raison, par ex.)
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return (
    <View style={styles.screen} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={ICON_SIZE.lg} color={SAFE.muted} />
      <Text style={styles.title}>صار خطأ في العرض</Text>
      <Text style={styles.titleFr}>Une erreur d’affichage</Text>
      <Text style={styles.body}>
        التطبيق باقي يخدم. اضغط « عاود » باش تعاود تجرّب، ولا ارجع للوراء.
      </Text>
      <Text style={styles.bodyFr}>
        L’application reste ouverte. Réessayez, ou revenez en arrière.
      </Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={3}>{detail}</Text>
      ) : null}
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          // Pas de `accessibilityLabel` littéral : le texte visible (arabe +
          // français) sert de nom accessible, sans dépendre de l'i18n.
          testID="error-boundary-retry"
          onPress={onRetry}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>عاود · Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Signature attendue par expo-router dans un fichier de route :
 *   export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';
 */
export function RouteErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorFallback error={error} onRetry={retry} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE[1],
    padding: SPACE[5],
    backgroundColor: SAFE.canvas,
  },
  title: {
    fontFamily: FONTS.arabic.bold,
    fontSize: TYPE_SCALE.title,
    lineHeight: Math.round(TYPE_SCALE.title * 1.42),
    color: SAFE.ink,
    textAlign: 'center',
  },
  titleFr: {
    fontFamily: FONTS.latin.semibold,
    fontSize: TYPE_SCALE.label,
    lineHeight: Math.round(TYPE_SCALE.label * 1.3),
    color: SAFE.secondary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.arabic.regular,
    fontSize: TYPE_SCALE.body,
    lineHeight: Math.round(TYPE_SCALE.body * 1.55),
    color: SAFE.muted,
    textAlign: 'center',
  },
  bodyFr: {
    fontFamily: FONTS.latin.regular,
    fontSize: TYPE_SCALE.caption,
    lineHeight: Math.round(TYPE_SCALE.caption * 1.4),
    color: SAFE.muted,
    textAlign: 'center',
  },
  detail: {
    fontFamily: FONTS.latin.regular,
    fontSize: TYPE_SCALE.caption,
    lineHeight: Math.round(TYPE_SCALE.caption * 1.4),
    color: SAFE.lineControl,
    textAlign: 'center',
  },
  button: {
    marginTop: SPACE[3],
    minHeight: 48, // cible tactile : un espace de l'échelle, pas une valeur inventée
    paddingHorizontal: SPACE[5],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    backgroundColor: SAFE.ink,
  },
  buttonLabel: {
    fontFamily: FONTS.arabic.bold,
    fontSize: TYPE_SCALE.label,
    color: SAFE.onAccent,
  },
});
