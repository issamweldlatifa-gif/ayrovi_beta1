/**
 * Le primitives de MISE EN PAGE — le seul endroit qui calcule une géométrie.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * Les wrappers d’écran centralisent la safe area, le défilement, le gutter
 * responsive et l’espacement partagé. `AppScreen` est le chemin par défaut;
 * `SubScreen` sert aux routes imbriquées. L’inventaire reste partiel — les
 * layouts et écrans spéciaux doivent choisir explicitement leur contrat.
 *
 * Cette primitive réduit les géométries recopiées et rend leurs décisions
 * testables; elle ne force pas à elle seule chaque route à l’utiliser.
 *
 * ── Le seul `position: absolute` justifié ───────────────────────────────────
 * La documentation interdit `absolute` sauf pour une vraie superposition.
 * `overlayHeader` est exactement ce cas : un en-tête transparent sous lequel
 * le contenu défile (demande explicite, Q8). Il est donc implémenté ICI, une
 * seule fois, plutôt que recopié écran par écran.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import { headerSolidFor } from './chromeLogic';
import { responsiveMetricsFor, screenContentGap, type Breakpoint } from './layoutLogic';

/* ── Points de rupture (§4.1) ─────────────────────────────────────────────── */

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

  return useMemo(() => {
    const metrics = responsiveMetricsFor(width);
    return {
      width,
      height,
      ...metrics,
      isCompact: metrics.breakpoint === 'compact' || metrics.breakpoint === 'regular',
      isWide: metrics.breakpoint === 'wide',
      isTablet: metrics.breakpoint === 'tablet',
    };
  }, [width, height]);
}

/* ── Écran ────────────────────────────────────────────────────────────────── */

export interface AppScreenProps {
  children?: ReactNode;
  /**
   * En-tête superposé dont l’apparence dépend du défilement.
   * Le rendu reçoit `scrolled` pour passer du transparent à `surface` sans
   * déplacer le contenu ni recalculer la zone sûre.
   */
  overlayHeader?: (state: { scrolled: boolean }) => ReactNode;
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
  const [headerScrolled, setHeaderScrolled] = useState(false);

  const onScroll = useCallback((event: Parameters<NonNullable<ScrollViewProps['onScroll']>>[0]) => {
    if (overlayHeader) {
      const next = headerSolidFor(event.nativeEvent.contentOffset.y);
      setHeaderScrolled((current) => current === next ? current : next);
    }
    if (chrome) onChromeScroll(event);
  }, [chrome, onChromeScroll, overlayHeader]);

  const topInset = insets.top + (overlayHeader ? theme.chrome.header : 0);
  const bottomInset = hasBottomBar ? 0 : insets.bottom;
  const contentGap = screenContentGap(theme.space);

  const padding = padded
    ? { paddingHorizontal: gutter, paddingTop: topInset, paddingBottom: bottomInset + footerSpace, gap: contentGap }
    : { paddingTop: topInset, paddingBottom: bottomInset + footerSpace, gap: contentGap };

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
      onScroll={overlayHeader || chrome ? onScroll : undefined}
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
         * Le seul `absolute` du système.
         *
         * ⚠️ Ce conteneur N'ajoute PAS `insets.top`, et c'est volontaire :
         * `AppHeader` se positionne lui-même en absolu et applique DÉJÀ sa
         * propre zone sûre (`paddingTop: insets.top + 8`). L'ajouter ici
         * décalerait l'en-tête de la hauteur de l'encoche — le double emploi
         * que la consigne « construire propre, pas empiler » interdit.
         *
         * La réserve d'espace, elle, EST appliquée au contenu
         * (`insets.top + theme.chrome.header`) : l'en-tête se superpose donc
         * sans rien décaler (§3 — aucune variation de dimension au défilement).
         *
         * Tout en-tête futur qui ne gère pas sa zone sûre doit le faire
         * LUI-MÊME avec `useSafeAreaInsets` — pas en la demandant ici.
         */
        <View style={[styles.overlay, { zIndex: theme.zIndex.chrome }]} pointerEvents="box-none">
          {overlayHeader({ scrolled: headerScrolled })}
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

/**
 * Exception ASSUMÉE à la marge : un enfant qui doit toucher les deux bords.
 *
 * ── Pourquoi un composant plutôt qu'une marge négative ─────────────────────
 * Le pied de page a un fond noir PLEIN ÉCRAN, et le héros une image qui doit
 * saigner. La tentation est `marginHorizontal: -16` à l'endroit voulu. Mais
 * `-16` est la marge du palier `regular` : sur tablette (32) ou en compact
 * (16 encore) la valeur ne suit pas, et le débordement devient faux en silence.
 *
 * C'est exactement le « hack par appareil » que §1 interdit. On le remplace
 * par UN composant qui lit la même source que `AppScreen` : la marge est
 * annulée par la valeur qui l'a créée, quel que soit le palier.
 */
export function FullBleed({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { gutter } = useResponsive();
  return <View style={[{ marginHorizontal: -gutter }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
});
