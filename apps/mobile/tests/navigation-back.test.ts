/**
 * Retour unique : précédent s'il existe, sinon l'accueil (ou le repli donné).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const nav = vi.hoisted(() => ({ canGoBack: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('expo-router', () => ({ router: nav }));

import { goBack } from '@/design/navigation';

describe('goBack', () => {
  beforeEach(() => {
    nav.canGoBack.mockReset();
    nav.back.mockReset();
    nav.replace.mockReset();
  });

  it('revient à l’écran précédent quand il existe', () => {
    nav.canGoBack.mockReturnValue(true);
    goBack('/(tabs)/account');
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('sans écran précédent, va à l’accueil par défaut', () => {
    nav.canGoBack.mockReturnValue(false);
    goBack();
    expect(nav.replace).toHaveBeenCalledWith('/');
  });

  it('sans écran précédent, respecte le repli donné', () => {
    nav.canGoBack.mockReturnValue(false);
    goBack('/orders');
    expect(nav.replace).toHaveBeenCalledWith('/orders');
  });
});
