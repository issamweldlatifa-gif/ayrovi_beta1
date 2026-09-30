const STORAGE_KEY = 'ayrovi.ocerex.onboarding.v1';

interface OnboardingRecord {
  guest?: boolean;
  accounts?: Record<string, boolean>;
}

function read(storage: Pick<Storage, 'getItem'> | null): OnboardingRecord {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OnboardingRecord;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** First-use flag in the existing local preference store. Per account when signed in. */
export function ocerexOnboardingComplete(storage: Pick<Storage, 'getItem'> | null, accountId: string | null): boolean {
  const record = read(storage);
  if (accountId) return Boolean(record.accounts?.[accountId]);
  return Boolean(record.guest);
}

export function markOcerexOnboardingComplete(storage: Pick<Storage, 'getItem' | 'setItem'> | null, accountId: string | null): void {
  if (!storage) return;
  const record = read(storage);
  if (accountId) record.accounts = { ...record.accounts, [accountId]: true };
  else record.guest = true;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* preference storage can be unavailable */ }
}
