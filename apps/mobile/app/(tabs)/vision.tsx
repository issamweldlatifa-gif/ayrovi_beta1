/**
 * Vision — section ET outil, volontairement VIDE pour l’instant.
 *
 * La section reste volontairement vide : aucune fonctionnalité n’est déduite
 * de son nom. L’état explique simplement qu’aucun contenu n’est publié.
 */
import { router } from 'expo-router';
import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { EmptyBlock } from '@/design/states';
import { Button, SectionHeader } from '@/design/ui';
import { useT } from '@/i18n';

export default function VisionScreen() {
  const t = useT();
  return (
    <AppScreen
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} />}
      hasBottomBar
      chrome>

      <SectionHeader title={t('tabs.vision')} />
      <EmptyBlock>{t('vision.empty')}</EmptyBlock>
      {/* Onglet vide mais PAS mort : l'action réelle la plus proche, c'est Lens. */}
      <Button
        label={t('vision.emptyAction')}
        tone="quiet"
        onPress={() => router.push('/(tabs)/lens')}
        testID="vision-open-lens"
      />
    </AppScreen>
  );
}
