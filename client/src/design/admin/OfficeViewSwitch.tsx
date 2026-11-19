import React from 'react';
import { OfficeIcon, type OfficeIconName } from './OfficeIcon';

type OfficeViewOption<T> = { value: T; label: string; icon: OfficeIconName };

/** This selects a view of the same data, not a navigation link or an ARIA tab panel. */
export function OfficeViewSwitch<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (value: NoInfer<T>) => void; options: readonly OfficeViewOption<T>[];
}) {
  return <div className="bo-view-switch" role="group" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <OfficeIcon name={option.icon} />{option.label}
    </button>)}
  </div>;
}
