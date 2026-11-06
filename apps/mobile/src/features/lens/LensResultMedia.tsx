import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import { LensShimmer } from './LensShimmer';

/** Each thumbnail settles independently; no Promise.all/image barrier for the grid. */
export function LensResultMedia({ sources, title, onOpen, testID, accessibilityLabel }: { sources: string[]; title: string; onOpen?: () => void; testID?: string; accessibilityLabel?: string }) {
  const t = useT(); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  return <View style={StyleSheet.absoluteFill}>
    <Pressable onPress={onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={accessibilityLabel} testID={testID} style={StyleSheet.absoluteFill}>
    <AppImage key={attempt} uri={sources[0]} fallbackUris={sources.slice(1)} contentFit="cover" style={StyleSheet.absoluteFill}
      accessibilityLabel={title} onSettled={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />
    </Pressable>
    {loading ? <View pointerEvents="none" style={StyleSheet.absoluteFill}><LensShimmer testID="lens-thumbnail-loading" radius={0} style={styles.fill} /></View> : null}
    {failed ? <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} style={styles.retry} onPress={event => { event.stopPropagation(); setLoading(true); setFailed(false); setAttempt(value => value + 1); }}><AppText variant="captionStrong">{t('common.retry')}</AppText></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ fill: { height: '100%' }, retry: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
