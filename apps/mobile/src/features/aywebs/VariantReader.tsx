/**
 * Lecture d'UNE page de variante (l'ASIN choisi) dans un WebView MASQUÉ (20/10/2026).
 *
 * Sert au bouton « Ajouter » de la feuille : la page du choix est relue, puis le
 * serveur vérifie ce choix (ASIN de la page = ASIN choisi). L'écran visible ne bouge pas.
 *
 *  • une seule lecture à la fois : une nouvelle demande annule l'ancienne ;
 *  • filet de sécurité de 20 s (AYWEBS_CAPTURE_WATCHDOG_MS), armé au début de la lecture :
 *    si la page ou la capture ne revient pas, la promesse est rejetée et le WebView se démonte ;
 *  • le script et le contrôle des messages sont ceux de la lecture principale.
 */
import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import {
  buildAyWebsCaptureInjection, fetchAyWebsCaptureScript, parseAyWebsCaptureMessage,
} from '@/api/aywebs';
import { ApiError } from '@/api/errors';
import { AYWEBS_CAPTURE_WATCHDOG_MS } from '@/features/aywebs/captureFlow';
import { waitForPageIdle } from '@/features/aywebs/captureFallback';
import { decideWebNavigation } from '@/features/aywebs/webNavigation';

/* Même contournement de typage que l'écran du magasin (react-native-webview 13.17). */
type ReaderHandle = { injectJavaScript: (script: string) => void };
const ReaderWebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<ReaderHandle> }>;

export interface VariantReaderHandle {
  /** Lit la page `url` et renvoie la capture. Rejette si la lecture échoue ou dépasse 20 s. */
  read: (url: string) => Promise<Record<string, unknown>>;
}

interface Pending {
  resolve: (capture: Record<string, unknown>) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export const VariantReader = forwardRef<VariantReaderHandle, { storeId?: string }>(function VariantReader({ storeId }, ref) {
  const [request, setRequest] = useState<{ url: string; n: number } | null>(null);
  const pending = useRef<Pending | null>(null);
  const webRef = useRef<ReaderHandle>(null);
  const loading = useRef(false);
  const counter = useRef(0);

  /** Termine la lecture en cours (une seule fois) : libère le minuteur et démonte le WebView. */
  const settle = useCallback((ok: boolean, value: unknown) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    if (current.timer) { clearTimeout(current.timer); current.timer = null; }
    setRequest(null);
    if (ok) current.resolve(value as Record<string, unknown>);
    else current.reject(value);
  }, []);

  const read = useCallback((url: string): Promise<Record<string, unknown>> => {
    /* Une nouvelle demande remplace l'ancienne (celle-ci est annulée). */
    if (pending.current) settle(false, new ApiError('aborted', 'Lecture de la variante remplacée.'));
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const entry: Pending = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        if (pending.current !== entry) return;
        settle(false, new ApiError('timeout', 'La lecture de la variante a pris trop de temps. Réessayez.'));
      }, AYWEBS_CAPTURE_WATCHDOG_MS);
      pending.current = entry;
      loading.current = true;
      counter.current += 1;
      setRequest({ url, n: counter.current });
    });
  }, [settle]);

  useImperativeHandle(ref, () => ({ read }), [read]);

  /** Page chargée : on attend qu'elle soit stable, puis on injecte le script de lecture. */
  const onLoadEnd = useCallback(() => {
    loading.current = false;
    if (!pending.current) return;
    fetchAyWebsCaptureScript({ storeId })
      .then(async (script) => {
        await waitForPageIdle(() => loading.current);
        if (!pending.current) return;
        webRef.current?.injectJavaScript(buildAyWebsCaptureInjection(script));
      })
      .catch((error: unknown) => settle(false, error));
  }, [settle, storeId]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    if (!pending.current) return;
    const parsed = parseAyWebsCaptureMessage(event.nativeEvent.data);
    if (!parsed.ok) {
      settle(false, new ApiError('malformed', `Capture refusée : ${parsed.reason}`));
      return;
    }
    settle(true, parsed.capture);
  }, [settle]);

  return (
    <View style={styles.hidden} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {request ? (
        <ReaderWebView
          key={request.n}
          ref={webRef}
          style={styles.reader}
          source={{ uri: request.url }}
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={(req: { url: string }) => decideWebNavigation(req.url) === 'allow'}
          javaScriptEnabled
          setSupportMultipleWindows={false}
          onLoadStart={() => { loading.current = true; }}
          onLoadEnd={onLoadEnd}
          onMessage={onMessage}
          onError={() => settle(false, new ApiError('network', 'La page de la variante est injoignable.'))}
        />
      ) : null}
    </View>
  );
});

/* Pas de « position: absolute » (règle du design system) : conteneur de taille nulle, WebView 1×1. */
const styles = StyleSheet.create({
  hidden: { width: 0, height: 0, overflow: 'hidden' },
  reader: { width: 1, height: 1, opacity: 0 },
});
