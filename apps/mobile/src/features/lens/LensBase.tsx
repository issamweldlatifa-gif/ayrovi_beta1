/**
 * القاعدة البصرية لـLens، مطابقة للماكيتات المعتمدة حرفياً:
 *  • «Photo»: الكاميرا ملء الشاشة، زر التقاط، مصغّرة المعرض، وOCEREX. التأكيد قبل الإرسال.
 *  • «Scan en direct»: الكاميرا ملء الشاشة وإطار المنتج. عند ثبات الجهاز مدة قصيرة
 *    يُلتقط إطار واحد ويُرسل للخادم نفسه (`analyze-image`). لا تُرسل إطارات متتابعة.
 *  • «Lien / code»: بطاقتان: إدخال رابط أو رمز، أو فتح ماسح QR بالكاميرا.
 *
 * الطبقات (الدروج) فوق القاعدة. الصورة تُسلَّم للشاشة الأم، والخادم هو الذي يحلّل.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type FlashMode } from 'expo-camera';

import { LENS_BARCODE_TYPES } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import type { LensMode } from '@/features/lens/lensLayers';
import { LensTopBar } from '@/features/lens/LensTopBar';
import { LensScrim } from '@/features/lens/LensScrim';
import { LensScanFrame } from '@/features/lens/LensScanFrame';
import { LensChoiceCard } from '@/features/lens/LensChoiceCard';
import { useStillness } from '@/features/lens/useStillness';

/** Photo prête pour l'analyse. `width`/`height` = taille native (sert à placer les cadres). */
export type LensCapturedImage = { uri: string; mimeType?: string; fileName?: string | null; width?: number; height?: number };

const MODES: LensMode[] = ['live', 'photo', 'code'];

/** ما يُعرض داخل وضع «Lien / code». */
type CodeView = 'choice' | 'input' | 'scanner';

export interface LensBaseProps {
  mode: LensMode;
  /** الكاميرا مسموحة الآن: Lens في المقدمة وOCEREX غير مفتوح. */
  active: boolean;
  /** التقاط تلقائي مسموح: Lens في المقدمة ولا درج مفتوح. */
  captureEnabled: boolean;
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
  onHistory: () => void;
  onOcerex: () => void;
  onBarcode: (value: string) => void;
  onCapture: (image: LensCapturedImage) => void;
  onOpenGallery: () => void;
  onCaptureFailed: () => void;
  /** رجوع إلى الرئيسية (الدروج تُغلق قبل ذلك في الشاشة الأم). */
  onBack: () => void;
}

