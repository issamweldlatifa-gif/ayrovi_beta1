import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const HISTORY_KEY = '__ayroviNavigationV1';
const MAX_STACK_DEPTH = 16;

export type NavigationPayload = Record<string, string | number | boolean | null | undefined>;
export interface NavigationLayer {
  id: string;
  payload?: NavigationPayload;
}

interface NavigationEntry {
  version: 1;
  depth: number;
  stack: NavigationLayer[];
}

interface NavigateOptions { replace?: boolean }

interface NavigationHistoryValue {
  entry: NavigationEntry;
  stack: NavigationLayer[];
  current: NavigationLayer | null;
  navigate: (stack: NavigationLayer[], options?: NavigateOptions) => void;
  pushLayer: (layer: NavigationLayer) => void;
  replaceTop: (layer: NavigationLayer) => void;
  rewindAndNavigate: (targetDepth: number, stack: NavigationLayer[]) => void;
  back: (fallback?: NavigationLayer[]) => void;
  goHome: () => void;
  has: (id: string) => boolean;
  layer: (id: string) => NavigationLayer | undefined;
}

const NavigationHistoryContext = createContext<NavigationHistoryValue | null>(null);

function validLayer(value: unknown): value is NavigationLayer {
  if (!value || typeof value !== 'object') return false;
  const id = String((value as NavigationLayer).id || '');
  return /^[a-z0-9][a-z0-9:_-]{0,79}$/i.test(id);
}

function normalizePayload(payload: unknown): NavigationPayload | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const normalized: NavigationPayload = {};
  for (const [key, value] of Object.entries(payload).slice(0, 16)) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') normalized[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) normalized[key] = value;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeStack(stack: NavigationLayer[]): NavigationLayer[] {
  return stack.filter(validLayer).slice(0, MAX_STACK_DEPTH).map((item) => {
    const payload = normalizePayload(item.payload);
    return { id: item.id, ...(payload ? { payload } : {}) };
  });
}

function readEntry(state: unknown): NavigationEntry | null {
  const candidate = state && typeof state === 'object'
    ? (state as Record<string, unknown>)[HISTORY_KEY]
    : null;
  if (!candidate || typeof candidate !== 'object') return null;
  const value = candidate as Partial<NavigationEntry>;
  if (value.version !== 1 || !Number.isInteger(value.depth) || Number(value.depth) < 0 || !Array.isArray(value.stack)) return null;
  const stack = normalizeStack(value.stack as NavigationLayer[]);
  if (stack.length !== value.stack.length) return null;
  return { version: 1, depth: Number(value.depth), stack };
}

function writeState(entry: NavigationEntry, replace: boolean) {
  const previous = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  const nextState = { ...previous, [HISTORY_KEY]: entry };
  if (replace) window.history.replaceState(nextState, '');
  else window.history.pushState(nextState, '');
}

function initialEntry(): NavigationEntry {
  const existing = readEntry(window.history.state);
  if (existing) return existing;
  const root: NavigationEntry = { version: 1, depth: 0, stack: [] };
  writeState(root, true);
  return root;
}

export const NavigationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entry, setEntry] = useState<NavigationEntry>(initialEntry);
  const entryRef = useRef(entry);
  const pendingRewindRef = useRef<{ targetDepth: number; stack: NavigationLayer[] } | null>(null);
  useEffect(() => { entryRef.current = entry; }, [entry]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const restored = readEntry(event.state);
      if (!restored) return;
      const pending = pendingRewindRef.current;
      if (pending && restored.depth === pending.targetDepth) {
        pendingRewindRef.current = null;
        const next: NavigationEntry = { version: 1, depth: restored.depth + 1, stack: pending.stack };
        writeState(next, false);
        entryRef.current = next;
        setEntry(next);
        return;
      }
      entryRef.current = restored;
      setEntry(restored);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((stack: NavigationLayer[], options: NavigateOptions = {}) => {
    pendingRewindRef.current = null;
    const normalized = normalizeStack(stack);
    const current = entryRef.current;
    if (JSON.stringify(current.stack) === JSON.stringify(normalized)) return;
    const next: NavigationEntry = {
      version: 1,
      depth: options.replace ? current.depth : current.depth + 1,
      stack: normalized,
    };
    writeState(next, Boolean(options.replace));
    entryRef.current = next;
    setEntry(next);
  }, []);

  const pushLayer = useCallback((layer: NavigationLayer) => {
    const current = entryRef.current;
    navigate([...current.stack, layer]);
  }, [navigate]);

  const replaceTop = useCallback((layer: NavigationLayer) => {
    const current = entryRef.current;
    navigate([...current.stack.slice(0, -1), layer], { replace: true });
  }, [navigate]);

  const rewindAndNavigate = useCallback((targetDepth: number, stack: NavigationLayer[]) => {
    const current = entryRef.current;
    const safeTarget = Math.max(0, Math.min(current.depth, Math.trunc(targetDepth)));
    const normalized = normalizeStack(stack);
    if (safeTarget < current.depth) {
      pendingRewindRef.current = { targetDepth: safeTarget, stack: normalized };
      window.history.go(safeTarget - current.depth);
      return;
    }
    navigate(normalized);
  }, [navigate]);

  const back = useCallback((fallback: NavigationLayer[] = []) => {
    pendingRewindRef.current = null;
    const current = entryRef.current;
    if (current.depth > 0) window.history.back();
    else navigate(fallback, { replace: true });
  }, [navigate]);

  const goHome = useCallback(() => {
    pendingRewindRef.current = null;
    const current = entryRef.current;
    if (current.depth > 0) window.history.go(-current.depth);
    else navigate([], { replace: true });
  }, [navigate]);

  const value = useMemo<NavigationHistoryValue>(() => ({
    entry,
    stack: entry.stack,
    current: entry.stack[entry.stack.length - 1] || null,
    navigate,
    pushLayer,
    replaceTop,
    rewindAndNavigate,
    back,
    goHome,
    has: (id) => entry.stack.some((item) => item.id === id),
    layer: (id) => entry.stack.find((item) => item.id === id),
  }), [entry, navigate, pushLayer, replaceTop, rewindAndNavigate, back, goHome]);

  return <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>;
};

export function useNavigationHistory(): NavigationHistoryValue {
  const value = useContext(NavigationHistoryContext);
  if (!value) throw new Error('NavigationHistoryProvider is missing.');
  return value;
}

/** Keep AYROVI navigation state while cleaning OAuth query parameters or changing the URL. */
export function replaceUrlPreservingNavigation(url: string) {
  const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.replaceState(state, '', url);
}

/** Push a URL entry without discarding the AYROVI navigation payload. */
export function pushUrlPreservingNavigation(url: string) {
  const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.pushState(state, '', url);
}
