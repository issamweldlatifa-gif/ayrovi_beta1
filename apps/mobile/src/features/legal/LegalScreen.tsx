/**
 * Page légale DANS l’application (conditions, confidentialité).
 *
 * Demande : pas de sortie vers le navigateur ni de lien externe. La page s’ouvre
 * comme un écran de l’application, avec une flèche « retour » qui ramène à
 * l’écran précédent (la connexion, par exemple). Police et couleurs = celles de
 * l’application, sens de lecture selon la langue.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { rowDirectionFor } from '@/design/layoutLogic';
import { LEGAL_DOCS, type LegalBlock, type LegalDocId } from '@/legal/legalDocs';

function Block({ block }: { block: LegalBlock }) {
  const theme = useTheme();
  if (block.kind === 'h2') {
    return (
      <AppText variant="lead" weight="bold" style={styles.heading}>{block.text}</AppText>
    );
  }
  if (block.kind === 'notice') {
    return (
      <View
        style={[
          styles.notice,
          {
            backgroundColor: theme.colors.surface,
            borderStartColor: theme.colors.accent,
            borderRadius: theme.radius.control,
          },
        ]}
      >
        <AppText variant="body">{block.text}</AppText>
      </View>
    );
  }
  if (block.kind === 'li') {
    return (
      <View style={[styles.item, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <AppText variant="body" color={theme.colors.ink}>•</AppText>
        <AppText variant="body" style={styles.itemText}>{block.text}</AppText>
      </View>
    );
  }
  return <AppText variant="body">{block.text}</AppText>;
}

export function LegalScreen({ docId }: { docId: LegalDocId }) {
  const theme = useTheme();
  const t = useT();
  const { locale } = usePrefs();
  const insets = useSafeAreaInsets();

  const versions = LEGAL_DOCS[docId];
  const wantsArabic = locale === 'ar';
  const version = (wantsArabic ? versions.ar : undefined) ?? versions.fr;
  // Pas de version arabe : on affiche le français, et on le dit.
  const fallbackToFrench = wantsArabic && !versions.ar;
  const titleKey = docId === 'terms' ? 'auth.legal.terms' : 'auth.legal.privacy';

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/account');
  };

  if (!version) return null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.canvas }]}>
      <View
        style={[
          styles.bar,
          {
            paddingTop: insets.top + theme.space[2],
            borderBottomColor: theme.colors.line,
            flexDirection: rowDirectionFor(theme.isRTL),
          },
        ]}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.back,
            { width: theme.geometry.minTarget, height: theme.geometry.minTarget, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons
            name={theme.isRTL ? 'arrow-forward' : 'arrow-back'}
            size={24}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
        <AppText variant="lead" weight="bold" numberOfLines={1} style={styles.barTitle}>
          {t(titleKey)}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space[6], paddingHorizontal: theme.space[4] },
        ]}
      >
        <AppText variant="title" weight="bold" style={styles.docTitle}>{version.title}</AppText>
        {version.meta ? (
          <AppText variant="caption" color={theme.colors.muted}>{version.meta}</AppText>
        ) : null}
        {fallbackToFrench ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('legal.frenchOnly')}</AppText>
        ) : null}
        {version.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1 },
  content: { gap: 12, paddingTop: 16 },
  docTitle: { marginBottom: 4 },
  heading: { marginTop: 12 },
  notice: {
    borderStartWidth: 4,
    padding: 16,
  },
  item: { gap: 8, alignItems: 'flex-start', paddingStart: 4 },
  itemText: { flex: 1 },
});
