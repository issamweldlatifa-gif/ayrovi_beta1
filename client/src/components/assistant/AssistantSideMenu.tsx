import React, { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Box,
  ChevronDown,
  Clock3,
  Eye,
  Handshake,
  History,
  Hourglass,
  MessageCircle,
  Moon,
  PackageCheck,
  PenSquare,
  ShoppingBag,
  Truck,
  User,
} from '../QatafoIcons';

interface AssistantSideMenuProps {
  isOpen: boolean;
  isDark: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onToggleDark: () => void;
  onNotice: (message: string) => void;
}

interface AccordionProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isDark: boolean;
  badge?: number;
}

const Accordion: React.FC<AccordionProps> = ({ id, label, icon, children, isDark, badge }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-3 text-sm transition ${isDark ? 'text-zinc-100 hover:bg-white/6' : 'text-zinc-900 hover:bg-black/[0.045]'}`}
        aria-controls={id}
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-3">
          <span className="text-zinc-400">{icon}</span>
          {label}
          {badge ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span> : null}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
};

export const AssistantSideMenu: React.FC<AssistantSideMenuProps> = ({
  isOpen,
  isDark,
  onClose,
  onNewConversation,
  onToggleDark,
  onNotice,
}) => {
  if (!isOpen) return null;

  const subItem = `flex w-full items-center gap-3 rounded-xl py-2.5 pl-10 pr-2 text-left text-[13px] transition ${
    isDark ? 'text-zinc-400 hover:bg-white/6' : 'text-zinc-600 hover:bg-black/[0.045]'
  }`;
  const sectionLabel = 'px-2.5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500';

  return (
    <>
      <button type="button" onClick={onClose} className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[2px]" aria-label="Fermer le menu" />
      <aside className={`assistant-side-menu absolute inset-y-0 left-0 z-40 flex w-[90%] max-w-[430px] flex-col p-[18px] shadow-[8px_0_24px_rgba(20,20,30,0.16)] ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}>
        <button type="button" onClick={onClose} className={`mb-5 flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${isDark ? 'bg-[#26262e] text-zinc-300' : 'bg-[#f0f0ed] text-zinc-600'}`} aria-label="Retour">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <div className={`mb-2 flex items-center gap-3 border-b px-2.5 pb-5 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <span className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#26262e] text-zinc-300' : 'bg-[#f0f0ed] text-zinc-600'}`}>
              <User className="h-5 w-5" />
            </span>
            <span>
              <strong className={`block text-base ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>Bonjour</strong>
              <small className="text-xs text-zinc-500">Ravi de vous revoir sur ayrovi</small>
            </span>
          </div>

          <p className={sectionLabel}>Assistant</p>
          <Accordion id="assistant-conversations" label="Mes conversations" icon={<MessageCircle className="h-4 w-4" />} isDark={isDark}>
            <button type="button" className={subItem} onClick={onNewConversation}><PenSquare className="h-4 w-4" />Nouvelle conversation</button>
            <button type="button" className={subItem} onClick={() => onNotice('Aucune conversation récente')}><Clock3 className="h-4 w-4" />Conversations récentes</button>
          </Accordion>

          <p className={sectionLabel}>Achats</p>
          <Accordion id="assistant-products" label="Mes produits" icon={<ShoppingBag className="h-4 w-4" />} isDark={isDark}>
            <button type="button" className={subItem} onClick={() => onNotice('Vos produits consultés apparaîtront ici')}><Eye className="h-4 w-4" />Produits consultés</button>
            <button type="button" className={subItem} onClick={() => onNotice('Aucun produit enregistré')}><Bookmark className="h-4 w-4" />Produits enregistrés</button>
          </Accordion>
          <Accordion id="assistant-orders" label="Mes commandes" icon={<Box className="h-4 w-4" />} isDark={isDark}>
            <button type="button" className={subItem} onClick={() => onNotice('Aucune commande en cours')}><PackageCheck className="h-4 w-4" />Commandes en cours</button>
            <button type="button" className={subItem} onClick={() => onNotice('Votre historique est vide')}><History className="h-4 w-4" />Historique des commandes</button>
          </Accordion>
          <Accordion id="assistant-requests" label="Mes demandes d’achat" icon={<Handshake className="h-4 w-4" />} isDark={isDark}>
            <button type="button" className={subItem} onClick={() => onNotice('Aucune demande en cours')}><Hourglass className="h-4 w-4" />Demandes en cours</button>
            <button type="button" className={subItem} onClick={() => onNotice('Votre historique est vide')}><History className="h-4 w-4" />Historique</button>
          </Accordion>

          <p className={sectionLabel}>Suivi</p>
          <button type="button" onClick={() => onNotice('Saisissez votre référence dans le chat')} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-sm transition ${isDark ? 'text-zinc-100 hover:bg-white/6' : 'text-zinc-900 hover:bg-black/[0.045]'}`}>
            <Truck className="h-4 w-4 text-zinc-400" />Suivre une commande
          </button>

          <div className={`mx-2.5 my-2 h-px ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
          <Accordion id="assistant-updates" label="Mises à jour" icon={<Bell className="h-4 w-4" />} isDark={isDark} badge={3}>
            <button type="button" className={subItem} onClick={() => onNotice('Aucune nouvelle commande')}><Box className="h-4 w-4" />Commandes</button>
            <button type="button" className={subItem} onClick={() => onNotice('Aucune nouvelle expédition')}><Truck className="h-4 w-4" />Expéditions</button>
          </Accordion>

          <p className={sectionLabel}>Paramètres</p>
          <button type="button" onClick={onToggleDark} className={`flex w-full items-center justify-between rounded-xl px-2.5 py-3 text-sm transition ${isDark ? 'text-zinc-100 hover:bg-white/6' : 'text-zinc-900 hover:bg-black/[0.045]'}`}>
            <span className="flex items-center gap-3"><Moon className="h-4 w-4 text-zinc-400" />Mode sombre</span>
            <span className={`relative h-[26px] w-11 rounded-full transition ${isDark ? 'bg-brand' : 'bg-zinc-300'}`}>
              <span className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition ${isDark ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
