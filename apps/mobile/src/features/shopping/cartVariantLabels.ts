/**
 * Extrait proprement `color` et `size` lorsqu'une ligne ne fournit qu'un `variant`
 * combiné (ex. `"Jean clair · 4Y (98-104 cm)"` ou `"Couleur: Noir, Taille: M"`).
 */
export function splitCartVariantLabels(input: {
  requestedColor?: string;
  requestedSize?: string;
  variant?: string;
}): { color: string; size: string; extra: string } {
  let color = String(input.requestedColor ?? '').trim();
  let size = String(input.requestedSize ?? '').trim();
  const raw = String(input.variant ?? '').trim();
  if (!raw) return { color, size, extra: '' };

  if (color && raw.toLowerCase() === color.toLowerCase()) return { color, size, extra: '' };
  if (size && raw.toLowerCase() === size.toLowerCase()) return { color, size, extra: '' };

  const parts = raw
    .split(/\s*(?:·|\||\/|,|;)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const leftovers: string[] = [];
  for (const part of parts) {
    const colorMatch = /^(?:couleur|color|colour|farbe|لون|اللون)\s*[:=-]\s*(.+)$/i.exec(part);
    if (colorMatch && !color) {
      color = colorMatch[1].trim();
      continue;
    }
    const sizeMatch = /^(?:taille|size|pointure|مقاس|المقاس)\s*[:=-]\s*(.+)$/i.exec(part);
    if (sizeMatch && !size) {
      size = sizeMatch[1].trim();
      continue;
    }
    leftovers.push(part);
  }

  if (!color && !size && leftovers.length === 2) {
    return { color: leftovers[0], size: leftovers[1], extra: '' };
  }
  if (!color && !size && leftovers.length === 1) {
    const token = leftovers[0];
    if (/^(?:xxs|xs|s|m|l|xl|xxl|3xl|4xl|\d{2}(?:[.,]\d)?|\d+\s*[yanscm]+)$/i.test(token)) {
      return { color: '', size: token, extra: '' };
    }
    return { color: '', size: '', extra: token };
  }

  const filtered = leftovers.filter(
    (entry) => entry.toLowerCase() !== color.toLowerCase() && entry.toLowerCase() !== size.toLowerCase(),
  );
  return { color, size, extra: filtered.join(' · ') };
}
