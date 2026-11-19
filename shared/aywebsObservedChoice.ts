/** A value printed by the merchant, not a label for opening its picker. */
export function isAyWebsPickerPlaceholder(name: string, value: string): boolean {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/^[\s….-]+|[\s:：*….-]+$/gu, '');
  const key = normalize(value);
  const group = normalize(name);
  if (!key || key === group || /^(?:n\/?a|not applicable|non applicable|votre taille|your size|size guide|guide des tailles|taille & coupe)$/iu.test(key)) return true;
  const prompt = /^(?:sélectionne[rz]|choisi[rs]|select|choose|please select|please choose|اختار|اختر)(?:\s+(.+))?$/iu.exec(key);
  if (!prompt) return false;
  const target = (prompt[1] || '').replace(/^(?:a|an|your|une?|votre|la|le|les)\s+/u, '');
  return !target || target === group || /^(?:option|size|color|colour|type|volume|taille|couleur|contenance|variant|variante|الحجم|المقاس|اللون|الخيار)$/u.test(target);
}

export interface AyWebsObservedGroup { name: string; values: string[]; selected?: string[] }
const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** A DOM selection wins. Text from the page only counts when scoped or unambiguous. */
export function observedAyWebsChoice(group: AyWebsObservedGroup, groups: AyWebsObservedGroup[], selectedTexts: string[]): string {
  const values = group.values.filter(value => !isAyWebsPickerPlaceholder(group.name, value));
  const match = (text: string) => values.find(value => norm(value) === norm(text));
  const explicit = new Set<string>((group.selected ?? []).map(match).filter((value): value is string => Boolean(value)));
  if (explicit.size > 1) return '';
  if (explicit.size === 1) return [...explicit][0] ?? '';
  const named = new Set<string>();
  const bare = new Set<string>();
  for (const text of selectedTexts) {
    const index = text.search(/[:：]/u);
    if (index > -1) {
      const sameGroup = norm(text.slice(0, index)) === norm(group.name);
      const picked = sameGroup ? match(text.slice(index + 1)) : undefined;
      if (picked) named.add(picked);
    } else {
      const picked = match(text);
      if (picked && groups.filter(other => other.values.some(value => norm(value) === norm(picked))).length === 1) bare.add(picked);
    }
  }
  if (named.size) return named.size === 1 ? [...named][0] : '';
  if (bare.size) return bare.size === 1 ? [...bare][0] : '';
  return ''; // Even one published value is not proof that the buyer picked it.
}
