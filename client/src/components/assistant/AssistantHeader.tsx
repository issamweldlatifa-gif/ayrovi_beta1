import React from 'react';
import { History } from '../QatafoIcons';
import { AppHeader } from '../../design/AppHeader';
import { Button } from '../../design/Button';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantHeaderProps {
  isDark: boolean;
  onBack: () => void;
  onOpenHistory: () => void;
}

export const AssistantHeader: React.FC<AssistantHeaderProps> = ({ isDark, onBack, onOpenHistory }) => {
  const { tr } = useLocale();
  return (
    <AppHeader
      title="AYROVI AI"
      subtitle={tr('Assistant conversationnel', 'المساعد الذكي')}
      onBack={onBack}
      actionLabel={tr('Fermer AYROVI AI', 'إغلاق AYROVI AI')}
      tone={isDark ? 'dark' : 'light'}
      actions={
        <Button variant="ghost" size="icon" onClick={onOpenHistory} className={isDark ? 'text-white hover:bg-white/10' : ''} aria-label={tr('Ouvrir l’historique des conversations', 'فتح سجل المحادثات')} title={tr('Historique', 'السجل')}>
          <History className="h-5 w-5" />
        </Button>
      }
    />
  );
};
