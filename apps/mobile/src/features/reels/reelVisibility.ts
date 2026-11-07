import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY = 'ayrovi.reels.hidden.device.v1';
let hidden: readonly string[] = [];
let loading: Promise<void> | undefined;
let writes = Promise.resolve();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const load = () =>
  (loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      try {
        const value: unknown = JSON.parse(raw || '[]');
        if (Array.isArray(value))
          hidden = value.filter((id): id is string => typeof id === 'string');
      } catch {
        /* Invalid old preference: use an empty list. */
      }
      emit();
    })
    .catch(() => {}));
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  void load();
  return () => {
    listeners.delete(listener);
  };
};
export function useHiddenReels() {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden
  );
}
function update(change: (ids: readonly string[]) => string[]) {
  const next = writes
    .catch(() => {})
    .then(async () => {
      await load();
      const ids = change(hidden);
      await AsyncStorage.setItem(KEY, JSON.stringify(ids));
      hidden = ids;
      emit();
    });
  writes = next;
  return next;
}
export const hideReelOnDevice = (id: string) =>
  update((ids) => Array.from(new Set([...ids, id])));
export const restoreHiddenReels = () => update(() => []);
