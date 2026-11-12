/**
 * Cadre commun des écrans d'authentification (connexion, mot de passe oublié)
 * — 12/11/2026, après comparaison côte à côte avec Zalando.
 *
 * Ce que la comparaison a montré, et ce que ce cadre fixe une fois pour toutes :
 *   • titre trop grand (h1 32 + grossissement système ⇒ ~36 pt sur deux
 *     lignes) : il est ramené à 24/28/32 selon la largeur, et son
 *     grossissement est plafonné (×1,2) — il tient sur une ligne au lieu de
 *     pousser le formulaire ;
 *   • marges latérales 12 → 16 (24 sur grand écran), comme la référence ;
 *   • rythme vertical régulier : 16 entre les éléments, 24 entre l'en-tête et
 *     le formulaire ;
 *   • colonne bornée à 480 pt et centrée : sur tablette ou en paysage, le
 *     formulaire ne s'étire plus sur toute la largeur ;
 *   • rangée du haut (fermer / retour) de hauteur FIXE et même en-tête à toutes
 *     les étapes : passer de « adresse » à « mot de passe » ne fait rien sauter.
 *
 * Le clavier : `KeyboardAvoider` (recouvrement réel, Android edge-to-edge
 * compris) + défilement qui ferme le clavier au glissement.
 */
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { KeyboardAvoider } from '@/design/keyboard';
import { BrandWordmark } from '@/design/BrandMark';
import { useResponsive } from '@/design/layout';

/** Largeur maximale de la colonne du formulaire. */
export const AUTH_CONTENT_MAX = 480;
/** Plafond du grossissement système pour le titre. */
export const AUTH_TITLE_MAX_SCALE = 1.2;

/** Taille du titre selon la largeur d'écran (pt) : petit téléphone, téléphone, tablette. */
export function authTitleSize(width: number): number {
  if (!Number.isFinite(width) || width < 360) return 24;
  return width >= 600 ? 32 : 28;
}

/** Marge latérale : 16 sur téléphone, 24 à partir de 600 pt. */
export function authGutter(width: number, space: readonly number[]): number {
  return Number.isFinite(width) && width >= 600 ? space[4] : space[3];
}

export function AuthLayout({ top, title, subtitle, children, testID }: {
  /** Action de la rangée du haut : fermer (connexion) ou retour (récupération). */
  top: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useResponsive();
  const size = authTitleSize(width);
  const base = theme.text('h2');
  const titleStyle = { fontSize: size, lineHeight: Math.round(size * (base.lineHeight / base.fontSize)) };
  const align = theme.isRTL ? 'flex-end' : 'flex-start';

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: authGutter(width, theme.space),
            paddingTop: insets.top + theme.space[1],
            paddingBottom: insets.bottom + theme.space[5],
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column} testID={testID}>
          <View style={[styles.topRow, { minHeight: theme.geometry.minTarget, alignItems: align }]}>
            {top}
          </View>
          {/* Marque posée en tête sur TOUTES les étapes (référence Zalando). */}
          <View style={{ alignItems: align }}>
            <BrandWordmark height={25} color={theme.colors.ink} />
          </View>
          <AppText
            variant="h2"
            accessibilityRole="header"
            maxFontSizeMultiplier={AUTH_TITLE_MAX_SCALE}
            style={titleStyle}
            testID="auth-title"
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" color={theme.colors.secondary} maxFontSizeMultiplier={1.4}>
              {subtitle}
            </AppText>
          ) : null}
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: AUTH_CONTENT_MAX, gap: 16 },
  topRow: { justifyContent: 'center' },
  body: { gap: 16, marginTop: 8 },
});
