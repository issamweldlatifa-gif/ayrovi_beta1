/**
 * يخفي شريط الحالة وشريط التنقل في Android، ولا يكون ذلك إلا وشاشة Lens في المقدّمة.
 *
 * التصريح بالمكوّن (لا دالة عامة) لأن React يحسب الحالة من المكوّنات المركّبة فقط:
 * عند مغادرة Lens يُرفع المكوّن، فيعود الشريطان تلقائياً. لا يوجد إعداد عام للتطبيق.
 */
import { StatusBar } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';

export interface LensSystemBarsProps {
  /** `true` حين تكون Lens هي الشاشة المعروضة. */
  active: boolean;
}

export function LensSystemBars({ active }: LensSystemBarsProps) {
  if (!active) return null;
  return (
    <>
      <StatusBar hidden animated />
      <NavigationBar hidden />
    </>
  );
}
