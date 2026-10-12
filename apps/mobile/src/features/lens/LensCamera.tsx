/**
 * كاميرا Lens بملء الشاشة (المرجع 01): شريط علوي فوق المعاينة (رجوع، العنوان،
 * الفلاش، المساعدة)، وشريط الأوضاع وأزرار التصوير فوقها، وOCEREX دائري.
 *
 * الطبقات فوق المعاينة استثناء معتمد من المالك (مثل إطارات العناصر). الصورة
 * تُسلَّم كما هي للشاشة الأم، والخادم هو الذي يقرأها (لا تحليل هنا).
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

/** Photo prête pour l'analyse. `width`/`height` = taille native (sert à placer les cadres). */
export type LensCapturedImage = { uri: string; mimeType?: string; fileName?: string | null; width?: number; height?: number };

/** أوضاع شريط الأوضاع (نفس ترتيب المرجع). */
export type LensCameraMode = 'live' | 'photo' | 'code';

type LensCameraProps = {
  visible: boolean;
  mode: LensCameraMode;
  busy: boolean;
  /** آخر صورة معروفة (من التصوير أو المعرض) — تظهر مصغّرة. */
  thumbnailUri: string;
  onModeChange: (mode: LensCameraMode) => void;
  onClose: () => void;
  onHelp: () => void;
  onOcerex: () => void;
  onCapture: (image: LensCapturedImage) => void;
  onOpenGallery: () => void;
  onCaptureFailed: () => void;
};

const MODES: LensCameraMode[] = ['live', 'photo', 'code'];

export function LensCamera({
  visible, mode, busy, thumbnailUri, onModeChange, onClose, onHelp, onOcerex,
  onCapture, onOpenGallery, onCaptureFailed,
}: LensCameraProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);

  const granted = permission?.granted === true;
  const live = granted && visible && !busy;

  const shutter = async () => {
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) onCapture({ uri: picture.uri, width: picture.width, height: picture.height });
      else onCaptureFailed();
    } catch {
      onCaptureFailed();
    }
  };

  const modeLabel: Record<LensCameraMode, string> = {
    live: t('lens.mode.live'),
    photo: t('lens.mode.photo'),
    code: t('lens.mode.code'),
  };

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.ink }]}>
        {granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} active={live} />
        ) : (
          <View style={styles.askBox}>
            <Button label={t('lens.cameraAsk')} onPress={() => { void requestPermission(); }} />
          </View>
        )}

        <View style={[styles.top, { top: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lens.close')}
            onPress={onClose}
            style={styles.iconButton}
          >
            <Ionicons name="arrow-back" size={26} color={theme.colors.canvas} />
          </Pressable>
          <AppText variant="lead" weight="bold" color={theme.colors.canvas}>{t('lens.cameraTitle')}</AppText>
          <View style={styles.topRight}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={flash === 'on' ? t('lens.flashOff') : t('lens.flashOn')}
              onPress={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
              style={styles.iconButton}
            >
              <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color={theme.colors.canvas} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lens.helpOpen')}
              onPress={onHelp}
              style={styles.iconButton}
            >
              <Ionicons name="help-circle-outline" size={26} color={theme.colors.canvas} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.bottom, { bottom: insets.bottom + 16 }]}>
          <AppText variant="body" color={theme.colors.canvas} align="center">{t('lens.frame')}</AppText>

          <View style={styles.pill}>
            <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
            {MODES.map((value) => {
              const selected = value === mode;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => onModeChange(value)}
                  style={[styles.segment, selected && { backgroundColor: theme.colors.canvas, borderRadius: 24 }]}
                >
                  <AppText variant="label" weight={selected ? 'bold' : 'regular'} color={selected ? theme.colors.ink : theme.colors.canvas} align="center">
                    {modeLabel[value]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lens.galleryOpen')}
              onPress={onOpenGallery}
              disabled={busy}
              style={[styles.thumb, { borderColor: theme.colors.canvas, borderRadius: theme.radius.control }]}
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
              style={[styles.shutterOuter, { borderColor: theme.colors.canvas, opacity: live ? 1 : 0.4 }]}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.ink} />
              ) : (
                <View style={[styles.shutterInner, { backgroundColor: theme.colors.canvas }]} />
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ocerex.open')}
              onPress={onOcerex}
              style={[styles.ocerex, { borderColor: theme.colors.canvas }]}
            >
              <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
              <AppText variant="caption" weight="bold" color={theme.colors.canvas}>OCEREX</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  askBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  top: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, gap: 16 },
  pill: { flexDirection: 'row', borderRadius: 28, padding: 4, overflow: 'hidden' },
  pillBack: { opacity: 0.55 },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumb: { width: 60, height: 60, borderWidth: 2, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  shutterOuter: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31 },
  ocerex: {
    width: 64, height: 64, borderRadius: 32, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
});
