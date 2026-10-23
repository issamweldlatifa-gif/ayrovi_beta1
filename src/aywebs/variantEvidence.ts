import { checkPriceText } from '../scraper/priceIntegrity';
import type { AyWebsCapturedVariantGroup } from '../../shared/aywebsCapture';

/**
 * AYWEBs — PREUVE PAR VALEUR D'UNE CAPTURE CLIENTE (23/10/2026).
 *
 * La capture publie désormais, pour chaque valeur d'un groupe (« Bleu »,
 * « 150 ml »), ce que la PAGE dit d'ELLE : disponible / indisponible, et son
 * prix quand il est écrit sous la pastille. Ce module transforme ces faits en
 * une réponse pour UNE combinaison demandée — sans jamais étendre à une valeur
 * ce que la page n'a dit que d'une autre.
 *
 * Règles (jamais négociables) :
 *   • le NÉGATIF gagne : une valeur explicitement indisponible n'est jamais
 *     rendue disponible par une autre lecture ;
 *   • « pas publié » n'est pas « disponible » : l'état reste UNKNOWN ;
 *   • deux prix différents pour une même combinaison ⇒ AUCUN prix (on ne
 *     choisit pas à la place du marchand) ;
 *   • un prix « à partir de » n'est pas un prix ferme : il est signalé comme
 *     tel et ne sert pas de devis ;
 *   • un prix écrit dans une devise qui contredit la devise PROUVÉE de la page
 *     n'est pas retenu (le montant a bien été lu, mais il ne s'applique pas).
 */

export type AyWebsCapturedValueState = 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface AyWebsValueEvidence {
  /** Nom du groupe tel que la page le publie. */
  group: string;
  /** Valeur demandée (telle que le client l'a envoyée). */
  requested: string;
  /** Valeur publiée par la capture (peut différer par la casse seulement). */
  value: string | null;
  /** Le groupe demandé existe-t-il dans la capture ? */
  groupFound: boolean;
  /** La valeur demandée est-elle publiée dans ce groupe ? */
  found: boolean;
  /** La valeur est-elle celle AFFICHÉE sur la page (donc couverte par le prix/bouton de la page) ? */
  shown: boolean;
  state: AyWebsCapturedValueState;
  /** Prix marchand lu pour CETTE valeur (null si absent, ambigu ou d'une autre devise). */
  price: number | null;
  priceText: string | null;
  priceFrom: boolean;
  stock: number | null;
}

export interface AyWebsSelectionEvidence {
  attributes: AyWebsValueEvidence[];
  /** Nombre d'attributs dont le GROUPE est publié par la capture. */
  groupsMatched: number;
  /** Toutes les valeurs demandées sont publiées (rien n'est supposé). */
  complete: boolean;
  /** Toutes les valeurs sont publiées ET affichées : le prix/bouton de page valent pour elles. */
  shownCombination: boolean;
  /** Au moins une valeur est explicitement indisponible. */
  blocked: boolean;
  /** Toutes les valeurs publiées le disent explicitement disponible. */
  available: boolean;
  /** Prix marchand commun à toutes les valeurs demandées (null si aucun ou conflit). */
  price: number | null;
  priceText: string | null;
  /** Le prix retenu est un prix « à partir de ». */
  priceFrom: boolean;
  /** Deux valeurs publiées annoncent deux prix incompatibles : aucun prix publié. */
  priceConflict: boolean;
  /** Un prix publié contredit la devise prouvée de la page : il n'est pas retenu. */
  currencyMismatch: boolean;
  notes: string[];
}

function normalize(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Le texte est-il écrit dans la devise prouvée (ou sans aucun indice de devise) ? */
function currencyAccepts(hints: string[], currency: string | null | undefined): boolean {
  const iso = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) return true;
  if (!hints.length) return true;
  return hints.includes(iso);
}

