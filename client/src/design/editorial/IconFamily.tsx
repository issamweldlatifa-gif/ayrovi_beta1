import React, { createContext, useContext } from 'react';

const IconFamilyContext = createContext({ family: 'legacy' as 'legacy' | 'editorial', direction: 'ltr' as 'ltr' | 'rtl' });
export const useIconFamily = () => useContext(IconFamilyContext);

/** Explicit boundary keeps admin and the owner's preserved navigation unchanged. */
export function IconFamily({ family, direction = 'ltr', children }: {
  family: 'legacy' | 'editorial'; direction?: 'ltr' | 'rtl'; children: React.ReactNode;
}) {
  return <IconFamilyContext.Provider value={{ family, direction }}>{children}</IconFamilyContext.Provider>;
}
