import React, { useEffect, useRef, type ReactNode } from 'react';
import { Plus, X } from '../../components/QatafoIcons';
import { HOME_TAB, type WorkTab } from './workTabs';
import { useOfficeText } from './OfficeLocale';

export function WorkTabStrip({ tabs, active, label, icon, go, close, open }: {
  tabs: WorkTab[]; active: string; label: (section: string) => string; icon: (section: string) => ReactNode;
  go: (tab: WorkTab) => void; close: (section: string) => void; open: () => void;
}) {
  const t = useOfficeText();
  const rail = useRef<HTMLElement>(null);
  useEffect(() => {
    rail.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return <div className="office-tabbar">
    <nav ref={rail} aria-label={t('Onglets de travail', 'تبويبات الخدمة')} className="office-tabs">
      {tabs.map(tab => {
        const selected = tab.section === active;
        return <div key={tab.section} className="office-tab" data-current={selected || undefined}>
          <button type="button" className="office-tab-route" aria-current={selected ? 'page' : undefined} onClick={() => go(tab)} title={label(tab.section)}>
            {icon(tab.section)}<span>{label(tab.section)}</span>
          </button>
          {tab.section !== HOME_TAB && <button type="button" className="office-tab-close" aria-label={`${t('Fermer', 'سكّر')} ${label(tab.section)}`} onClick={() => {
            const focus = rail.current?.querySelectorAll<HTMLButtonElement>('.office-tab-route');
            const index = tabs.indexOf(tab);
            close(tab.section);
            (focus?.[index + 1] ?? focus?.[index - 1])?.focus();
          }}><X size={13} /></button>}
        </div>;
      })}
    </nav>
    <button type="button" className="office-tab-add" onClick={open} aria-label={t('Ouvrir un espace', 'افتح مساحة')} title={t('Ouvrir un espace', 'افتح مساحة')}><Plus size={18} /></button>
  </div>;
}
