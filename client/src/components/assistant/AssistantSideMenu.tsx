import { AssistantHistoryNotice } from './AssistantHistoryNotice';
import type { HistoryStatus } from './conversationHistory';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import React from 'react';
import { ArrowLeft, Trash2 } from '../QatafoIcons';
import { AssistantConversation } from './conversationHistory';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantSideMenuProps {
  isOpen: boolean;
  isDark: boolean;
  conversations: AssistantConversation[];
  historyStatus?: HistoryStatus;
  activeConversationId: string;
  isAuthenticated: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversation: AssistantConversation) => void;
  onDeleteConversation: (id: string) => void;
  onOpenOrders: () => void;
  onOpenLens: () => void;
  onOpenAccount: () => void;
  onHelp: () => void;
  onToggleDark: () => void;
  onExit: () => void;
}

export const AssistantSideMenu: React.FC<AssistantSideMenuProps> = ({
  isOpen,
  isDark,
  conversations,
  historyStatus = 'ready',
  activeConversationId,
  isAuthenticated,
  onClose,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onOpenOrders,
  onOpenLens,
  onOpenAccount,
  onToggleDark,
  onExit,
}) => {
  const { direction, formatDate, tr } = useLocale();
  const panelRef = React.useRef<HTMLElement>(null);
  useDialogFocus(panelRef, isOpen);
  if (!isOpen) return null;

  const mainItem = `flex w-full items-center gap-3 rounded-control px-3 py-3 text-start text-sm font-semibold transition ${
    isDark ? 'text-white hover:bg-white/7' : 'text-ink hover:bg-ink/5'
  }`;
  const sectionLabel = 'px-3 pb-2 pt-5 text-xs font-extrabold uppercase tracking-[0.12em] text-muted';

  return (
    <>
      <button type="button" onClick={onClose} className="absolute inset-0 z-30 bg-ink/40 backdrop-blur-[2px]" aria-label={tr('Fermer le menu', 'إغلاق القائمة')} />
      <aside ref={panelRef} tabIndex={-1} className={`assistant-side-menu ay-readable-label border-e border-line absolute inset-y-0 left-0 z-40 flex w-[91%] max-w-[430px] flex-col px-[18px] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-overlay ${isDark ? 'bg-ink' : 'bg-white'}`} dir={direction} role="dialog" aria-modal="true" aria-label={tr('Menu SONIM', 'قائمة SONIM')}>
        <div className="flex items-center gap-2.5 pb-3">
          <img src="/media/logo-ayrovi.png" alt="" className="h-8 w-8 bg-transparent object-contain" />
          <strong className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-ink'}`}>SONIM</strong>
        </div>

        <button type="button" onClick={onExit} className={mainItem}>
          <ArrowLeft className={`h-[17px] w-[17px] text-muted ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          {tr('Retour', 'رجوع')}
        </button>
        <button type="button" onClick={onNewConversation} className="ay-btn-primary mt-1 w-full text-sm">
          {tr('Nouvelle conversation', 'محادثة جديدة')}
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <p className={sectionLabel}>{tr('Historique', 'السجل')}</p>
          <p className="ay-readable-label px-3 pb-3 text-xs leading-5 text-muted">{tr('Les 20 conversations les plus récentes sont conservées sur cet appareil, dans la limite de son stockage. Les images jointes ne sont pas conservées.', 'تُحفظ أحدث 20 محادثة على هذا الجهاز ضمن مساحة التخزين المتاحة. لا تُحفظ صور المرفقات.')}</p>
          <AssistantHistoryNotice status={historyStatus}/>
          {conversations.length ? (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={`group flex items-center rounded-control pe-1 transition ${conversation.id === activeConversationId ? (isDark ? 'bg-white/9' : 'bg-black/[0.04]') : (isDark ? 'hover:bg-white/6' : 'hover:bg-ink/5')}`}>
                  <button type="button" onClick={() => onSelectConversation(conversation)} className={`min-w-0 flex-1 px-3 py-2.5 text-start ${isDark ? 'text-white' : 'text-ink'}`}>
                    <span className="ay-readable-label block text-sm font-semibold">{conversation.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{formatDate(conversation.updatedAt)}</span>
                  </button>
                  <button type="button" disabled={['corrupt', 'unavailable'].includes(historyStatus)} onClick={() => onDeleteConversation(conversation.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-danger/5 hover:text-danger" aria-label={tr(`Supprimer ${conversation.title}`, `حذف ${conversation.title}`)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : historyStatus === 'ready' ? (
            <p className={`rounded-control px-3 py-4 text-center text-xs leading-5 ${isDark ? 'bg-white/5 text-muted' : 'bg-surface text-muted'}`}>{tr('Votre première conversation apparaîtra ici.', 'ستظهر محادثتك الأولى هنا.')}</p>
          ) : null}

          <button type="button" onClick={onOpenOrders} className={mainItem}>{tr('Mes commandes', 'طلباتي')}</button>
          <button type="button" onClick={onOpenLens} className={mainItem}>AYROVIX</button>

          <p className={sectionLabel}>{tr('Paramètres', 'الإعدادات')}</p>
          <button type="button" onClick={onOpenAccount} className={mainItem}>{isAuthenticated ? tr('Mon compte', 'حسابي') : tr('Se connecter', 'تسجيل الدخول')}</button>
          <button type="button" onClick={onToggleDark} role="switch" aria-checked={isDark} className={`${mainItem} justify-between`}>
            <span className="flex items-center gap-3">{tr('Mode sombre', 'الوضع الداكن')}</span>
            <span className={`relative h-[26px] w-11 shrink-0 rounded-full transition ${isDark ? 'bg-ink' : 'bg-line'}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${isDark ? (direction === 'rtl' ? 'right-5' : 'left-5') : (direction === 'rtl' ? 'right-0.5' : 'left-0.5')}`} />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
