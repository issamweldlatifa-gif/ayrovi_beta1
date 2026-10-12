/**
 * الشريط العلوي لـLens فوق الكاميرا: سهم الرجوع ثم العنوان بجانبه، وعلى اليمين
 * السجل والفلاش والمساعدة. الرجوع يعود إلى الشاشة الرئيسية.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export interface LensTopBarProps {
  title: string;
  onBack: () => void;
  onHelp: () => void;
  onHistory: () => void;
  /** يُخفى الفلاش في وضع الرابط والرمز، لأنه لا كاميرا فيه. */
  showFlash: boolean;
  flashOn: boolean;
  onToggleFlash: () => void;
}

export function LensTopBar({ title, onBack, onHelp, onHistory, showFlash, flashOn, onToggleFlash }: LensTopBarProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const color = theme.colors.canvas;
  // الرجوع يشير دائماً إلى بداية الاتجاه: يسار في الإنجليزية والفرنسية، يمين في العربية.
  const backIcon = theme.isRTL ? 'arrow-forward' : 'arrow-back';

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('lens.back')} onPress={onBack} hitSlop={8} style={styles.iconButton}>
        <Ionicons name={backIcon} size={26} color={color} />
      </Pressable>
      <AppText variant="lead" weight="bold" color={color} numberOfLines={1} style={styles.title}>{title}</AppText>
      <View style={styles.end}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('lens.historyTitle')} onPress={onHistory} hitSlop={8} style={styles.iconButton}>
          <Ionicons name="time-outline" size={24} color={color} />
        </Pressable>
        {showFlash ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={flashOn ? t('lens.flashOff') : t('lens.flashOn')}
            onPress={onToggleFlash}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Ionicons name={flashOn ? 'flash' : 'flash-off'} size={24} color={color} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('lens.helpOpen')} onPress={onHelp} hitSlop={8} style={styles.iconButton}>
          <Ionicons name="help-circle-outline" size={26} color={color} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, textAlign: 'left' },
  end: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
