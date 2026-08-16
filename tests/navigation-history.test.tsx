// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NavigationHistoryProvider,
  pushUrlPreservingNavigation,
  replaceUrlPreservingNavigation,
  useNavigationHistory,
} from '../client/src/navigation/NavigationHistory';

type NavigationApi = ReturnType<typeof useNavigationHistory>;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let navigation: NavigationApi;

function Probe() {
  navigation = useNavigationHistory();
  return <output>{navigation.current?.id || 'home'}</output>;
}

function mountNavigation(existingState: Record<string, unknown> = {}) {
  window.history.replaceState(existingState, '', '/');
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host!);
    root.render(<NavigationHistoryProvider><Probe /></NavigationHistoryProvider>);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  host = null;
  window.history.replaceState({}, '', '/');
});

describe('AYROVI browser navigation history', () => {
  it('registers the landing page as depth zero without discarding other history state', () => {
    mountNavigation({ router: { scroll: 120 } });

    expect(navigation.stack).toEqual([]);
    expect(window.history.state.router).toEqual({ scroll: 120 });
    expect(window.history.state.__ayroviNavigationV1).toEqual({ version: 1, depth: 0, stack: [] });
  });

  it('creates restorable entries for cart and checkout, then replaces the submitted checkout with success', () => {
    mountNavigation({ foreign: 'preserved' });

    act(() => navigation.navigate([{ id: 'app:cart' }]));
    const cartState = structuredClone(window.history.state);
    expect(navigation.entry.depth).toBe(1);

    act(() => navigation.navigate([{ id: 'app:checkout' }]));
    expect(navigation.entry.depth).toBe(2);

    act(() => navigation.replaceTop({ id: 'app:order-success' }));
    expect(navigation.entry.depth).toBe(2);
    expect(navigation.current?.id).toBe('app:order-success');
    expect(window.history.state.foreign).toBe('preserved');

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: cartState })));
    expect(navigation.current?.id).toBe('app:cart');
    expect(navigation.entry.depth).toBe(1);
  });

  it('squashes temporary authentication steps so checkout Back returns directly to its source', () => {
    mountNavigation();
    act(() => navigation.navigate([{ id: 'app:cart' }]));
    const cartState = structuredClone(window.history.state);
    act(() => navigation.navigate([{ id: 'app:account' }]));
    act(() => navigation.pushLayer({ id: 'account:phone-login' }));
    act(() => navigation.pushLayer({ id: 'account:otp-code' }));
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);

    act(() => navigation.rewindAndNavigate(1, [{ id: 'app:checkout' }]));
    expect(go).toHaveBeenCalledWith(-3);
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: cartState })));

    expect(navigation.current?.id).toBe('app:checkout');
    expect(navigation.entry.depth).toBe(2);
  });

  it('restores nested layers and their validated payload on popstate', () => {
    mountNavigation();

    act(() => navigation.navigate([{ id: 'cms:stories' }]));
    const socialState = structuredClone(window.history.state);
    act(() => navigation.pushLayer({ id: 'social:tab-story', payload: { index: 3 } }));
    const storyState = structuredClone(window.history.state);
    act(() => navigation.pushLayer({ id: 'social:tab-comments', payload: { postId: 'story-42' } }));

    expect(navigation.stack.map((layer) => layer.id)).toEqual(['cms:stories', 'social:tab-story', 'social:tab-comments']);
    expect(navigation.current?.payload?.postId).toBe('story-42');

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: storyState })));
    expect(navigation.current?.id).toBe('social:tab-story');
    expect(navigation.current?.payload?.index).toBe(3);

    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: socialState })));
    expect(navigation.current?.id).toBe('cms:stories');
  });

  it('keeps navigation state while OAuth/admin URL helpers change the address', () => {
    mountNavigation({ thirdParty: true });
    act(() => navigation.navigate([{ id: 'app:account' }]));
    const expected = structuredClone(window.history.state.__ayroviNavigationV1);

    replaceUrlPreservingNavigation('/?customerAuth=success');
    expect(window.location.search).toBe('?customerAuth=success');
    expect(window.history.state.__ayroviNavigationV1).toEqual(expected);

    pushUrlPreservingNavigation('/admin?section=orders');
    expect(window.location.pathname).toBe('/admin');
    expect(window.history.state.__ayroviNavigationV1).toEqual(expected);
    expect(window.history.state.thirdParty).toBe(true);
  });

  it('goes directly to the true landing entry and never asks history to leave from depth zero', () => {
    mountNavigation();
    act(() => navigation.navigate([{ id: 'app:cart' }]));
    act(() => navigation.navigate([{ id: 'app:checkout' }]));
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);

    act(() => navigation.goHome());
    expect(go).toHaveBeenCalledWith(-2);

    const rootState = {
      ...window.history.state,
      __ayroviNavigationV1: { version: 1, depth: 0, stack: [] },
    };
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: rootState })));
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    act(() => navigation.back());
    expect(back).not.toHaveBeenCalled();
    expect(navigation.stack).toEqual([]);
  });
});
