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

const conversationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short' }).format(date);
};

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
  if (!isOpen) return null;

  const mainItem = `flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-sm font-semibold transition ${
    isDark ? 'text-zinc-100 hover:bg-white/7' : 'text-zinc-900 hover:bg-black/[0.045]'
  }`;
  const sectionLabel = 'px-3 pb-2 pt-5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-zinc-500';

  return (
    <>
      <button type="button" onClick={onClose} className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[2px]" aria-label="Fermer l’historique" />
      <aside className={`assistant-side-menu absolute inset-y-0 right-0 z-40 flex w-[91%] max-w-[430px] flex-col px-[18px] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-[-8px_0_24px_rgba(20,20,30,0.16)] ${isDark ? 'bg-ink' : 'bg-surface'}`} role="dialog" aria-modal="true" aria-label="Historique et menu AYROVI">
        <div className="flex items-center gap-3 pb-3">
          <button type="button" onClick={onClose} className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${isDark ? 'bg-ink text-zinc-300' : 'bg-surface text-zinc-700'}`} aria-label="Retour au chat">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div>
            <strong className={`block text-base ${isDark ? 'text-zinc-50' : 'text-zinc-950'}`}>Historique</strong>
            <span className="text-[11px] text-zinc-500">Vos conversations sur cet appareil</span>
          </div>
        </div>

        <button type="button" onClick={onNewConversation} className={`mt-1 flex w-full items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-sm font-bold transition active:scale-[0.99] ${isDark ? 'bg-zinc-100 text-zinc-950 hover:bg-white' : 'bg-ink text-white hover:bg-black'}`}>
          <PenSquare className="h-4 w-4" /> Nouvelle conversation
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <p className={sectionLabel}>Conversations récentes</p>
          {conversations.length ? (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <div key={conversation.id} className={`group flex items-center rounded-[14px] pr-1 transition ${conversation.id === activeConversationId ? (isDark ? 'bg-white/9' : 'bg-[#eceafb]') : (isDark ? 'hover:bg-white/6' : 'hover:bg-black/[0.04]')}`}>
                  <button type="button" onClick={() => onSelectConversation(conversation)} className={`min-w-0 flex-1 px-3 py-2.5 text-left ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                    <span className="block truncate text-[13px] font-semibold">{conversation.title}</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">{conversationDate(conversation.updatedAt)}</span>
                  </button>
                  <button type="button" onClick={() => onDeleteConversation(conversation.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-50 hover:text-red-600" aria-label={`Supprimer ${conversation.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={`rounded-[14px] px-3 py-4 text-center text-xs leading-5 ${isDark ? 'bg-white/5 text-zinc-500' : 'bg-[#f3f2ef] text-zinc-500'}`}>Votre première conversation apparaîtra ici.</p>
          )}

          <p className={sectionLabel}>AYROVI</p>
          <button type="button" onClick={onOpenOrders} className={mainItem}><Box className="h-[17px] w-[17px] text-zinc-400" />Mes commandes</button>
          <button type="button" onClick={onOpenLens} className={mainItem}><LensBox className="h-[17px] w-[17px] text-zinc-400" />Ouvrir AYROVIX Lens</button>
          <button type="button" onClick={onOpenAccount} className={mainItem}><User className="h-[17px] w-[17px] text-zinc-400" />{isAuthenticated ? 'Mon compte' : 'Se connecter'}</button>
          <button type="button" onClick={onHelp} className={mainItem}><MessageCircle className="h-[17px] w-[17px] text-zinc-400" />Aide AYROVI</button>

          <p className={sectionLabel}>Apparence</p>
          <button type="button" onClick={onToggleDark} className={`${mainItem} justify-between`}>
            <span className="flex items-center gap-3"><Moon className="h-[17px] w-[17px] text-zinc-400" />Mode sombre</span>
            <span className={`relative h-[26px] w-11 rounded-full transition ${isDark ? 'bg-brand' : 'bg-zinc-300'}`} aria-hidden="true">
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${isDark ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
