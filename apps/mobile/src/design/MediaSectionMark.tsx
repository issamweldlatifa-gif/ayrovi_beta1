import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from './theme';
import { frost } from './tokens.mobile';
import { AppText } from './ui';

/** Brand lockup: ▶ Bold · Muted. These wordmarks read left-to-right in FR and AR. */
export function MediaSectionMark({ lead, suffix, tone = 'ink' }: {
  lead: string;
  suffix: string;
  tone?: 'ink' | 'onMedia';
}) {
  const theme = useTheme();
  const main = tone === 'onMedia' ? theme.colors.onMedia : theme.colors.ink;
  const secondary = tone === 'onMedia' ? frost(0.7) : theme.colors.muted;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`${lead}, ${suffix}`}
      style={{ direction: 'ltr', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <Ionicons name="play" size={theme.iconSize.sm} color={main} accessibilityElementsHidden />
      <AppText variant="h3" color={main}>{lead}</AppText>
      <AppText variant="h3" color={secondary}>•</AppText>
      <AppText variant="h3" color={secondary} style={{ fontFamily: theme.font('medium') }}>{suffix}</AppText>
    </View>
  );
}
