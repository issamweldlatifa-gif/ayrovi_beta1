import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { RADIUS } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { PublicationIcon, PublicationText } from './publicationDesign';
import { PUBLICATION_PALETTE as P, PUBLICATION_PLAYER as C } from './publicationTokens';

export type PlayerMenu = 'settings' | 'quality' | 'diagnostics' | 'speed';
const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

export function PublicationPlayerSettings({ menu, resolution, speed, status, onMenu, onSpeed }: {
  menu: PlayerMenu; resolution: number; speed: number; status: string;
  onMenu: (menu: PlayerMenu) => void; onSpeed: (speed: number) => void;
}) {
  const t = useT();
  const auto = t('publication.playerAuto');
  const quality = resolution ? `${resolution}p` : auto;
  const menuTitle = t(menu === 'quality' ? 'publication.playerQuality' : 'publication.playerDiagnostics');
  return <ScrollView style={styles.menu} keyboardShouldPersistTaps="handled" testID={`publication-player-menu-${menu}`}>
    {menu === 'settings' ? <>
      <Pressable style={[styles.row, styles.divider]} accessibilityRole="button" onPress={() => onMenu('quality')}>
        <PublicationText color={P.paper} style={styles.grow}>{t('publication.playerQuality')}</PublicationText>
        <PublicationText color={P.paper}>{quality}</PublicationText>
        <PublicationIcon name="chevron-forward" color={P.paper} size={16} />
      </Pressable>
      <Pressable style={styles.row} accessibilityRole="button" onPress={() => onMenu('diagnostics')}>
        <PublicationIcon name="information-circle-outline" color={P.paper} size={16} />
        <PublicationText color={P.paper}>{t('publication.playerDiagnostics')}</PublicationText>
      </Pressable>
      <Pressable style={styles.row} accessibilityRole="button" testID="publication-player-speed" onPress={() => onMenu('speed')}>
        <PublicationIcon name="speedometer-outline" color={P.paper} size={16} />
        <PublicationText color={P.paper}>{t('publication.playerSpeed')} · {speed}×</PublicationText>
      </Pressable>
    </> : menu === 'speed' ? SPEEDS.map(value => (
      <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: speed === value }}
        style={[styles.row, styles.option]} onPress={() => onSpeed(value)}>
        <PublicationText color={P.paper}>{value}×</PublicationText>
        {speed === value ? <PublicationIcon name="checkmark-outline" color={P.paper} size={18} /> : null}
      </Pressable>
    )) : <>
      <Pressable style={[styles.row, styles.divider]} accessibilityRole="button" onPress={() => onMenu('settings')}>
        <PublicationIcon name="chevron-back" color={P.paper} size={16} />
        <PublicationText color={P.paper}>{menuTitle}</PublicationText>
      </Pressable>
      <PublicationText style={styles.detail} color={P.paper}>
        {menu === 'quality' ? `${auto}${resolution ? ` · ${quality}` : ''}` : `${status} · ${quality} · ${speed}×`}
      </PublicationText>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  menu: { maxHeight: 220, borderRadius: RADIUS.sm, backgroundColor: C.menu, overflow: 'hidden' },
  row: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { justifyContent: 'space-between' },
  detail: { paddingHorizontal: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.track },
  grow: { flex: 1 },
});
