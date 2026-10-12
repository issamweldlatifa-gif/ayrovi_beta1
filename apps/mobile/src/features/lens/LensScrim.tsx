/**
 * تدرّج داكن خفيف على حافة الكاميرا (أعلى أو أسفل)، لتبقى الأيقونات والنصوص
 * مقروءة فوق أي خلفية فاتحة (طاولة خشب، ورق أبيض...). لا يتلقى اللمس.
 */
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface LensScrimProps {
  edge: 'top' | 'bottom';
}

const HEIGHT = 170;

export function LensScrim({ edge }: LensScrimProps) {
  const top = edge === 'top';
  return (
    <LinearGradient
      pointerEvents="none"
      colors={top ? ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'] : ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
      style={[styles.base, top ? styles.top : styles.bottom]}
    />
  );
}

const styles = StyleSheet.create({
  base: { position: 'absolute', left: 0, right: 0, height: HEIGHT },
  top: { top: 0 },
  bottom: { bottom: 0 },
});
