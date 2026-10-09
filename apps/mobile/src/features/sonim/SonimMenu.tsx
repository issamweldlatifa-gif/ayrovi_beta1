/**
 * SONIM — le menu du tiroir.
 *
 * Cinq entrées, et ce sont les cinq gestes que la personne cherche : ouvrir une
 * discussion neuve, retrouver une ancienne, voir sa commande, lancer la
 * recherche visuelle (AYROVIX), régler l'assistant. Rien de plus : un menu
 * n'est pas un plan du site.
 *
 * Deux points de conception qui ne se voient pas mais qui comptent :
 *
 *  • **« Ma commande » et « AYROVIX » mènent à des écrans qui EXISTENT.** Une
 *    entrée qui ouvre un vide est pire qu'une entrée absente ; chacune a donc
 *    été vérifiée contre les routes réelles (`/orders`, `/lens/scan`,
 *    `/account/preferences`).
 *
 *  • **L'historique se déplie dans le tiroir**, il ne change pas d'écran :
 *    reprendre une discussion est un retour en arrière, pas une navigation.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Drawer, DrawerItem } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { SonimMark } from './SonimMark';
import type { SonimThread } from './history';

export interface SonimMenuProps {
  visible: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenThread: (thread: SonimThread) => void;
  threads: SonimThread[];
}

export function SonimMenu({ visible, onClose, onNewChat, onOpenThread, threads }: SonimMenuProps) {
  const theme = useTheme();
  const t = useT();
  const [showHistory, setShowHistory] = useState(false);

  const go = (path: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(path);
  };

  return (
    <Drawer visible={visible} onClose={onClose}>
      <SonimMark size={40} withPhase phase={t('sonim.phase')} />
      <AppText variant="caption" color={theme.colors.muted} style={styles.mission}>
        {t('sonim.mission')}
      </AppText>

      <View style={[styles.separator, { backgroundColor: theme.colors.divider }]} />

      <DrawerItem
        icon="add"
        label={t('sonim.menu.new')}
        onPress={() => { onClose(); onNewChat(); }}
      />
      <DrawerItem
        icon="time-outline"
        label={t('sonim.menu.history')}
        hint={threads.length > 0 ? t('sonim.menu.historyCount', { count: threads.length }) : t('sonim.menu.historyEmpty')}
        active={showHistory}
        onPress={() => setShowHistory((value) => !value)}
      />

      {showHistory ? (
        <View style={styles.history}>
          {threads.length === 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('sonim.history.empty')}</AppText>
          ) : threads.map((thread) => (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              onPress={() => { onClose(); onOpenThread(thread); }}
              style={({ pressed }) => [
                styles.thread,
                { flexDirection: rowDirectionFor(theme.isRTL) },
                { minHeight: theme.geometry.minTarget, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="chatbubble-outline" size={16} color={theme.colors.muted} />
              <AppText variant="caption" color={theme.colors.ink} numberOfLines={1} style={{ flex: 1 }}>
                {thread.title || t('sonim.menu.new')}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.separator, { backgroundColor: theme.colors.divider }]} />

      <DrawerItem icon="receipt-outline" label={t('sonim.menu.order')} onPress={() => go('/orders')} />
      <DrawerItem icon="scan-outline" label={t('sonim.menu.ayrovix')} hint={t('sonim.menu.ayrovixHint')} onPress={() => go('/lens/scan')} />
      <DrawerItem icon="settings-outline" label={t('sonim.menu.settings')} onPress={() => go('/account/preferences')} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  mission: { marginTop: 6, marginBottom: 4 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  history: { gap: 2, paddingStart: 12, marginBottom: 4 },
  thread: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
