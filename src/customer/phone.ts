export function normalizeTunisianPhone(value: unknown): string | null {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  if (!/^[24579]\d{7}$/.test(digits)) return null;
  return `+216${digits}`;
}

export function tunisianPhoneDigits(value: unknown): string | null {
  const phone = normalizeTunisianPhone(value);
  return phone ? phone.slice(4) : null;
}
