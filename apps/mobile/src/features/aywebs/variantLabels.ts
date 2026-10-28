/**
 * AYWEBs — un libellé d'INTERFACE n'est pas un choix de produit (28/10/2026).
 *
 * ── Le défaut rapporté, mot pour mot ──────────────────────────────────────
 * « ورقة خيارات في متجر مثل زالاندو لم تعد تعيد لا لون ولا أحجام ولا مقاسات
 * مثل سابق » — la feuille d'ajout d'une fiche Zalando n'affichait plus que
 * « Taille » et « Votre taille » : ni pointure, ni couleur, ni mesure.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * Le sélecteur de taille de la page contient des boutons d'interface : le nom
 * du groupe répété (« Taille ») et la recommandation du marchand (« Votre
 * taille »). La capture les publiait comme les deux VALEURS du groupe
 * « Taille ». Or ce groupe occupait déjà la dimension TAILLE : il masquait
 * donc les vraies pointures lues dans le `ProductGroup`. La correction est
 * faite à la source (`src/aywebs/captureScript.ts`) ; ce fichier est la
 * SECONDE barrière, côté application :
 *
 *   • une valeur identique au nom de son groupe n'est pas une valeur ;
 *   • les libellés d'aide connus (« votre taille », guide des tailles,
 *     « sélectionnez… », « toutes les couleurs ») ne le sont pas non plus ;
 *   • un groupe qui ne garde aucune valeur réelle disparaît — il ne doit pas
 *     forcer un choix que la page n'offre pas ;
 *   • il ne reste jamais un groupe d'UNE seule valeur issue de ce crible :
 *     une « taille » unique inventée par un bouton d'interface vaut moins que
 *     pas de taille du tout.
 *
 * Rien n'est ajouté ni traduit : on ne fait que retirer ce que la page
 * n'offrait pas comme choix. Les valeurs du marchand restent lettre pour
 * lettre.
 */
import type { AyWebsVariantGroup } from '@/api/aywebs';

/**
 * Libellés d'interface, toutes langues des boutiques du catalogue.
 * Ancrés au DÉBUT et suivis d'une fin de mot : « Votre taille » est écarté,
 * « Tailleur noir » (un vrai produit) ne l'est pas.
 */
const UI_VALUE = /^(?:(?:ma|votre|your|my|deine|tu|su|la\s+mia|il\s+mio)\s+(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e|misura|maat|размер|مقاس)|(?:taille|size|taglia|talla|gr(?:ö|oe)(?:ß|ss)e)\s*(?:&|et|\+)\s*(?:coupe|fit)|(?:size|taille|talla)\s*guide|guide\s+des\s+tailles|guía\s+de\s+tallas|gr(?:ö|oe)(?:ß|ss)entabelle|(?:toutes?\s+les\s+)?couleurs?|(?:all\s+)?colou?rs?|(?:todas\s+las\s+)?colores|s(?:é|e)lectionn\w*|choisiss\w*|please\s+(?:select|choose)|pick\s+(?:a|your))\b/i;

/** Clé de comparaison : casse, espaces, ponctuation de fin. */
export function choiceKey(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2018\u2019\u02bc\u0060]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s*[:*·•-]+\s*$/, '')
    .replace(/\s+/g, ' ');
}

/** Ce texte est-il un libellé d'interface (et non une valeur du marchand) ? */
export function isUiChoiceLabel(value: unknown): boolean {
  const text = String(value ?? '').trim();
  return Boolean(text) && UI_VALUE.test(text);
}

/**
 * Cette valeur est-elle un vrai choix pour ce groupe ?
 * (`group` = nom publié du groupe, `value` = valeur publiée.)
 */
export function isRealChoiceValue(group: string, value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text) return false;
  if (isUiChoiceLabel(text)) return false;
  return choiceKey(text) !== choiceKey(group);
}

/**
 * Groupes nettoyés — mêmes objets, mêmes noms, valeurs du marchand intactes.
 * Un groupe vidé par le crible est retiré de la liste.
 */
export function realChoiceGroups(groups: readonly AyWebsVariantGroup[] | null | undefined): AyWebsVariantGroup[] {
  if (!Array.isArray(groups)) return [];
  const out: AyWebsVariantGroup[] = [];
  for (const group of groups) {
    const attribute = String(group?.attribute ?? '').trim();
    if (!attribute) continue;
    const values = (Array.isArray(group.values) ? (group.values as string[]) : [])
      .filter((value: string) => isRealChoiceValue(attribute, value));
    if (!values.length) continue;
    out.push({ ...group, attribute, values });
  }
  return out;
}
