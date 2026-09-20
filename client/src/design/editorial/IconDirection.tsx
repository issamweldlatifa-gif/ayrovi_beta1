import React, { createContext, useContext } from 'react';

const IconDirectionContext = createContext<'ltr' | 'rtl'>('ltr');
export const useIconDirection = () => useContext(IconDirectionContext);

/** Direction is contextual. The icon family is not optional: the whole app is editorial. */
export function IconDirectionProvider({ direction, children }: {
  direction: 'ltr' | 'rtl'; children: React.ReactNode;
}) {
  return <IconDirectionContext.Provider value={direction}>{children}</IconDirectionContext.Provider>;
}
