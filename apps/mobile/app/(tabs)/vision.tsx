/**
 * Vision — section ET outil, volontairement VIDE pour l’instant.
 *
 * Consigne produit : « تحتهم section vision خليها فارغه ». On ne comble donc
 * pas ce vide avec du faux contenu : un bloc creux qui annonce clairement son
 * étape vaut mieux qu’une section inventée qu’il faudra démonter.
 *
 * Ce qui est déjà prêt — et qui n’est pas du décor :
 *  • l’onglet existe et répond au doigt (aucun bouton mort dans la barre) ;
 *  • l’écran est câblé sur le système de design (thème, RTL, typographie) ;
 *  • le libellé est traduit.
 * Ce qui manque est le CONTENU, et il reste à décider.
 */
import { AppScreen } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { EmptyBlock } from '@/design/states';
import {SectionHeader} from '@/design/ui';
import { useT } from '@/i18n';

export default function VisionScreen() {
  const t = useT();
  return (
    <AppScreen
      overlayHeader={<AppHeader />}
      hasBottomBar
      chrome>

      {/*
        رسالة القسم — هاذا النصّ كان يعيش في هيدر `Screen` القديم.
        صار `SectionHeader` (§18.2-3): نفس المحتوى، بمكوّن موحّد.
      */}
      <SectionHeader title={t('screen.vision.subtitle')} hint={t('screen.vision.body')} />
      <EmptyBlock>{t('vision.empty')}</EmptyBlock>
      <EmptyBlock>{t('vision.empty.body')}</EmptyBlock>
    </AppScreen>
  );
}
