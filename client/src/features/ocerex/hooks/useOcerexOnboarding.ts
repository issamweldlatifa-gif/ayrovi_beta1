import { useCallback, useState } from 'react';
import { markOcerexOnboardingComplete, ocerexOnboardingComplete } from '../utils/preferences';

export function useOcerexOnboarding(accountId: string | null) {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const [done, setDone] = useState(() => ocerexOnboardingComplete(storage, accountId));
  const [helpOpen, setHelpOpen] = useState(false);
  const complete = useCallback(() => {
    markOcerexOnboardingComplete(storage, accountId);
    setDone(true);
    setHelpOpen(false);
  }, [accountId, storage]);
  return { showOnboarding: !done || helpOpen, helpOpen, complete, openHelp: () => setHelpOpen(true), closeHelp: () => setHelpOpen(false) };
}
