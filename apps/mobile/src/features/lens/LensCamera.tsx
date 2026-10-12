/**
 * معاينة كاميرا Lens: التصوير، الفلاش، المساعدة، المعرض، وOCEREX.
 *
 * الصورة تُسلَّم كما هي للشاشة الأم، والخادم هو الذي يقرأها (لا تحليل هنا).
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export type LensCapturedImage = { uri: string; mimeType?: string; fileName?: string | null };

type LensCameraProps = {
  busy: boolean;
  /** آخر صورة معروفة (من التصوير أو المعرض) — تظهر مصغّرة. */
  thumbnailUri: string;
  onCapture: (image: LensCapturedImage) => void;
  onOpenGallery: () => void;
  onCaptureFailed: () => void;
};

export function LensCamera({ busy, thumbnailUri, onCapture, onOpenGallery, onCaptureFailed }: LensCameraProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);

  const live = permission?.granted === true && isFocused && !busy;
  const viewportHeight = Math.round(height * 0.6);

  const shutter = async () => {
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) onCapture({ uri: picture.uri });
      else onCaptureFailed();
    } catch {
      onCaptureFailed();
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={flash === 'on' ? t('lens.flashOff') : t('lens.flashOn')}
          onPress={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
          style={[styles.iconButton, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
        >
          <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={22} color={theme.colors.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('lens.helpOpen')}
          onPress={() => router.push('/lens/help')}
          style={[styles.iconButton, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
        >
          <Ionicons name="help-circle-outline" size={22} color={theme.colors.ink} />
        </Pressable>
      </View>

      <View style={[styles.viewport, { height: viewportHeight, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface }]}>
        {permission?.granted === true ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} active={live} />
        ) : (
          <View style={styles.askBox}>
            <Button label={t('lens.cameraAsk')} onPress={() => { void requestPermission(); }} />
          </View>
        )}
      </View>

      <AppText variant="caption" color={theme.colors.muted} align="center">{t('lens.frame')}</AppText>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('lens.galleryOpen')}
          onPress={onOpenGallery}
          disabled={busy}
          style={[styles.thumb, { borderColor: theme.colors.line, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface }]}
        >
          {thumbnailUri ? (
            <AppImage uri={thumbnailUri} style={styles.thumbImage} contentFit="cover" accessibilityLabel={t('lens.previewAlt')} />
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('lens.shutter')}
          onPress={() => { void shutter(); }}
          disabled={!live}
          style={[styles.shutterOuter, { borderColor: theme.colors.ink, opacity: live ? 1 : 0.4 }]}
        >
          <View style={[styles.shutterInner, { backgroundColor: theme.colors.ink }]} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ocerex.open')}
          onPress={() => router.push('/lens/ocerex')}
          style={[styles.ocerex, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}
        >
          <AppText variant="caption" weight="bold">OCEREX</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  viewport: { width: '100%', overflow: 'hidden' },
  askBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  thumb: { width: 56, height: 56, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  shutterOuter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  ocerex: {
    width: 56, height: 56, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
});
