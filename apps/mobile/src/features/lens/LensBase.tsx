/**
 * القاعدة البصرية لـ Lens: الكاميرا (أو لوحة الرابط والرمز) تملأ الشاشة،
 * وشريط الأوضاع وأزرار التصوير فوقها. ليست نافذة: لا تُغلق ولا تُعاد فتحها
 * عند الرجوع، لأن الدروج تُفتح فوقها وتُغلق تحتها.
 *
 * الطبقات فوق المعاينة استثناء معتمد من المالك (مثل إطارات العناصر). الصورة
 * تُسلَّم كما هي للشاشة الأم، والخادم هو الذي يقرأها (لا تحليل هنا).
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type FlashMode } from 'expo-camera';
import { LensTopBar } from '@/features/lens/LensTopBar';
import { LensScrim } from '@/features/lens/LensScrim';

import { LENS_BARCODE_TYPES } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import type { LensMode } from '@/features/lens/lensLayers';

/** Photo prête pour l'analyse. `width`/`height` = taille native (sert à placer les cadres). */
export type LensCapturedImage = { uri: string; mimeType?: string; fileName?: string | null; width?: number; height?: number };

const MODES: LensMode[] = ['live', 'photo', 'code'];

export interface LensBaseProps {
  mode: LensMode;
  /** La caméra tourne: Lens est au premier plan et aucun problème de focus. */
  active: boolean;
  busy: boolean;
  thumbnailUri: string;
  /** Message affiché quand aucun drawer n'est ouvert (ex. photo non prise). */
  note: string;
  code: string;
  codeReady: boolean;
  onCodeChange: (value: string) => void;
  onSearchCode: () => void;
  onModeChange: (mode: LensMode) => void;
  onHelp: () => void;
  onOcerex: () => void;
  onBarcode: (value: string) => void;
  onCapture: (image: LensCapturedImage) => void;
  onOpenGallery: () => void;
  onCaptureFailed: () => void;
  /** رجوع إلى الرئيسية (الدروج تُغلق قبل ذلك في الشاشة الأم). */
  onBack: () => void;
}

export function LensBase(props: LensBaseProps) {
  const { mode, active, busy, thumbnailUri, note, code, codeReady } = props;
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);

  const granted = permission?.granted === true;
  const live = granted && active && !busy && mode !== 'code';

  /** صورة التقطت للتو وتنتظر التأكيد: لا تُرسل للتحليل قبل أن يقبلها المستعمل. */
  const [pending, setPending] = useState<LensCapturedImage | null>(null);
  // تغيير الوضع يلغي الصورة المعلّقة: لا تبقى صورة قديمة فوق وضع آخر.
  useEffect(() => { setPending(null); }, [mode]);

  const shutter = async () => {
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) setPending({ uri: picture.uri, width: picture.width, height: picture.height });
      else props.onCaptureFailed();
    } catch {
      props.onCaptureFailed();
    }
  };

  const modeLabel: Record<LensMode, string> = {
    live: t('lens.mode.live'),
    photo: t('lens.mode.photo'),
    code: t('lens.mode.code'),
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.ink }]}>
      {mode === 'code' ? (
        <View style={[styles.codePanel, { top: insets.top + 64, backgroundColor: theme.colors.canvas, borderRadius: theme.radius.card }]}>
          <AppText variant="label" weight="bold">{t('lens.textLabel')}</AppText>
          <TextInput
            accessibilityLabel={t('lens.textLabel')}
            value={code}
            onChangeText={props.onCodeChange}
            placeholder={t('lens.textPlaceholder')}
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.colors.ink, borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
          />
          <Button
            label={t('lens.search')}
            testID="lens-search"
            busy={busy}
            disabled={!codeReady || busy}
            onPress={props.onSearchCode}
          />
        </View>
      ) : granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flash}
          active={active}
          barcodeScannerSettings={mode === 'live' ? { barcodeTypes: [...LENS_BARCODE_TYPES] } : undefined}
          onBarcodeScanned={mode === 'live' ? (result: BarcodeScanningResult) => props.onBarcode(String(result.data ?? '')) : undefined}
        />
      ) : (
        <View style={styles.askBox}>
          <Button label={t('lens.cameraAsk')} onPress={() => { void requestPermission(); }} />
        </View>
      )}

      {pending ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.ink }]}>
          <AppImage
            uri={pending.uri}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessibilityLabel={t('lens.capturedAlt')}
          />
          <View style={[styles.confirm, { bottom: insets.bottom + 24 }]}>
            <Button label={t('lens.retake')} tone="quiet" onPress={() => { setPending(null); }} />
            <Button
              label={t('lens.confirmPhoto')}
              testID="lens-confirm-photo"
              onPress={() => {
                const image = pending;
                setPending(null);
                props.onCapture(image);
              }}
            />
          </View>
        </View>
      ) : null}

      <LensScrim edge="top" />
      <View style={[styles.top, { top: insets.top + 8 }]}>
        <LensTopBar
          title={t('lens.topTitle')}
          onBack={props.onBack}
          onHelp={props.onHelp}
          showFlash={mode !== 'code'}
          flashOn={flash === 'on'}
          onToggleFlash={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
        />
      </View>

      {/* أزرار الالتقاط تختفي أثناء التأكيد: زر «استعمل هالصورة» يحل محلها ولا يتداخل معها. */}
      {pending ? null : <LensScrim edge="bottom" />}
      {pending ? null : <View style={[styles.bottom, { bottom: insets.bottom + 16 }]}>
        {mode !== 'code' ? (
          <AppText variant="body" color={theme.colors.canvas} align="center">{t('lens.frame')}</AppText>
        ) : null}
        {note ? (
          <AppText variant="caption" color={theme.colors.canvas} align="center" accessibilityRole="alert">{note}</AppText>
        ) : null}

        <View style={styles.pill}>
          <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
          {MODES.map((value) => {
            const selected = value === mode;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => props.onModeChange(value)}
                style={[styles.segment, selected && { backgroundColor: theme.colors.canvas, borderRadius: 24 }]}
              >
                <AppText variant="label" weight={selected ? 'bold' : 'regular'} color={selected ? theme.colors.ink : theme.colors.canvas} align="center">
                  {modeLabel[value]}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {mode !== 'code' ? (
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('lens.galleryOpen')}
              onPress={props.onOpenGallery}
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
              onPress={props.onOcerex}
              style={[styles.ocerex, { borderColor: theme.colors.canvas }]}
            >
              <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
              <AppText variant="caption" weight="bold" color={theme.colors.canvas}>OCEREX</AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ocerex.open')}
            onPress={props.onOcerex}
            style={[styles.ocerexWide, { borderColor: theme.colors.canvas }]}
          >
            <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
            <AppText variant="label" weight="bold" color={theme.colors.canvas}>{t('ocerex.open')}</AppText>
          </Pressable>
        )}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  confirm: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12 },
  askBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  codePanel: { position: 'absolute', left: 16, right: 16, padding: 16, gap: 12 },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  top: {
    position: 'absolute', left: 8, right: 8,
  },
  bottom: { position: 'absolute', left: 16, right: 16, gap: 12 },
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
  ocerexWide: {
    height: 52, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
});
