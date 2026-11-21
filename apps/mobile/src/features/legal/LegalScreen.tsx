import { BackButton } from '@/design/BackButton';
/**
 * Page légale DANS l’application (conditions, confidentialité).
 *
 * Demande : pas de sortie vers le navigateur ni de lien externe. La page s’ouvre
 * comme un écran de l’application, avec une flèche « retour » qui ramène à
 * l’écran précédent (la connexion, par exemple). Police et couleurs = celles de
 * l’application, sens de lecture selon la langue.
 */
import { useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { goBack } from '@/design/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useReduceMotion } from '@/design/motion';
import { SettingsRow } from '@/features/settings/SettingsRows';
import { usePrefs } from '@/state/prefs';
import { rowDirectionFor } from '@/design/layoutLogic';
import { LEGAL_DOCS, type LegalBlock, type LegalDocId } from '@/legal/legalDocs';

function Block({ block }: { block: LegalBlock }) {
  const theme = useTheme();
  if (block.kind === 'h2') {
    return (
      <AppText variant="h3" accessibilityRole="header" style={styles.heading}>{block.text}</AppText>
    );
  }
  if (block.kind === 'notice') {
    return (
      <View
        style={[
          styles.notice,
          {
            backgroundColor: theme.colors.surface,
            borderStartColor: theme.colors.ink,
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
  const reduced = useReduceMotion();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [awayFromTop, setAwayFromTop] = useState(false);
  const privacy = docId === 'privacy';

  const versions = LEGAL_DOCS[docId];
  const wantsArabic = locale === 'ar';
  const version = (wantsArabic ? versions.ar : undefined) ?? versions.fr;
  // Pas de version arabe : on affiche le français, et on le dit.
  const fallbackToFrench = wantsArabic && !versions.ar;
  const titleKey = docId === 'terms' ? 'auth.legal.terms' : 'auth.legal.privacy';

  const onBack = () => goBack('/(tabs)/account');

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
        <BackButton onPress={onBack} label={t('common.back')} color={theme.colors.ink} />
        <AppText variant="h3" numberOfLines={1} style={styles.barTitle}>
          {t(titleKey)}
        </AppText>
      </View>

      <ScrollView ref={scroll} scrollEventThrottle={32}
        onScroll={privacy ? event => setAwayFromTop(event.nativeEvent.contentOffset.y > 280) : undefined}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space[6], paddingHorizontal: theme.space[4] },
        ]}
      >
        <AppText variant="h2" accessibilityRole="header" style={styles.docTitle}>{version.title}</AppText>
        {version.meta ? (
          <AppText variant="caption" color={theme.colors.muted}>{version.meta}</AppText>
        ) : null}
        {fallbackToFrench ? (
          <AppText variant="caption" color={theme.colors.muted}>{t('legal.frenchOnly')}</AppText>
        ) : null}
        {privacy && version.blocks.some(block => block.kind === 'h2') ?
          <Button label={t('legal.chooseChapter')} tone="quiet" onPress={() => setChaptersOpen(true)} /> : null}
        {version.blocks.map((block, index) => block.kind === 'h2' && privacy ?
          <View key={index} onLayout={event => { offsets.current[index] = event.nativeEvent.layout.y; }}><Block block={block} /></View> :
          <Block key={index} block={block} />)}
      </ScrollView>
      {privacy && awayFromTop ? <View style={[styles.readerAction, { paddingBottom: insets.bottom + theme.space[2], borderColor: theme.colors.line }]}>
        <Button label={t('legal.backToTop')} tone="quiet" onPress={() => scroll.current?.scrollTo({ y: 0, animated: !reduced })} />
      </View> : null}
      {privacy && chaptersOpen ? <Modal visible animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setChaptersOpen(false)}>
        <View accessibilityViewIsModal style={[styles.screen, styles.chapterList, { paddingTop: insets.top + theme.space[3],
          paddingBottom: insets.bottom + theme.space[3], backgroundColor: theme.colors.canvas }]}>
          <AppText variant="h3" accessibilityRole="header">{t('legal.chooseChapter')}</AppText>
          <ScrollView>{version.blocks.map((block, index) => block.kind === 'h2' ?
            <SettingsRow key={index} title={block.text} divided onPress={() => {
              const y = offsets.current[index];
              setChaptersOpen(false);
              if (typeof y === 'number') scroll.current?.scrollTo({ y, animated: !reduced });
            }} /> : null)}</ScrollView>
          <Button label={t('common.close')} tone="quiet" block onPress={() => setChaptersOpen(false)} />
        </View>
      </Modal> : null}
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
  readerAction: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  chapterList: { paddingHorizontal: 16, gap: 12 },
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
