/**
 * AYWEBs — indicateur de lecture (Q7).
 *
 * Ce composant ne sait RIEN du réseau : il reçoit une phase et un temps
 * écoulé, et se contente de les montrer. C'est volontaire — un composant qui
 * « gèrerait » l'attente finirait par inventer son propre état, et l'on
 * retrouverait l'attente opaque qu'on cherche justement à supprimer.
 *
 * Deux choix qui portent le sens :
 *
 * • **le jalon actif PULSE**, il ne se remplit pas.** Une barre qui progresse
 *   linéairement avec le temps suggère « ça avance », alors qu'il ne s'est
 *   peut-être rien passé du tout. Le pouls, lui, dit seulement « c'est en
 *   cours » — ce qui est vrai dans tous les cas.
 *
 * • **le décompte est un FAIT**, pas une prophétie : il retranche le temps
 *   écoulé du budget réel d'abandon (15 s). À zéro, la requête est vraiment
 *   abandonnée — le chiffre et le comportement ne se contredisent jamais.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import {
  isTerminalPhase, remainingSeconds, stepState, WAITING_PHASES,
  type ReadPhase,
} from './phase';

export interface ReadingProgressProps {
  phase: ReadPhase;
  /** Temps écoulé depuis le lancement de la lecture, en millisecondes. */
  elapsedMs: number;
  /** Libellés, dans l'ordre de `WAITING_PHASES`. */
  labels: string[];
  /** Préfixe du décompte (ex. « reste »). */
  countdownPrefix?: string;
}

export function ReadingProgress({ phase, elapsedMs, labels, countdownPrefix = '' }: ReadingProgressProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isTerminalPhase(phase)) {
      loop.current?.stop();
      pulse.setValue(1);
      return;
    }
    loop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: theme.motion.standard, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: theme.motion.standard, useNativeDriver: true }),
      ]),
    );
    loop.current.start();
    return () => { loop.current?.stop(); };
  }, [phase, pulse, theme.motion.standard]);

  if (phase === 'idle') return null;

  const seconds = remainingSeconds(elapsedMs);
  const terminal = isTerminalPhase(phase);

  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      {WAITING_PHASES.map((candidate, index) => {
        const state = stepState(index, phase);
        const label = labels[index] ?? candidate;
        const color = state === 'done' ? theme.colors.accent
          : state === 'active' ? theme.colors.ink
            : theme.colors.muted;
        return (
          <View key={candidate} style={styles.step}>
            <View style={styles.marker}>
              {state === 'done' ? (
                <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent} />
              ) : (
                <Animated.View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: color,
                    opacity: state === 'active' ? pulse : 0.4,
                  }}
                />
              )}
            </View>
            <AppText variant="caption" color={color} weight={state === 'active' ? 'bold' : 'regular'}>
              {label}
            </AppText>
          </View>
        );
      })}

      {!terminal ? (
        <AppText variant="caption" color={theme.colors.muted}>
          {countdownPrefix} {seconds}s
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marker: { width: 16, alignItems: 'center', justifyContent: 'center' },
});
