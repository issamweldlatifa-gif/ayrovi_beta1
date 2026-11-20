import { router } from 'expo-router';
import { OFFICIAL_PUBLISHER_NAME, OFFICIAL_PUBLISHER_ROUTE } from '@/features/publications/officialPublisher';
import { ReelViewerText } from './ReelViewerChrome';
import { REEL_VIEWER as V } from './reelViewerStyle';
import { Pressable, StyleSheet } from "react-native";
import { AppText } from "@/design/ui";
import { OFFICIAL_AVATAR, OfficialAvatar } from "@/design/OfficialAvatar";
import { rowDirectionFor } from "@/design/layoutLogic";
import { useTheme } from "@/design/theme";

/** Publishing is currently first-party only. Never borrow a reference creator's identity. */
export function ReelPublisher({ onMedia = false, onOpen }: { onMedia?: boolean; onOpen?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable testID="reel-publisher" accessibilityRole="link" accessibilityLabel={OFFICIAL_PUBLISHER_NAME}
      onPress={onOpen ?? (() => router.push(OFFICIAL_PUBLISHER_ROUTE))} style={[styles.row, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      <OfficialAvatar size={onMedia ? V.avatar : OFFICIAL_AVATAR.reel} testID="reel-publisher-avatar" />
      {onMedia ? <ReelViewerText tone="publisher" numberOfLines={1} color={V.paper} style={styles.name}>{OFFICIAL_PUBLISHER_NAME}</ReelViewerText>
        : <AppText variant="body" numberOfLines={1} color={theme.colors.ink} style={styles.name}>{OFFICIAL_PUBLISHER_NAME}</AppText>}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  name: { flexShrink: 1 },
});
