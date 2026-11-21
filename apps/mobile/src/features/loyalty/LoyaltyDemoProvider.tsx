import { createContext, useContext, useCallback, useReducer, type Dispatch, type ReactNode } from 'react';
import { emptyDemo, updateDemo, type DemoAction, type LoyaltyDemo } from './loyaltyDemo';

const DemoContext = createContext<readonly [LoyaltyDemo, Dispatch<DemoAction>] | null>(null);

// Keep only the current owner's draft without remounting the navigator.
export function LoyaltyDemoProvider({ children, owner = 'guest' }: { children: ReactNode; owner?: string }) {
  const [snapshot, dispatch] = useReducer((state: { owner: string; data: LoyaltyDemo }, action: { owner: string; event: DemoAction }) =>
    ({ owner: action.owner, data: updateDemo(action.owner === state.owner ? state.data : emptyDemo, action.event) }), { owner, data: emptyDemo });
  if (snapshot.owner !== owner) dispatch({ owner, event: { type: 'reset' } });
  const send = useCallback((event: DemoAction) => dispatch({ owner, event }), [owner]);
  return <DemoContext.Provider value={[snapshot.owner === owner ? snapshot.data : emptyDemo, send]}>{children}</DemoContext.Provider>;
}

export function useLoyaltyDemo() {
  const demo = useContext(DemoContext);
  if (!demo) throw new Error('LoyaltyDemoProvider is missing');
  return demo;
}
