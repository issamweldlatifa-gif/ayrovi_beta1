/**
 * Variables d'environnement à l'ancien nom (16/11/2026).
 *
 * Tout le code lit désormais `ZAYROVI_…` / `ZAYROVIX_…`. Un serveur déjà configuré
 * sur Render peut encore porter les anciens noms : on les adopte UNE fois, au
 * démarrage, avant tout autre module, sans jamais écraser une variable nouvelle
 * déjà définie. Le journal liste celles à renommer dans le tableau de bord ;
 * une fois renommées, ce module ne fait plus rien.
 */
import 'dotenv/config';
import { FORMER_ENV_PREFIX } from '../../shared/formerBrand';

export function adoptFormerBrandEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const adopted: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(`${FORMER_ENV_PREFIX}_`) && !key.startsWith(`${FORMER_ENV_PREFIX}X_`)) continue;
    if (value === undefined) continue;
    const next = `Z${key}`;
    if (env[next] !== undefined) continue;
    env[next] = value;
    adopted.push(next);
  }
  if (adopted.length && env.NODE_ENV !== 'test') {
    console.warn(`[config] ${adopted.length} variable(s) d'environnement à l'ancien nom adoptée(s) — renommez-les sur Render : `
      + adopted.map((name) => `${name.slice(1)} → ${name}`).join(', '));
  }
  return adopted;
}

adoptFormerBrandEnv();
