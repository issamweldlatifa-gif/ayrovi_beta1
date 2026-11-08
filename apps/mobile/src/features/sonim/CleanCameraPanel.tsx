/** Foreground-only embedded camera; no simulated preview or capture. */
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CameraView, type CameraType } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ImagePickerAsset } from 'expo-image-picker';
import { AppSheet } from '@/design/sheet/AppSheet';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
import { CLEAN, CLEAN_TYPE } from './CleanVisuals';
export function CleanCameraPanel({ onClose, onPhoto }: { onClose: () => void; onPhoto: (photo: ImagePickerAsset) => Promise<void> }) {
  const { t } = useI18n();
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const camera = useRef<CameraView>(null), mounted = useRef(true), captureLock = useRef(false);
  const [options, setOptions] = useState(false), [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', s => { setForeground(s === 'active'); if (s !== 'active') onClose(); });
    return () => { mounted.current = false; sub.remove(); };
  }, [onClose]);
  const capture = async () => {
    if (!camera.current || !ready || captureLock.current) return;
    captureLock.current = true; setBusy(true); setError(false);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.78, base64: true, exif: false });
      if (!mounted.current || !photo) return;
      await onPhoto({ ...photo, mimeType: 'image/jpeg' });
      if (mounted.current) onClose();
    } catch { if (mounted.current) setError(true); }
    finally { captureLock.current = false; if (mounted.current) setBusy(false); }
  };
  const button = (name: keyof typeof Ionicons.glyphMap, label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={action} disabled={disabled} style={[styles.control, { opacity: disabled ? theme.opacity.disabled : 1 }]}><Ionicons name={name} size={theme.iconSize.md} color={CLEAN.paper} /></Pressable>;
  return <AppSheet surfaceColor="transparent" open onDismiss={onClose} presentation="bottom">
    <View style={[styles.panel, { height: Math.min(460, height * 0.65) }]} testID="clean-camera-panel">
      {foreground && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} flash={flash && facing === 'back' ? 'on' : 'off'} mode="picture" onCameraReady={() => setReady(true)} onMountError={() => { setReady(false); setError(true); }} />}
      <View style={styles.spacer} />
      {error && <AppText accessibilityRole="alert" style={CLEAN_TYPE} color={CLEAN.paper}>{t('sonim.attachmentError')}</AppText>}
      <View style={styles.options}>
        {options && <>{button(flash ? 'flash-outline' : 'flash-off-outline', t('clean.camera.flash'), () => setFlash(v => !v), busy || facing === 'front')}{button('camera-reverse-outline', t('clean.camera.flip'), () => { setReady(false); setFacing(v => v === 'back' ? 'front' : 'back'); }, busy)}</>}
      </View>
      <View style={styles.controls}>
        {button('chevron-back-outline', t('common.close'), onClose, busy)}
        <Pressable testID="clean-camera-capture" accessibilityRole="button" accessibilityLabel={t('clean.camera.capture')} onPress={() => { void capture(); }} disabled={!ready || busy} style={[styles.shutter, { opacity: !ready || busy ? theme.opacity.disabled : 1 }]} />
        {button(options ? 'close-outline' : 'ellipsis-vertical', t('clean.camera.options'), () => setOptions(v => !v), busy)}
      </View>
    </View>
  </AppSheet>;
}
const styles = StyleSheet.create({
  panel: { height: 460, maxHeight: '100%', borderRadius: CLEAN.cameraRadius, overflow: 'hidden', backgroundColor: CLEAN.ink, padding: 16 },
  spacer: { flex: 1 }, options: { alignItems: 'flex-end', gap: 10, marginBottom: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  control: { width: 48, height: 48, borderRadius: 24, backgroundColor: CLEAN.cameraOverlay, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 68, height: 68, borderRadius: 34, backgroundColor: CLEAN.paper },
});
