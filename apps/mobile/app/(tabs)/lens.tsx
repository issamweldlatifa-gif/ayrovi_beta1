/**
 * Lens — coquille (la caméra native et l'analyse arrivent en phase P4).
 * L'écran existe pour que la navigation soit réelle dès P0, pas pour promettre
 * une fonction qui n'est pas là : la phase est annoncée en clair.
 */
import { Screen } from '@/design/ui';

export default function LensScreen() {
  return <Screen tab="lens" phase="P4" />;
}