function evidenceFor(
  group: AyWebsCapturedVariantGroup,
  requested: string,
  currency: string | null | undefined,
): { evidence: AyWebsValueEvidence; currencyMismatch: boolean } {
  const wanted = normalize(requested);
  const option = (group.options || []).find((entry) => normalize(entry.value) === wanted) || null;
  const published = group.values.some((value) => normalize(value) === wanted);
  const shown = (group.selected || []).some((value) => normalize(value) === wanted);
  const state: AyWebsCapturedValueState = option?.available === true
    ? 'AVAILABLE'
    : option?.available === false ? 'OUT_OF_STOCK' : 'UNKNOWN';

  let price: number | null = null;
  let priceText: string | null = null;
  let priceFrom = option?.priceFrom === true;
  let currencyMismatch = false;

  const raw = typeof option?.price === 'string' ? option.price.trim() : '';
  if (raw) {
    const check = checkPriceText(raw);
    if (check.ok && check.value > 0) {
      if (currencyAccepts(check.currencyHints, currency)) {
        price = check.value;
        priceText = raw;
      } else {
        currencyMismatch = true;
      }
    }
  }

  return {
    evidence: {
      group: group.name,
      requested: String(requested),
      value: option?.value ?? (published ? String(requested) : null),
      groupFound: true,
      found: Boolean(option) || published,
      shown,
      state,
      price,
      priceText,
      // Un « à partir de » sans prix publiable reste un « à partir de » : on ne le
      // dégrade pas en prix ferme, on le signale.
      priceFrom,
      stock: typeof option?.stock === 'number' && option.stock > 0 ? option.stock : null,
    },
    currencyMismatch,
  };
}

/**
 * Réponse de la capture pour UNE combinaison. `attributes` = ce que le client a
 * choisi (`{ couleur: 'Blanc' }`), jamais le HTML.
 */
export function ayWebsSelectionEvidence(
  groups: readonly AyWebsCapturedVariantGroup[] | null | undefined,
  attributes: Record<string, string> | null | undefined,
  options: { currency?: string | null } = {},
): AyWebsSelectionEvidence {
  const list = Array.isArray(groups) ? groups : [];
  const notes: string[] = [];
  const out: AyWebsValueEvidence[] = [];
  let currencyMismatch = false;

  for (const [rawKey, rawValue] of Object.entries(attributes || {})) {
    const key = String(rawKey || '').trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !value) continue;
    const group = list.find((entry) => normalize(entry?.name) === normalize(key)) || null;
    if (!group) {
      out.push({
        group: key, requested: value, value: null, groupFound: false, found: false, shown: false,
        state: 'UNKNOWN', price: null, priceText: null, priceFrom: false, stock: null,
      });
      continue;
    }
    const result = evidenceFor(group, value, options.currency);
    if (result.currencyMismatch) currencyMismatch = true;
    out.push(result.evidence);
  }

  const groupsMatched = out.filter((entry) => entry.groupFound).length;
  const complete = out.length > 0 && out.every((entry) => entry.found);
  const shownCombination = complete && out.every((entry) => entry.shown);
  const blocked = out.some((entry) => entry.state === 'OUT_OF_STOCK');
  const available = out.length > 0 && out.every((entry) => entry.state === 'AVAILABLE');

  /* Prix de la COMBINAISON : seules les valeurs qui en publient un comptent.
     Deux montants différents pour une même combinaison = conflit, donc rien. */
  const priced = out.filter((entry) => entry.price != null);
  let price: number | null = null;
  let priceText: string | null = null;
  let priceFrom = false;
  let priceConflict = false;
  if (priced.length) {
    const first = priced[0]!;
    const agree = priced.every((entry) => Math.abs((entry.price as number) - (first.price as number)) < 0.005);
    if (agree) {
      price = first.price;
      priceText = first.priceText;
      priceFrom = priced.some((entry) => entry.priceFrom);
    } else {
      priceConflict = true;
    }
  }
  if (out.some((entry) => entry.priceFrom)) priceFrom = true;

  for (const entry of out) {
    if (!entry.groupFound) notes.push(`value_group_missing:${normalize(entry.group)}`);
    else if (!entry.found) notes.push(`value_not_published:${normalize(entry.group)}`);
    else if (entry.state === 'OUT_OF_STOCK') notes.push(`value_out_of_stock:${normalize(entry.group)}`);
    else if (entry.state === 'AVAILABLE') notes.push(`value_available:${normalize(entry.group)}`);
    else notes.push(`value_state_unpublished:${normalize(entry.group)}`);
    if (entry.price != null) notes.push(`value_price:${normalize(entry.group)}=${entry.price.toFixed(2)}`);
  }
  if (priceConflict) notes.push('value_price_conflict');
  if (currencyMismatch) notes.push('value_price_currency_mismatch');
  if (price != null && priceFrom) notes.push('value_price_from');

  return {
    attributes: out,
    groupsMatched,
    complete,
    shownCombination,
    blocked,
    available,
    price,
    priceText,
    priceFrom,
    priceConflict,
    currencyMismatch,
    notes,
  };
}
