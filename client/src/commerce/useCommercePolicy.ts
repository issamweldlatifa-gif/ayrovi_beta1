import { useCallback, useEffect, useState } from 'react';
import { getCommerceConfig } from '../services/publicApi';
import { parseCommercePolicy, type CommercePolicy } from './policy';

type State = { status: 'loading' | 'error'; policy: null } | { status: 'ready'; policy: CommercePolicy };
export function useCommercePolicy(active: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading', policy: null });
  useEffect(() => {
    if (!active) return;
    let current = true;
    setState({ status: 'loading', policy: null });
    getCommerceConfig({ refresh: attempt > 0 }).then(payload => {
      const policy = parseCommercePolicy(payload.data);
      if (current) setState({ status: 'ready', policy });
    }).catch(() => { if (current) setState({ status: 'error', policy: null }); });
    return () => { current = false; };
  }, [active, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}
