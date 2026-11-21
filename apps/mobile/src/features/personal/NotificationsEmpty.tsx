import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';

export function NotificationsEmpty() {
  const t = useT();
  const { colors } = useTheme();
  return <View style={styles.empty} testID="notifications-empty">
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 240 285" accessible={false}>
        <Path d="M61 10l9 16 18-6 2 20 19 4-8 17 14 13-17 9 3 19-20-2-7 18-14-12-15 12-7-18-19 2 3-19-17-9 14-13-8-17 19-4 2-20 18 6z"
          fill="none" stroke={colors.ink} strokeWidth={4} strokeLinejoin="round" />
        {[158, 199].map(x => [30, 72].map(y => <Circle key={`${x}:${y}`} cx={x} cy={y} r={15} fill={BRAND.yellow} />))}
        <Path d="M12 126c0 30 101 41 102 14 1-27-106-12-102 28 4 39 104 43 102 13-2-29-102-12-102 25" fill="none" stroke={BRAND.yellow} strokeWidth={4} strokeLinecap="round" />
        <Path d="M174 105v53m-21-20 21 21 21-21" fill="none" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M142 175h63a10 10 0 0110 10v38l-17-11h-56a10 10 0 01-10-10v-17a10 10 0 0110-10z" fill={colors.ink} />
        <Rect x={12} y={230} width={102} height={44} rx={3} fill={BRAND.yellow} />
        <Path d="M140 237h74m-74 16h74m-74 16h74" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </View>
    <AppText variant="bodyStrong" align="center">{t('notifications.empty')}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  art: { width: '88%', maxWidth: 295, aspectRatio: 240 / 285 },
});