export function LensBase(props: LensBaseProps) {
  const { mode, active, captureEnabled, busy, thumbnailUri, note, code, codeReady } = props;
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);

  /** أحدث الخصائص للمعالجات غير المتزامنة (الالتقاط التلقائي لا يعيد إنشاء المستمع). */
  const latest = useRef(props);
  latest.current = props;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const granted = permission?.granted === true;

  /** صورة التقطت للتو وتنتظر التأكيد (وضع الصورة فقط). */
  const [pending, setPending] = useState<LensCapturedImage | null>(null);
  /** «Lien / code»: الاختيار، أو الإدخال، أو الماسح. */
  const [codeView, setCodeView] = useState<CodeView>('choice');
  /** «Scan en direct»: تم التقاط منتج ثابت (تُعرض شارة «Produit détecté»). */
  const [detected, setDetected] = useState(false);

  // تغيير الوضع يلغي كل حالة مؤقتة: لا صورة معلّقة، ولا ماسح مفتوح، ولا شارة قديمة.
  useEffect(() => {
    setPending(null);
    setCodeView('choice');
    setDetected(false);
  }, [mode]);

  const shutter = async () => {
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) setPending({ uri: picture.uri, width: picture.width, height: picture.height });
      else latest.current.onCaptureFailed();
    } catch {
      latest.current.onCaptureFailed();
    }
  };

  /** «Scan en direct»: التقاط إطار واحد عند ثبات الجهاز، ثم إرساله للتحليل. */
  const captureStill = useCallback(async () => {
    if (busyRef.current || !cameraRef.current) return;
    setDetected(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (picture?.uri) latest.current.onCapture({ uri: picture.uri, width: picture.width, height: picture.height });
      else latest.current.onCaptureFailed();
    } catch {
      latest.current.onCaptureFailed();
    }
  }, []);

  useStillness(granted && mode === 'live' && captureEnabled, () => { void captureStill(); });

  const modeLabel: Record<LensMode, string> = {
    live: t('lens.mode.live'),
    photo: t('lens.mode.photo'),
    code: t('lens.mode.code'),
  };

  /** الكاميرا تظهر في الصورة والحي وفي الماسح فقط؛ وضع الإدخال بلا كاميرا. */
  const cameraNeeded = mode !== 'code' || codeView === 'scanner';
  const scannerOpen = mode === 'code' && codeView === 'scanner';

  /** الشريط العلوي: داخل الماسح يعود إلى الاختيار، وإلا يعود إلى الرئيسية. */
  const onTopBack = () => {
    if (scannerOpen || codeView === 'input') {
      setCodeView('choice');
      return;
    }
    props.onBack();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.ink }]}>
      {!cameraNeeded ? null : granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flash}
          active={active}
          barcodeScannerSettings={scannerOpen ? { barcodeTypes: [...LENS_BARCODE_TYPES] } : undefined}
          onBarcodeScanned={scannerOpen ? (result: BarcodeScanningResult) => latest.current.onBarcode(String(result.data ?? '')) : undefined}
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
                latest.current.onCapture(image);
              }}
            />
          </View>
        </View>
      ) : null}

      {mode === 'live' ? <LensScanFrame ratio={1.25} label={detected ? t('lens.productDetected') : undefined} /> : null}
      {scannerOpen ? <LensScanFrame ratio={1} /> : null}

      <LensScrim edge="top" />
      <View style={[styles.top, { top: insets.top + 8 }]}>
        <LensTopBar
          title={t('lens.topTitle')}
          onBack={onTopBack}
          onHelp={props.onHelp}
          onHistory={props.onHistory}
          showFlash={mode !== 'code' || scannerOpen}
          flashOn={flash === 'on'}
          onToggleFlash={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
        />
      </View>

      {pending ? null : <LensScrim edge="bottom" />}

      {mode === 'code' && codeView === 'choice' ? (
        <View style={[styles.choices, { top: insets.top + 120 }]}>
          <LensChoiceCard
            icon="link-outline"
            title={t('lens.choiceLinkTitle')}
            subtitle={t('lens.choiceLinkSub')}
            testID="lens-choice-link"
            onPress={() => setCodeView('input')}
          />
          <LensChoiceCard
            icon="qr-code-outline"
            title={t('lens.choiceScanTitle')}
            subtitle={t('lens.choiceScanSub')}
            testID="lens-choice-scan"
            onPress={() => setCodeView('scanner')}
          />
        </View>
      ) : null}

      {mode === 'code' && codeView === 'input' ? (
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
      ) : null}

      {pending ? null : (
        <View style={[styles.bottom, { bottom: insets.bottom + 16 }]}>
          {mode === 'photo' ? (
            <AppText variant="body" color={theme.colors.canvas} align="center">{t('lens.frame')}</AppText>
          ) : null}
          {mode === 'live' ? (
            <AppText variant="body" color={theme.colors.canvas} align="center">{t('lens.liveCaption')}</AppText>
          ) : null}
          {scannerOpen ? (
            <AppText variant="body" color={theme.colors.canvas} align="center">{t('lens.scanQrHint')}</AppText>
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

          {mode === 'photo' ? (
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
                disabled={!(granted && active && !busy)}
                style={[styles.shutterOuter, { borderColor: theme.colors.canvas, opacity: granted && active && !busy ? 1 : 0.4 }]}
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
          ) : null}

          {mode === 'code' && codeView === 'input' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ocerex.open')}
              onPress={props.onOcerex}
              style={[styles.ocerexWide, { borderColor: theme.colors.canvas }]}
            >
              <View style={[StyleSheet.absoluteFill, styles.pillBack, { backgroundColor: theme.colors.ink, borderRadius: 28 }]} />
              <AppText variant="label" weight="bold" color={theme.colors.canvas}>{t('ocerex.open')}</AppText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  confirm: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12 },
  askBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  choices: { position: 'absolute', left: 16, right: 16, gap: 12 },
  codePanel: { position: 'absolute', left: 16, right: 16, padding: 16, gap: 12 },
  input: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  top: { position: 'absolute', left: 8, right: 8 },
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
