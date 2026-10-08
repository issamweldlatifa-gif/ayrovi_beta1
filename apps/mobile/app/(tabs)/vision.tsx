/**
 * Vision — section ET outil, volontairement VIDE pour l’instant.
 *
 * La section reste volontairement vide : aucune fonctionnalité n’est déduite
 * de son nom. L’état explique simplement qu’aucun contenu n’est publié.
 */
import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { EmptyBlock } from '@/design/states';
import { SectionHeader } from '@/design/ui';
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
    </AppScreen>
  );
}
