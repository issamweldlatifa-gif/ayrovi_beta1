import React, { type ReactNode } from 'react';

/** Place global list controls here; keep all record actions in DataTable. */
export function OfficeListToolbar({ label, children, trailing }: { label: string; children: ReactNode; trailing?: ReactNode }) {
  return <div className="admin-list-toolbar office-list-toolbar" role="group" aria-label={label}>
    <div className="office-list-controls">{children}</div>
    {trailing && <div className="office-list-trailing">{trailing}</div>}
  </div>;
}
