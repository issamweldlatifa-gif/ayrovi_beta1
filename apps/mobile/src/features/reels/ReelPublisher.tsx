import { View, StyleSheet } from "react-native";
import { AppText } from "@/design/ui";
import { OFFICIAL_AVATAR, OfficialAvatar } from "@/design/OfficialAvatar";
import { useTheme } from "@/design/theme";

/** Publishing is currently first-party only. Never borrow a reference creator's identity. */
export function ReelPublisher({ onMedia = false }: { onMedia?: boolean }) {
  const theme = useTheme();
  return (
    <View testID="reel-publisher" style={styles.row}>
      {/* Official avatar (14/11): white zebra Z on a black disc, the same in both themes and on video. */}
      <OfficialAvatar size={OFFICIAL_AVATAR.reel} testID="reel-publisher-avatar" />
      <AppText
        variant="body"
        numberOfLines={1}
        color={onMedia ? theme.colors.onMedia : theme.colors.ink}
        style={styles.name}
      >
        Zayrovi Team
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  name: { flexShrink: 1 },
});
