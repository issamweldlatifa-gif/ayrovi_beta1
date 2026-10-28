/**
 * AYWEBs — LES CHOIX AFFICHÉS DOIVENT PARLER LA LANGUE DU SERVEUR (26/10/2026).
 *
 * ── Le fait mesuré ────────────────────────────────────────────────────────
 * Fiche Zalando « REVOLUTION 8 » : la feuille n'affichait QUE « Taille », alors
 * que le marchand publie aussi la couleur. L'ajout partait donc avec une seule
 * dimension — et le serveur, qui lit la page de son côté, refusait
 * (`VARIANT_REQUIRED`, puis `VARIANT_UNKNOWN` sur une sélection partielle).
 * Sur le WEB, la même fiche marchait parce que la feuille du site reçoit les
 * groupes DU SERVEUR, pas ceux de la capture.
 *
 * ── La règle ajoutée ici ─────────────────────────────────────────────────
 * Les groupes AFFICHÉS sont l'union des deux lectures, et ils portent le NOM
 * publié par le serveur (c'est lui qui juge l'ajout) :
 *   • même dimension (`Taille` ≡ `size`) ⇒ un seul groupe, sous le nom serveur,
 *     valeurs = celles de la capture d'abord, puis celles que seul le serveur
 *     publie ;
 *   • une dimension que la capture n'a pas vue est ajoutée telle quelle ;
 *   • une valeur n'est jamais inventée : on ne fait qu'unir ce que les deux
 *     lectures publient.
 * La sélection en cours est ensuite ré-alignée sur ces noms, pour que le client
 * n'envoie jamais `taille` là où le serveur attend `size`.
 */
import type { AyWebsVariantGroup } from '@/api/aywebs';
import { ayWebsAttributeKey, ayWebsSameAttribute } from '@/features/aywebs/attributeKeys';
import { isRealChoiceValue } from '@/features/aywebs/variantLabels';

const clean = (value: unknown): string => String(value ?? '').trim();

/** Union des groupes des deux lectures, nommés comme le serveur. */
export function mergeVariantGroups(
  fromCapture: readonly AyWebsVariantGroup[] | null | undefined,
  fromServer: readonly AyWebsVariantGroup[] | null | undefined,
): AyWebsVariantGroup[] {
  const local = Array.isArray(fromCapture) ? fromCapture : [];
  const server = Array.isArray(fromServer) ? fromServer : [];
  const out: AyWebsVariantGroup[] = [];
  const seen = new Set<string>();

  const push = (attribute: string, values: readonly string[]): void => {
    const name = clean(attribute);
    const key = ayWebsAttributeKey(name);
    if (!name || !key) return;
    /* Même dimension (et pas seulement même orthographe) : `Taille` rejoint
       `size` au lieu de créer un second champ. */
    const existing = out.find((group) => ayWebsSameAttribute(group.attribute, name));
    /* Les libellés d'interface ne sont pas des valeurs (28/10/2026) : une page
       Zalando publiait « Taille : Taille, Votre taille », ce qui masquait les
       vraies pointures et les couleurs. Le crible est fait à la source aussi ;
       ici, il protège les fiches déjà lues et les réponses du serveur. */
    const cleaned = values.map(clean).filter((value) => Boolean(value) && isRealChoiceValue(name, value));
    if (existing) {
      for (const value of cleaned) {
        if (!existing.values.some((known) => known.toLowerCase() === value.toLowerCase())) {
          existing.values.push(value);
        }
      }
      return;
    }
    if (!cleaned.length) return;
    seen.add(key);
    out.push({ attribute: name, values: [...cleaned] });
  };

  /* 1. Le serveur d'abord : c'est SON nom qui part dans la requête d'ajout. */
  for (const group of server) push(group.attribute, group.values);
  /* 2. Puis ce que la capture a vu et que le serveur n'a pas publié (valeurs
        manquantes ou dimension absente). Même dimension ⇒ fusion, pas doublon. */
  for (const group of local) push(group.attribute, group.values);
  return out;
}

/**
 * Ré-aligne une sélection sur les groupes affichés : `taille` → `size`, etc.
 * Une valeur qui n'existe dans aucune valeur publiée est CONSERVÉE telle
 * quelle (le serveur refusera en connaissance de cause — on ne choisit pas à la
 * place du marchand).
 */
export function alignSelection(
  groups: readonly AyWebsVariantGroup[],
  selection: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(selection || {})) {
    const value = clean(rawValue);
    if (!value) continue;
    const group = groups.find((candidate) => ayWebsSameAttribute(candidate.attribute, rawKey))
      ?? groups.find((candidate) => ayWebsAttributeKey(candidate.attribute) === ayWebsAttributeKey(rawKey));
    const key = group ? group.attribute.trim().toLowerCase() : clean(rawKey).toLowerCase();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

/** Les attributs sans valeur choisie (pour nommer ce qui manque, pas pour deviner). */
export function missingAttributes(
  groups: readonly AyWebsVariantGroup[],
  selection: Record<string, string>,
): string[] {
  const aligned = alignSelection(groups, selection);
  return groups
    .filter((group) => !aligned[group.attribute.trim().toLowerCase()])
    .map((group) => group.attribute);
}
