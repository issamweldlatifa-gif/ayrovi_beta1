import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { upcomingCountdown, type PublicUpcomingStore } from '../../../../../shared/aywebsUpcoming';
import { type useAywebsUpcoming } from '@/api/aywebsUpcoming';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { FullBleed } from '@/design/layout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { ICON_SIZE, PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import { readUpcomingReminders, supportsUpcomingReminder, toggleUpcomingReminder } from './upcomingReminder';

type UpcomingData = NonNullable<ReturnType<typeof useAywebsUpcoming>['data']>;
export function UpcomingStoresSection({ data }: { data: UpcomingData | undefined }) {
  return data?.stores.length ? <UpcomingList data={data} /> : null;
}

function UpcomingList({ data }: { data: UpcomingData }) {
  const { width } = useWindowDimensions();
  const { isRTL } = useTheme();
  const t = useT();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [clock, setClock] = useState(Date.now);
  const [chosen, setChosen] = useState(new Map<string, string>());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!focused || !foreground) return;
    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [focused, foreground]);
  useEffect(() => {
    let live = true;
    if (focused && foreground) void readUpcomingReminders().then(value => { if (live) setChosen(value); }).catch(() => undefined);
    return () => { live = false; };
  }, [focused, foreground]);
  const now = clock + data.offsetMs;
  const stores = data.stores.filter(row => Date.parse(row.opensAt) > now);
  const size = Math.min(width, 640) / 2;
  const remind = async (store: PublicUpcomingStore) => {
    setBusy(store.id); setError('');
    try {
      const active = await toggleUpcomingReminder(store, chosen.get(store.id), 'AYWEBs', t('upcoming.notification', { store: store.name }));
      setChosen(current => {
        const next = new Map(current);
        if (active) next.set(store.id, store.opensAt); else next.delete(store.id);
        return next;
      });
    } catch { setError(store.id); }
    finally { setBusy(''); }
  };
  if (!stores.length) return null;
  const direction = rowDirectionFor(isRTL);
  return <FullBleed>
    <View testID="home-aywebs-upcoming" style={[styles.section, { backgroundColor: P.paper }]}>
      <View style={styles.heading}>
        <AppText variant="h2" accessibilityRole="header" color={P.ink} style={styles.center}>{t('upcoming.title')}</AppText>
        <AppText color={P.ink} style={styles.center}>{t('upcoming.subtitle')}</AppText>
      </View>
      <View style={styles.rows}>
        {stores.map(store => {
          const count = upcomingCountdown(store.opensAt, now);
          const active = chosen.get(store.id) === store.opensAt;
          const label = t(active ? 'upcoming.removeReminder' : 'upcoming.remind');
          return <View key={store.id} testID={`upcoming-store-${store.id}`} style={[styles.row, { flexDirection: direction, minHeight: size }]}>
            <View style={[styles.media, { width: size, height: size }, !store.image && store.logo ? styles.logoMedia : null]}>
              {store.image ? <AppImage uri={mediaUrl(store.image)} contentFit="cover" decorative style={StyleSheet.absoluteFill} /> :
                store.logo ? <AppImage uri={mediaUrl(store.logo)} contentFit="contain" decorative style={styles.logo} /> : null}
              {store.image || !store.logo ? <AppText color={P.paper} variant="bodyStrong" style={[styles.name, styles.center]}>{store.name}</AppText> :
                <AppText color={P.ink} variant="bodyStrong" style={styles.center}>{store.name}</AppText>}
            </View>
            <View style={styles.schedule}>
              <View>
                <AppText color={P.muted} variant="caption">{t('upcoming.starts')}</AppText>
                <AppText variant="bodyStrong" color={P.ink} style={styles.counter}>{t('upcoming.countdown', count)}</AppText>
              </View>
              {supportsUpcomingReminder ? <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled: Boolean(busy) }}
                accessibilityLabel={`${label} — ${store.name}`} disabled={!!busy} onPress={() => void remind(store)} style={[styles.notify, { flexDirection: direction }]}>
                <AppText color={P.ink} variant="bodyStrong" style={styles.notifyLabel}>{label}</AppText>
                <Ionicons name={active ? 'notifications-off-outline' : 'notifications-outline'} size={ICON_SIZE.md} color={P.ink} />
              </Pressable> : null}
              {error === store.id ? <AppText accessibilityRole="alert" variant="caption" color={P.ink}>{t('upcoming.reminderError')}</AppText> : null}
            </View>
          </View>;
        })}
      </View>
      <View style={styles.rule} />
    </View>
  </FullBleed>;
}
const styles = StyleSheet.create({
  section: { alignItems: 'center' }, heading: { gap: 8, paddingHorizontal: 12, paddingVertical: 16 },
  center: { textAlign: 'center' }, rows: { width: '100%', maxWidth: 640, gap: 4 }, row: { alignItems: 'stretch' },
  media: { backgroundColor: P.ink, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoMedia: { backgroundColor: P.neutral, gap: 8 }, logo: { width: '62%', height: '36%' },
  name: { backgroundColor: P.viewerDarkSurface, paddingHorizontal: 8, paddingVertical: 4 },
  schedule: { flex: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, justifyContent: 'space-between' },
  counter: { marginTop: 4, fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  notify: { minHeight: 44, alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  notifyLabel: { flexShrink: 1, textDecorationLine: 'underline' }, rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: P.line },
});
