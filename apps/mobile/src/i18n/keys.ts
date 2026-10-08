/**
 * Résolution des clés de traduction — sans React, donc testable directement.
 *
 * Le fournisseur (`index.tsx`) n'ajoute que le contexte : la logique vit ici.
 */
import { ar } from './ar';
import { fr } from './fr';

export const DICTIONARIES = { fr, ar } as const;
export type Locale = keyof typeof DICTIONARIES;
export type TranslationKey = keyof typeof fr;
export type Vars = Record<string, string | number>;

const interpolate = (template: string, vars?: Vars) =>
  (vars
    ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
    : template);

export type Translate = (key: TranslationKey, vars?: Vars) => string;

export function translate(locale: Locale, key: TranslationKey, vars?: Vars): string {
  const dictionary = DICTIONARIES[locale] ?? fr;
  return interpolate(dictionary[key] ?? fr[key] ?? key, vars);
}
