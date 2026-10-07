/**
 * AYWEBs — coquille (phase P3 : capture du marchand, prix jugé côté serveur).
 * Le champ n'est pas encore actif : on préfère un écran qui annonce la phase
 * à un bouton qui ne fait rien.
 */
import { Screen } from '@/design/ui';

export default function AyWebsScreen() {
  return <Screen tab="aywebs" phase="P3" />;
}
