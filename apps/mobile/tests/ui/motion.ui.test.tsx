/**
 * Mouvement partagé (`design/motion.tsx`).
 *  • `FadeIn` garde son contenu et son identifiant de test ;
 *  • si le système demande moins d'animations, l'état final est affiché tout de suite
 *    (opacité 1, pas de fondu) ;
 *  • `PressScale` rend ses enfants tels quels pendant l'appui.
 */
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';

import { FadeIn, PressScale } from '../../src/design/motion';

afterEach(async () => {
  jest.restoreAllMocks();
});

describe('FadeIn', () => {
  it('rend son contenu et son identifiant', async () => {
    await render(<FadeIn testID="fade-block"><Text>contenu</Text></FadeIn>);
    expect(screen.getByTestId('fade-block')).toBeTruthy();
    expect(screen.getByText('contenu')).toBeTruthy();
  });

  it('avec « réduire les animations » : l’opacité passe à 1 sans fondu', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    await render(<FadeIn testID="fade-reduced"><Text>x</Text></FadeIn>);
    // La préférence système se lit de façon asynchrone : on attend le passage à l'état final.
    await waitFor(() => expect(setValue).toHaveBeenCalledWith(1));
  });
});

describe('PressScale', () => {
  it('rend ses enfants pendant et hors appui', async () => {
    const { rerender } = await render(<PressScale pressed><Text>tuile</Text></PressScale>);
    expect(screen.getByText('tuile')).toBeTruthy();
    await rerender(<PressScale pressed={false}><Text>tuile</Text></PressScale>);
    expect(screen.getByText('tuile')).toBeTruthy();
  });
});
