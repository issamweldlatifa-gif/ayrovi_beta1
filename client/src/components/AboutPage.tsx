import React, { useEffect, useRef } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';
import { AboutSection } from './AboutSection';
import type { InterfaceSectionConfig } from '../config/interfaceConfig';

/** The menu's About destination is a real screen, not a scroll to a removed homepage block. */
export function AboutPage({ section, onClose }: { section?: InterfaceSectionConfig; onClose: () => void }) {
  const { tr, direction } = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useDialogFocus(ref, true);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };document.addEventListener('keydown', onKey);return () => document.removeEventListener('keydown', onKey); }, [onClose]);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label={tr('À propos d’AYROVI', 'حول AYROVI')} dir={direction} tabIndex={-1} className="fixed inset-0 z-[85] flex flex-col bg-white outline-none">
    <AppHeader title={tr('À propos d’AYROVI', 'حول AYROVI')} onBack={onClose} />
    <div className="min-h-0 flex-1 overflow-y-auto"><AboutSection coverImage={section?.image} title={section?.title} subtitle={section?.subtitle} /></div>
  </div>;
}
