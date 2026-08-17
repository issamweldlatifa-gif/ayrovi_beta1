import React from 'react';
import {
  ArrowLeft,
  Box,
  LensBox,
  MessageCircle,
  Moon,
  PenSquare,
  Trash2,
  User,
} from '../QatafoIcons';
import { AssistantConversation } from './conversationHistory';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantSideMenuProps {
  isOpen: boolean;
  isDark: boolean;
  conversations: AssistantConversation[];
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
}

export const AssistantSideMenu: React.FC<AssistantSideMenuProps> = ({
  isOpen,
  isDark,
  conversations,
  activeConversationId,
  isAuthenticated,
  onClose,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onOpenOrders,
  onOpenLens,
  onOpenAccount,
  onHelp,
  onToggleDark,
}) => {
  const { direction, formatDate, tr } = useLocale();
  if (!isOpen) return null;

  const mainItem = `flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-start text-sm font-semibold transition ${
    isDark ? 'text-white hover:bg-white/7' : 'text-ink hover:bg-ink/5'
  }`;
  const sectionLabel = 'px-3 pb-2 pt-5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted';

  return (
    <>
      <button type="button" onClick={onClose} className="absolute inset-0 z-30 bg-ink/40 backdrop-blur-[2px]" aria-label={tr('Fermer l’historique', 'إغلاق السجل')} />
      <aside className={`assistant-side-menu absolute inset-y-0 end-0 z-40 flex w-[91%] max-w-[430px] flex-col px-[18px] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-overlay ${isDark ? 'bg-ink' : 'bg-surface'}`} dir={direction} role="dialog" aria-modal="true" aria-label={tr('Historique et menu AYROVI', 'سجل وقائمة AYROVI')}>
        <div className="flex items-center gap-3 pb-3">
          <button type="button" onClick={onClose} className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${isDark ? 'bg-ink text-white/80' : 'bg-surface text-ink'}`} aria-label={tr('Retour au chat', 'العودة إلى المحادثة')}>
            <ArrowLeft className={`h-[18px] w-[18px] ${direction === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
          <div>
            <strong className={`block text-base ${isDark ? 'text-white' : 'text-ink'}`}>{tr('Historique', 'السجل')}</strong>
            <span className="text-[11px] text-muted">{tr('Vos conversations sur cet appareil', 'محادثاتك على هذا الجهاز')}</span>
          </div>
        </div>

        <button type="button" onClick={onNewConversation} className="ay-btn-primary mt-1 w-full text-sm">
          <PenSquare className="h-4 w-4" /> {tr('Nouvelle conversation', 'محادثة جديدة')}
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <p className={sectionLabel}>{tr('Conversations récentes', 'المحادثات الأخيرة')}</p>
          {conversations.length ? (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={`group flex items-center rounded-[14px] pe-1 transition ${conversation.id === activeConversationId ? (isDark ? 'bg-white/9' : 'bg-brand/10') : (isDark ? 'hover:bg-white/6' : 'hover:bg-ink/5')}`}>
                  <button type="button" onClick={() => onSelectConversation(conversation)} className={`min-w-0 flex-1 px-3 py-2.5 text-start ${isDark ? 'text-white' : 'text-ink'}`}>
                    <span className="block truncate text-[13px] font-semibold">{conversation.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted">{formatDate(conversation.updatedAt)}</span>
                  </button>
                  <button type="button" onClick={() => onDeleteConversation(conversation.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-danger/5 hover:text-danger" aria-label={tr(`Supprimer ${conversation.title}`, `حذف ${conversation.title}`)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={`rounded-[14px] px-3 py-4 text-center text-xs leading-5 ${isDark ? 'bg-white/5 text-muted' : 'bg-surface text-muted'}`}>{tr('Votre première conversation apparaîtra ici.', 'ستظهر محادثتك الأولى هنا.')}</p>
          )}

          <p className={sectionLabel}>AYROVI</p>
          <button type="button" onClick={onOpenOrders} className={mainItem}><Box className="h-[17px] w-[17px] text-muted" />{tr('Mes commandes', 'طلباتي')}</button>
          <button type="button" onClick={onOpenLens} className={mainItem}><LensBox className="h-[17px] w-[17px] text-muted" />{tr('Ouvrir AYROVIX Lens', 'فتح عدسة AYROVIX')}</button>
          <button type="button" onClick={onOpenAccount} className={mainItem}><User className="h-[17px] w-[17px] text-muted" />{isAuthenticated ? tr('Mon compte', 'حسابي') : tr('Se connecter', 'تسجيل الدخول')}</button>
          <button type="button" onClick={onHelp} className={mainItem}><MessageCircle className="h-[17px] w-[17px] text-muted" />{tr('Aide AYROVI', 'مساعدة AYROVI')}</button>

          <p className={sectionLabel}>{tr('Apparence', 'المظهر')}</p>
          <button type="button" onClick={onToggleDark} className={`${mainItem} justify-between`}>
            <span className="flex items-center gap-3"><Moon className="h-[17px] w-[17px] text-muted" />{tr('Mode sombre', 'الوضع الداكن')}</span>
            <span className={`relative h-[26px] w-11 rounded-full transition ${isDark ? 'bg-brand' : 'bg-line'}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${isDark ? (direction === 'rtl' ? 'right-5' : 'left-5') : (direction === 'rtl' ? 'right-0.5' : 'left-0.5')}`} />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
