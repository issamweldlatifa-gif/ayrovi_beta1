import React from 'react';
import { EditorialIcon, type EditorialIconName } from '../editorial/Icon';

/** Semantic admin vocabulary. Geometry is always in the canonical editorial registry. */
export const officeGlyphs = {
  overview: 'OfficeOverview', crm: 'OfficeRelations', erp: 'OfficeOperations', cms: 'OfficeContent',
  admin: 'Shield', finance: 'Bank', other: 'Grid', table: 'OfficeRows', kanban: 'OfficeBoard', analytics: 'Chart',
  pdf: 'OfficePdf', view: 'Eye', density: 'OfficeDensity', light: 'OfficeSun', dark: 'Moon',
} as const satisfies Record<string, EditorialIconName>;

export type OfficeIconName = keyof typeof officeGlyphs;
export type OfficeIconSize = 'action' | 'navigation' | 'feature';
const sizes = { action: 16, navigation: 20, feature: 24 } as const;

export function OfficeIcon({ name, size = 'action' }: { name: OfficeIconName; size?: OfficeIconSize }) {
  return <EditorialIcon name={officeGlyphs[name]} size={sizes[size]} className={`office-icon office-icon--${size}`} />;
}
