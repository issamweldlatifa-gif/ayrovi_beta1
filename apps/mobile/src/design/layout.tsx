/**
 * Le primitives de MISE EN PAGE — le seul endroit qui calcule une géométrie.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * L'audit (DESIGN_AUDIT.md ②-A) a mesuré que **23 écrans sur 35** n'avaient
 * aucune gestion de zone sûre. La cause n'était pas l'inattention : c'était
 * que la géométrie était un CHOIX PAR ÉCRAN. Tant qu'un développeur peut
 * décider `paddingTop` lui-même, il le fera — différemment de son voisin.
 *
 * La réponse n'est pas « faire attention », c'est rendre le mauvais choix
 * IMPOSSIBLE : `AppScreen` possède la zone sûre, le défilement et les
 * marges. Un écran qui les recalcule enfreint §18.2.
 *
 * ── Le seul `position: absolute` justifié ───────────────────────────────────
 * La documentation interdit `absolute` sauf pour une vraie superposition.
 * `overlayHeader` est exactement ce cas : un en-tête transparent sous lequel
 * le contenu défile (demande explicite, Q8). Il est donc implémenté ICI, une
 * seule fois, plutôt que recopié écran par écran.
 */
import { useMemo, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { useChromeScroll } from './chrome';

/* ── Points de rupture (§4.1) ─────────────────────────────────────────────── */

export type Breakpoint = 'compact' | 'regular' | 'wide' | 'tablet';

interface Responsive {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  columns: number;
  /** Marge latérale, en points, selon le palier. */
  gutter: number;
  isCompact: boolean;
  isWide: boolean;
  isTablet: boolean;
}

/**
 * Basé sur la LARGEUR DE LA FENÊTRE, jamais sur `orientation` :
 * une tablette en portrait doit garder deux colonnes (§4.5). La largeur est
 * aussi la seule grandeur qui change au rotation, sans abonnement supplémentaire.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo<Responsive>(() => {
    const breakpoint: Breakpoint =
      width <= 360 ? 'compact' : width < 600 ? 'regular' : width < 768 ? 'wide' : 'tablet';
    const table: Record<Breakpoint, { columns: number; gutter: number }> = {
      compact: { columns: 1, gutter: 16 },
      regular: { columns: 1, gutter: 16 },
      wide: { columns: 2, gutter: 24 },
      tablet: { columns: 3, gutter: 32 },
    };
    const { columns, gutter } = table[breakpoint];
    return {
      width,
      height,
      breakpoint,
      columns,
      gutter,
      isCompact: breakpoint === 'compact' || breakpoint === 'regular',
      isWide: breakpoint === 'wide',
      isTablet: breakpoint === 'tablet',
    };
  }, [width, height]);
}

/* ── Écran ────────────────────────────────────────────────────────────────── */

export interface AppScreenProps {
  children?: ReactNode;
  /**
   * Vraie superposition : en-tête transparent, contenu qui défile dessous.
   * C'est le SEUL cas où `absolute` est autorisé, et il est implémenté ici.
   */
  overlayHeader?: ReactNode;
  /** Défiler ? `false` pour un écran à hauteur fixe (formulaire court). */
  scroll?: boolean;
  /** Tirer vers le bas pour rafraîchir. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Envelopper d'un `KeyboardAvoidingView` (§4.4) — obligatoire si l'écran
   *  contient un champ, faute de quoi le clavier le recouvre. */
  keyboard?: boolean;
  /**
   * Marge latérale automatique selon le palier (§4.1). La désactiver est une
   * décision assumée : plein écran pour une galerie, par exemple.
   */
  padded?: boolean;
  /**
   * L'écran vit-il au-dessus de la barre d'onglets ?
   * §4.3-3 : la barre ajoute `insets.bottom` POUR ELLE-MÊME ; le contenu ne
   * l'ajoute que s'il n'y a PAS de barre. Sans cette distinction, on cumule
   * les deux et le bas de l'écran se retrouve à double distance du bord.
   */
  hasBottomBar?: boolean;
  /** Relier le défilement au repli de la barre (Q8). */
  chrome?: boolean;
  /** Marge basse additionnelle, en points — pour un bouton flottant. */
  footerSpace?: number;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'refreshControl' | 'onScroll'>;
  testID?: string;
}

export function AppScreen({
  children,
  overlayHeader,
  scroll = true,
  onRefresh,
  refreshing = false,
  keyboard = false,
  padded = true,
  hasBottomBar = false,
  chrome = true,
  footerSpace = 0,
  contentStyle,
  style,
  scrollViewProps,
  testID,
}: AppScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  const onChromeScroll = useChromeScroll();

  const topInset = insets.top + (overlayHeader ? theme.chrome.header : 0);
  const bottomInset = hasBottomBar ? 0 : insets.bottom;

  const padding = padded
    ? { paddingHorizontal: gutter, paddingTop: topInset, paddingBottom: bottomInset + footerSpace }
    : { paddingTop: topInset, paddingBottom: bottomInset + footerSpace };

  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={[padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      /**
       * Sans ce réglage, React Native ne transmet qu'un événement de temps en
       * temps et le seuil de repli de la barre n'est presque jamais atteint.
       */
      scrollEventThrottle={16}
      onScroll={chrome ? onChromeScroll : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        ) : undefined
      }
      testID={testID ? `${testID}-scroll` : undefined}
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding, contentStyle]} testID={testID}>
      {children}
    </View>
  );

  const wrapped = keyboard ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }, style]}>
      {wrapped}
      {overlayHeader ? (
        /**
         * Le seul `absolute` du système. Le contenu a déjà reçu
         * `theme.chrome.header` en marge haute : l'en-tête se superpose SANS
         * décaler quoi que ce soit (§3 — aucune variation de dimension).
         */
        <View
          style={[styles.overlay, { paddingTop: insets.top, zIndex: theme.zIndex.chrome }]}
          pointerEvents="box-none"
        >
          {overlayHeader}
        </View>
      ) : null}
    </View>
  );
}

/* ── Section (§18.2-4) ────────────────────────────────────────────────────── */

/**
 * `32` entre sections, `12` à l'intérieur. Ces deux nombres étaient auparavant
 * réinventés écran par écran ; ils vivent ici, et nulle part ailleurs.
 */
export function Section({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ gap: theme.space[2] }, style]}>{children}</View>;
}

/** Espacement vertical entre deux sections. */
export function SectionGap() {
  const theme = useTheme();
  return <View style={{ height: theme.space[5] }} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
});
