import React, { useState } from 'react';
import { Input, type InputProps } from './Field';

/**
 * Sign-in/sign-up policy: no saved identity before the visitor chooses a field.
 * Initially read-only to discourage eager browser credential autofill; keyboard
 * focus or a tap enables normal editing, paste and IME. No hidden dummy inputs,
 * hard-coded account blacklist, polling, or clearing while the visitor is typing.
 * Password-manager extensions may ignore browser hints; this is not a guarantee
 * against extensions modifying the page after an explicit interaction.
 */
export function ManualAuthInput({ onFocus, onChange, value, ...props }: InputProps) {
  const [editing, setEditing] = useState(false);
  return <Input
    {...props}
    value={value}
    autoComplete="off"
    readOnly={!editing}
    data-lpignore="true"
    data-1p-ignore="true"
    onFocus={(event) => {
      // Remove a browser-restored DOM value before accepting manual input.
      if (!editing) event.currentTarget.value = String(value ?? '');
      setEditing(true);
      onFocus?.(event);
    }}
    onChange={(event) => {
      if (!editing) { event.currentTarget.value = String(value ?? ''); return; }
      onChange?.(event);
    }}
  />;
}
