import { useLoyaltyDemo } from '@/features/loyalty/LoyaltyDemoProvider';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useReduceMotion } from '@/design/motion';
import { goBack } from '@/design/navigation';
import { useTheme } from '@/design/theme';
import { BRAND, NEUTRALS } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useT } from '@/i18n';
import { levels, loyaltyProgress, missions, privateRewards, rewards, sampleBoosterPoints, type Mission, type Reward } from '@/features/loyalty/loyaltyDemo';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

const images = {
  gift: require('../../assets/images/loyalty-gift.jpg'),
  style: require('../../assets/images/loyalty-style.jpg'),
  banner: require('../../assets/images/account-loyalty-banner.jpg'),
};
const faq = ['program', 'points', 'booster', 'levels'] as const;
type Detail = { kind: 'mission'; item: Mission } | { kind: 'reward'; item: Reward };

function Header({ close }: { close: () => void }) {
  const theme = useTheme();
  const t = useT();
  return <View style={[styles.header, { borderBottomColor: theme.colors.line, flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <Pressable testID="loyalty-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} style={styles.close}>
      <Ionicons name="close-outline" color={theme.colors.ink} size={theme.iconSize.lg} />
    </Pressable>
    <AppText variant="subtitle" accessibilityRole="header" style={styles.grow}>{t('loyalty.brand')}</AppText>
  </View>;
}

function Disclosure({ title, expanded, toggle, children, testID }: { title: string; expanded: boolean; toggle: () => void; children: ReactNode; testID: string }) {
  const theme = useTheme();
  return <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.line }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={toggle} testID={testID}
      style={[styles.disclosure, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      <AppText variant="bodyStrong" style={styles.grow}>{title}</AppText>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={theme.iconSize.sm} color={theme.colors.ink} />
    </Pressable>
    {expanded ? <View style={styles.answer}>{children}</View> : null}
  </View>;
}

export default function LoyaltyScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [demo, dispatch] = useLoyaltyDemo();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const anchor = useRef({ missions: 0 });
  const { points, pending, purchasePoints, level, index, next, progress } = loyaltyProgress(demo);
  const previewLevel = selected ?? index;
  const direction = rowDirectionFor(theme.isRTL);
  const close = () => goBack('/(tabs)/account');
  const safe = { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: theme.colors.canvas };
  const missionWidth = Math.min(272, Math.max(160, (width - insets.left - insets.right) * 0.72));
  const displayReward = (item: Reward) => {
    const unlocked = previewLevel >= item.level;
    const label = t(`loyalty.reward.${item.id}`);
    return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${label} · ${t(unlocked ? 'loyalty.unlocked' : 'loyalty.locked')}`}
      testID={`loyalty-reward-${item.id}`} onPress={() => setDetail({ kind: 'reward', item })}
      style={[styles.reward, { flexDirection: direction, borderTopColor: theme.colors.line }]}>
      <Ionicons name={unlocked ? 'checkmark-outline' : 'lock-closed-outline'} size={theme.iconSize.md} color={unlocked ? theme.colors.ink : theme.colors.muted} />
      <AppText variant="body" style={styles.grow} color={unlocked ? theme.colors.ink : theme.colors.muted}>{label}</AppText>
      <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={theme.colors.muted} />
    </Pressable>;
  };

  return <View style={[styles.screen, safe]} testID="loyalty-screen">
    <Header close={close} />
    <ScrollView ref={scroll} testID="loyalty-scroll" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={styles.frame}>
        <LinearGradient colors={[BRAND.black, NEUTRALS.textStrong]} style={styles.hero}>
          <View style={styles.heroBadge}><AppText variant="captionStrong" color={BRAND.yellow}>{t('loyalty.brand')} · {t(`loyalty.level.${level.id}`)}</AppText></View>
          <AppText variant="captionStrong" color={BRAND.white}>{t('loyalty.demo')}</AppText>
          <AppText variant="display" accessibilityRole="header" color={BRAND.white}>{t('loyalty.hero')}</AppText>
          <AppText variant="bodySmall" color={BRAND.white}>{t('loyalty.preview')}</AppText>
        </LinearGradient>
        <View style={styles.section}>
          <AppText variant="h3" accessibilityRole="header">{t('loyalty.welcome', { level: t(`loyalty.level.${level.id}`) })}</AppText>
          <AppText color={theme.colors.muted}>{t('loyalty.intro')}</AppText>
          <View style={styles.gauge} accessible accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100), text: t('loyalty.points', { points }) }}>
            <Svg width="100%" height={110} viewBox="0 0 232 116" accessibilityElementsHidden>
              <Path d={theme.isRTL ? 'M224 108 A108 108 0 0 0 8 108' : 'M8 108 A108 108 0 0 1 224 108'} fill="none" stroke={theme.colors.line} strokeWidth={15} />
              {progress > 0 ? <Path d={theme.isRTL ? 'M224 108 A108 108 0 0 0 8 108' : 'M8 108 A108 108 0 0 1 224 108'} fill="none"
                stroke={theme.mode === 'dark' ? BRAND.yellow : BRAND.black} strokeWidth={15} strokeDasharray={`${progress * 339.3} 340`} /> : null}
            </Svg>
            <AppText testID="loyalty-balance" variant="display" align="center">{points}</AppText>
            <AppText variant="captionStrong" align="center">{t('loyalty.points', { points })}</AppText>
          </View>
          <AppText testID="loyalty-pending" variant="bodySmall" align="center" color={theme.colors.muted}>{t('loyalty.pending', { points: pending })}</AppText>
          <AppText variant="bodyStrong" align="center">{next ? t('loyalty.next', { points: next.minimum, level: t(`loyalty.level.${next.id}`) }) : t('loyalty.top')}</AppText>
          <Button label={t('loyalty.earn')} tone="quiet" onPress={() => scroll.current?.scrollTo({ y: anchor.current.missions, animated: !reduceMotion })} block />
        </View>
        <View style={styles.missions} onLayout={event => { anchor.current.missions = event.nativeEvent.layout.y; }}>
          <View style={styles.inset}><AppText variant="h3" accessibilityRole="header">{t('loyalty.missions')}</AppText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.rail, { flexDirection: direction }]}>
            {missions.map(item => {
              const done = demo.completed.includes(item.id);
              return <Pressable key={item.id} testID={`loyalty-mission-${item.id}`} accessibilityRole="button"
                onPress={() => setDetail({ kind: 'mission', item })} style={[styles.missionCard, { width: missionWidth }]}>
                <AppImage localSource={images[item.image]} decorative style={styles.missionImage} />
                <View style={styles.missionCopy}>
                  <AppText variant="captionStrong" color={BRAND.yellow}>{done ? t('loyalty.completed') : `+${t('loyalty.shortPoints', { points: item.points })}`}</AppText>
                  <AppText variant="bodyStrong" color={BRAND.white}>{t(`loyalty.mission.${item.id}`)}</AppText>
                  <AppText variant="bodySmall" color={BRAND.lightGray}>{t(`loyalty.mission.${item.id}.body`)}</AppText>
                </View>
              </Pressable>;
            })}
          </ScrollView>
        </View>
        <View style={styles.section}>
          <View style={[styles.panel, { borderColor: theme.colors.line }]}>
            <LinearGradient colors={[theme.colors.accentSoft, theme.colors.surface]} style={styles.panelTop}>
              <AppText variant="captionStrong">{t(demo.booster && demo.purchase === 'none' ? 'loyalty.booster.active' : 'loyalty.booster.status')}</AppText>
              <AppText variant="h3" accessibilityRole="header">{t('loyalty.booster')}</AppText>
              <AppText variant="bodySmall">{t('loyalty.booster.body', { points: sampleBoosterPoints })}</AppText>
              {!demo.booster && demo.purchase === 'none' ? <Button testID="loyalty-activate-booster" label={t('loyalty.booster.activate')} tone="quiet" onPress={() => dispatch({ type: 'booster' })} /> : null}
            </LinearGradient>
            <View style={styles.panelBody}>
              <Disclosure testID="loyalty-history" title={t('loyalty.history')} expanded={history} toggle={() => setHistory(value => !value)}>
                <AppText variant="bodySmall" color={theme.colors.muted}>{demo.booster ? t(`loyalty.booster.history.${demo.purchase}`, { points: sampleBoosterPoints }) : t('loyalty.history.empty')}</AppText>
              </Disclosure>
            </View>
          </View>
          <View style={[styles.panel, styles.panelTop, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
            <AppText variant="subtitle" accessibilityRole="header">{t('loyalty.purchase')}</AppText>
            <AppText variant="bodySmall" color={theme.colors.muted}>{t(`loyalty.purchase.${demo.purchase}`, { points: purchasePoints })}</AppText>
            {demo.purchase === 'none' ? <Button testID="loyalty-simulate-purchase" label={t('loyalty.simulatePurchase')} tone="quiet" onPress={() => dispatch({ type: 'purchase' })} /> : null}
            {demo.purchase === 'pending' ? <>
              <Button testID="loyalty-confirm-purchase" label={t('loyalty.confirmPurchase')} onPress={() => dispatch({ type: 'confirm' })} />
              <Button testID="loyalty-return-purchase" label={t('loyalty.returnPurchase')} tone="quiet" onPress={() => dispatch({ type: 'return' })} />
            </> : null}
          </View>
        </View>
        <View style={styles.section}>
          <AppText variant="h3" accessibilityRole="header">{t('loyalty.rewards')}</AppText>
          <View style={[styles.tiers, { flexDirection: direction }]}>
            {levels.map((item, i) => <Pressable key={item.id} testID={`loyalty-tier-${item.id}`} accessibilityRole="button"
              accessibilityState={{ selected: previewLevel === i }} onPress={() => setSelected(i)} style={[styles.tier,
                { borderColor: previewLevel === i ? theme.colors.ink : theme.colors.line, backgroundColor: previewLevel === i ? theme.colors.accentSoft : theme.colors.canvas }]}>
              <AppText variant="captionStrong" align="center">{t(`loyalty.level.${item.id}`)}</AppText>
              <AppText variant="caption" align="center">{t('loyalty.shortPoints', { points: item.minimum })}</AppText>
            </Pressable>)}
          </View>
          <View style={[styles.panel, { borderColor: theme.colors.line }]}>
            <View style={styles.panelTop}><AppText variant="subtitle">ZAYROVI Plus · {t(`loyalty.level.${levels[previewLevel]!.id}`)}</AppText>
              <AppText variant="bodySmall" color={theme.colors.muted}>{t(previewLevel === index ? 'loyalty.currentTier' : 'loyalty.tierPreview')}</AppText></View>
            {rewards.map(displayReward)}
            <View style={[styles.privateHead, { backgroundColor: theme.colors.accentSoft }]}><AppText variant="bodyStrong">{t('loyalty.private')}</AppText></View>
            {privateRewards.map(displayReward)}
          </View>
        </View>
        <View style={[styles.section, { backgroundColor: theme.colors.accentSoft }]}>
          <AppText variant="h3" accessibilityRole="header">{t('loyalty.faq')}</AppText>
          {faq.map(id => <Disclosure key={id} title={t(`loyalty.faq.${id}`)} testID={`loyalty-faq-${id}`} expanded={expandedFaq === id} toggle={() => setExpandedFaq(expandedFaq === id ? null : id)}>
            <AppText variant="bodySmall" color={theme.colors.muted}>{t(`loyalty.faq.${id}.body`)}</AppText>
          </Disclosure>)}
          <Button testID="loyalty-reset" label={t('loyalty.reset')} tone="quiet" onPress={() => { dispatch({ type: 'reset' }); setSelected(null); scroll.current?.scrollTo({ y: 0, animated: !reduceMotion }); }} />
        </View>
      </View>
    </ScrollView>
    {detail ? <Modal animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={() => setDetail(null)}>
      <View style={[styles.screen, safe]} testID="loyalty-detail">
        <Header close={() => setDetail(null)} />
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.frame}>
            <AppImage localSource={images[detail.item.image]} decorative style={styles.detailImage} />
            <View style={styles.section}>
              <AppText variant="captionStrong" color={theme.colors.muted}>{t('loyalty.demo')}</AppText>
              <AppText variant="h2" accessibilityRole="header">{detail.kind === 'mission' ? t(`loyalty.mission.${detail.item.id}`) : t(`loyalty.reward.${detail.item.id}`)}</AppText>
              <AppText>{detail.kind === 'mission' ? t(`loyalty.mission.${detail.item.id}.body`) : t(`loyalty.reward.${detail.item.id}.body`)}</AppText>
              {detail.kind === 'mission' ? <>
                <AppText variant="bodySmall" color={theme.colors.muted}>{t('loyalty.simulationOnly')}</AppText>
                <Button testID="loyalty-complete-mission" label={demo.completed.includes(detail.item.id) ? t('loyalty.completed') : t('loyalty.simulateMission', { points: detail.item.points })}
                  disabled={demo.completed.includes(detail.item.id)} onPress={() => dispatch({ type: 'mission', id: detail.item.id })} block />
              </> : <AppText variant="bodySmall" color={theme.colors.muted}>{t('loyalty.requiredTier', { level: t(`loyalty.level.${levels[detail.item.level].id}`) })}</AppText>}
              <Button label={t('loyalty.return')} tone="quiet" onPress={() => setDetail(null)} block />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, frame: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { minHeight: 52, alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1, minWidth: 0 },
  hero: { minHeight: 164, justifyContent: 'center', padding: 20, gap: 8, overflow: 'hidden' },
  heroBadge: { alignSelf: 'flex-start', borderRadius: RADIUS.full, borderWidth: 1, borderColor: BRAND.yellow, paddingHorizontal: 10, paddingVertical: 4 },
  section: { padding: 16, gap: 12 }, inset: { paddingHorizontal: 16 }, missions: { paddingVertical: 12, gap: 12 },
  gauge: { width: '100%', maxWidth: 232, alignSelf: 'center', marginTop: 8, alignItems: 'center' },
  rail: { paddingHorizontal: 16, gap: 10 }, missionCard: { overflow: 'hidden', borderRadius: RADIUS.lg, backgroundColor: BRAND.black },
  missionImage: { width: '100%', aspectRatio: 1.25, backgroundColor: BRAND.lightGray }, missionCopy: { padding: 12, gap: 6 },
  panel: { borderWidth: 1, borderRadius: RADIUS.lg, overflow: 'hidden' }, panelTop: { padding: 16, gap: 8 }, panelBody: { paddingHorizontal: 16 },
  disclosure: { minHeight: 48, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 8 }, answer: { paddingBottom: 12 },
  tiers: { gap: 8 }, tier: { flex: 1, minHeight: 48, justifyContent: 'center', borderRadius: RADIUS.md, borderWidth: 1, padding: 6 },
  reward: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  privateHead: { paddingVertical: 8, paddingHorizontal: 16 }, detailImage: { width: '100%', aspectRatio: 1.6, backgroundColor: BRAND.lightGray },
});
