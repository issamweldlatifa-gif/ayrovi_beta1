/**
 * Indicateur d'attente ZAYROVI : un cercle fin en pointillés qui tourne
 * (référence : Zalando). Un long arc plein en tête, suivi de tirets de plus en
 * plus courts jusqu'à un point. Il remplace les cinq barres violettes.
 *
 * Il ne remplace pas les squelettes structurés : une liste garde son squelette,
 * une action courte utilise ce cercle. Dans un bouton, il prend la place du
 * pictogramme de tête (ex. le logo Google), dans la couleur du libellé.
 *
 * La rotation tourne sur le fil natif, s'arrête au démontage et se fige quand
 * l'utilisateur demande moins de mouvement.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from './theme';
import { SPINNER_SIZES, SPINNER_TURN_MS, spinnerDashes, type SpinnerSize } from './spinnerGeometry';

export function LoadingSpinner({
  size = 'md',
  color,
  testID,
}: {
  size?: SpinnerSize;
  /** Couleur du trait — par défaut l'encre du thème (noir / blanc en mode sombre). */
  color?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const reduced = theme.motion.reduced === 0;
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      turn.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: SPINNER_TURN_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, turn]);

  const { box, stroke } = SPINNER_SIZES[size];
  const radius = (box - stroke) / 2;
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: box, height: box, transform: [{ rotate }] }}
    >
      <Svg width={box} height={box}>
        <Circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          stroke={color ?? theme.colors.ink}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={spinnerDashes(radius)}
        />
      </Svg>
    </Animated.View>
  );
}
