import { createContext, useContext } from 'react';
import { officeText, type OfficeLanguage } from './workspaces';

export const OfficeLanguageContext = createContext<OfficeLanguage>('fr');
export function useOfficeText() {
  const lang = useContext(OfficeLanguageContext);
  return (fr: string, ar: string) => officeText(lang, fr, ar);
}
