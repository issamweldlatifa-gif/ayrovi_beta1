/** Subscribe before readiness so links arriving during startup are not lost. */
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { resolveDeepLink } from './resolve';

export function useDeepLinkRouting(enabled: boolean): void {
  const pending = useRef<string | null>(null);
  const ready = useRef(enabled);

  useEffect(() => {
    ready.current = enabled;
    if (enabled && pending.current) {
      const route = pending.current;
      pending.current = null;
      router.push(route as never);
    }
  }, [enabled]);

  useEffect(() => {
    let alive = true;
    let receivedWarmLink = false;
    const deliver = (raw: string | null) => {
      if (!alive || !raw) return false;
      const route = resolveDeepLink(raw);
      if (!route) return false; // Keep the existing host/path allowlist, even while queued.
      if (ready.current) router.push(route as never);
      else pending.current = route;
      return true;
    };
    const subscription = Linking.addEventListener('url', ({ url }) => {
      receivedWarmLink = deliver(url) || receivedWarmLink;
    });
    void Linking.getInitialURL().then(url => {
      // A slow OS response must not overwrite a more recent user intent.
      if (!receivedWarmLink) deliver(url);
    }).catch(() => undefined);
    return () => { alive = false; subscription.remove(); };
  }, []);
}
