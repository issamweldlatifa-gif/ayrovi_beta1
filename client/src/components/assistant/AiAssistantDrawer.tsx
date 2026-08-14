import React, { useEffect, useRef, useState } from 'react';
import { AssistantAttachmentSheet } from './AssistantAttachmentSheet';
import { AssistantComposer } from './AssistantComposer';
import { AssistantFeedbackSheet } from './AssistantFeedbackSheet';
import { AssistantHeader } from './AssistantHeader';
import { AssistantMessages } from './AssistantMessages';
import { AssistantSideMenu } from './AssistantSideMenu';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { getSessionId } from '../../utils/session';
import { AyroviMotionState } from '../AyroviMotion';
import {
  AssistantConversation,
  deleteAssistantConversation,
  listAssistantConversations,
  saveAssistantConversation,
} from './conversationHistory';
import { AssistantAttachment, AssistantMessage, FeedbackValue } from './types';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  historyScope?: string | null;
  customerCsrfToken?: string;
  isAuthenticated?: boolean;
  onClose: () => void;
  onOpenLens: () => void;
  onOpenOrders: () => void;
  onOpenAccount: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const createConversationId = () => `conversation_${Date.now()}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

interface AssistantContext {
  serverTime: string;
  pricing: { rates: Record<string, number>; customsFeePercent: number; shippingFeeTND: number; serviceFeePercent: number; minimumServiceFeeTND: number; expressFeeTND: number };
  facts: Record<string, any>;
  arrivals: Array<{ name: string; type: string; expectedArrivalAt: string; description: string }>;
  promotions: Array<{ name: string; description: string; promo_code?: string; ends_at: string }>;
  brands: Array<{ name: string }>;
  knowledge: Array<{ question: string; answer: string; keywords: string[] }>;
}

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));
const createReply = (message: string, context: AssistantContext | null) => {
  const text = message.toLocaleLowerCase('fr');
  if (!context && includesAny(text, ['taux', 'change', 'euro', 'dollar', 'frais', 'service', 'douane', 'express', 'livraison', 'délai', 'paiement', 'arrivage', 'promotion', 'marque'])) {
    return 'Je ne peux pas vérifier les informations commerciales AYROVI pour le moment. Merci de réessayer dans quelques instants afin que je vous communique uniquement les données publiées et à jour.';
  }
  if (context) {
    if (includesAny(text, ['taux', 'change', 'euro', 'eur', 'dollar', 'usd', 'livre', 'gbp', 'yen', 'jpy'])) {
      return 'Les taux AYROVI applicables sont vérifiés au moment du calcul de votre achat. Ajoutez le produit avec Lens : le total en dinars, frais inclus, sera affiché avant toute confirmation.';
    }
    if (includesAny(text, ['frais', 'service', 'douane', 'shipping']) || (text.includes('express') && includesAny(text, ['coût', 'cout', 'tarif', 'prix']))) {
      const pricing = context.pricing;
      return `Configuration publiée : douane ${pricing.customsFeePercent} %, livraison ${pricing.shippingFeeTND} TND, service ${pricing.serviceFeePercent} % avec un minimum de ${pricing.minimumServiceFeeTND} TND, et option Express ${pricing.expressFeeTND} TND lorsqu’elle s’applique.`;
    }
    if (includesAny(text, ['paiement', 'd17', 'flouci', 'cash', 'cod'])) {
      const names: Record<string, string> = { COD: 'paiement à la livraison', CARD: 'carte bancaire', BANK_TRANSFER: 'virement bancaire', POSTE: 'mandat postal', D17: 'D17', FLOUCI: 'Flouci' };
      const methods = Array.isArray(context.facts.payment_methods) ? context.facts.payment_methods.map((method: string) => names[method] || method) : [];
      return methods.length ? `Moyens de paiement publiés : ${methods.join(', ')}.` : 'Les moyens de paiement ne sont pas renseignés actuellement.';
    }
    if (includesAny(text, ['livraison', 'délai', 'gouvernorat'])) {
      const governorates = Array.isArray(context.facts.governorates) ? context.facts.governorates.length : 0;
      return `Le délai indicatif publié est de ${context.facts.delivery_delay || 'non renseigné'}.${governorates ? ` AYROVI dessert ${governorates} gouvernorats.` : ''}`;
    }
    if (includesAny(text, ['arrivage', 'arrivée', 'arrive', 'express'])) {
      const future = context.arrivals.filter((arrival) => new Date(arrival.expectedArrivalAt).getTime() > new Date(context.serverTime).getTime()).sort((a, b) => a.expectedArrivalAt.localeCompare(b.expectedArrivalAt));
      if (!future.length) return 'Aucun prochain arrivage n’est publié actuellement.';
      return future.slice(0, 3).map((arrival) => `${arrival.name} (${arrival.type === 'EXPRESS' ? 'Express' : 'Standard'}) : ${new Intl.DateTimeFormat('fr-TN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(arrival.expectedArrivalAt))}.`).join(' ');
    }
    if (includesAny(text, ['promotion', 'promo', 'réduction', 'code'])) {
      if (!context.promotions.length) return 'Aucune promotion active n’est publiée actuellement.';
      return context.promotions.slice(0, 3).map((promotion) => `${promotion.name}${promotion.promo_code ? ` — code ${promotion.promo_code}` : ''} : ${promotion.description}`).join(' ');
    }
    if (includesAny(text, ['marque', 'brand'])) {
      return context.brands.length ? `Marques partenaires publiées : ${context.brands.map((brand) => brand.name).join(', ')}.` : 'Aucune marque partenaire n’est publiée actuellement.';
    }
    const matchingKnowledge = context.knowledge.find((item) => item.keywords.some((keyword) => text.includes(String(keyword).toLocaleLowerCase('fr'))));
    if (matchingKnowledge) return matchingKnowledge.answer;
  }
  if (includesAny(text, ['shein', 'amazon', 'temu', 'aliexpress', 'commander', 'capture', 'image', 'photo', 'calcul', 'total'])) {
    return 'Pour préparer un achat, ouvrez Lens depuis la barre inférieure, ajoutez une capture d’écran ou collez le lien du produit. Le total en Dinars Tunisiens est ensuite calculé avant confirmation.';
  }
  if (includesAny(text, ['suivi', 'référence', 'statut'])) {
    const contact = context?.facts.company_phone || context?.facts.company_email;
    return `Pour protéger vos données, le suivi d’une commande nécessite une vérification par l’équipe AYROVI.${contact ? ` Contact publié : ${contact}.` : ''}`;
  }
  return 'Je peux vous renseigner sur les frais, arrivages, promotions, marques, livraisons et paiements publiés par AYROVI, ou vous guider pour utiliser Lens.';
};

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  historyScope,
  customerCsrfToken = '',
  isAuthenticated = false,
  onClose,
  onOpenLens,
  onOpenOrders,
  onOpenAccount,
}) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [motionState, setMotionState] = useState<AyroviMotionState>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue | undefined>>({});
  const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<AssistantMessage | null>(null);
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [commercialContext, setCommercialContext] = useState<AssistantContext | null>(null);
  const [conversationId, setConversationId] = useState(createConversationId);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);

  const generationTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyReadyRef = useRef(false);
  const pageRef = useRef<HTMLElement>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/public/assistant-context')
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => { if (!cancelled && payload.success && payload.data) setCommercialContext(payload.data); })
      .catch(() => { if (!cancelled) setCommercialContext(null); });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    historyReadyRef.current = false;
    const stored = listAssistantConversations(historyScope);
    setConversations(stored);
    if (stored[0]) {
      setConversationId(stored[0].id);
      setMessages(stored[0].messages);
    } else {
      setConversationId(createConversationId());
      setMessages([]);
    }
    setFeedback({});
    setFeedbackComments({});
    const readyTimer = window.setTimeout(() => { historyReadyRef.current = true; }, 0);
    return () => window.clearTimeout(readyTimer);
  }, [isOpen, historyScope]);

  useEffect(() => {
    if (!isOpen || !historyReadyRef.current || !messages.length) return;
    const existing = conversations.find((item) => item.id === conversationId);
    const firstUserMessage = messages.find((message) => message.role === 'user')?.text || 'Nouvelle conversation';
    const now = new Date().toISOString();
    const next = saveAssistantConversation(historyScope, {
      id: conversationId,
      title: existing?.title || firstUserMessage.slice(0, 80),
      messages,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setConversations(next);
  }, [messages, conversationId, historyScope, isOpen]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  };

  const stopGeneration = () => {
    generationTimersRef.current.forEach(clearTimeout);
    generationTimersRef.current = [];
    setIsGenerating(false);
    setMotionState('idle');
  };

  const scheduleReply = (sourceText: string) => {
    stopGeneration();
    setIsGenerating(true);
    setMotionState('thinking');
    generationTimersRef.current = [
      setTimeout(() => setMotionState('analyzing'), 400),
      setTimeout(() => setMotionState('reasoning'), 800),
      setTimeout(() => setMotionState('creating'), 1200),
      setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            text: createReply(sourceText, commercialContext),
          },
        ]);
        setIsGenerating(false);
        setMotionState('idle');
        generationTimersRef.current = [];
      }, 1600),
    ];
  };

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => pageRef.current?.focus({ preventScroll: true }));
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (feedbackMessage) setFeedbackMessage(null);
        else if (isAttachmentSheetOpen) setIsAttachmentSheetOpen(false);
        else if (isMenuOpen) setIsMenuOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, feedbackMessage, isAttachmentSheetOpen, isMenuOpen, onClose]);

  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    } else if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    return () => { if (recordTimerRef.current) clearInterval(recordTimerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    if (isOpen) return;
    generationTimersRef.current.forEach(clearTimeout);
    generationTimersRef.current = [];
    setIsGenerating(false);
    setMotionState('idle');
    setIsRecording(false);
    setIsMenuOpen(false);
    setIsAttachmentSheetOpen(false);
    setFeedbackMessage(null);
  }, [isOpen]);

  useEffect(() => () => {
    generationTimersRef.current.forEach(clearTimeout);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }, []);

  const handleCloseAssistant = () => {
    stopGeneration();
    setIsRecording(false);
    setRecordSeconds(0);
    setIsMenuOpen(false);
    setIsAttachmentSheetOpen(false);
    setFeedbackMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  const sendMessage = (customText?: string, fromVoice = false) => {
    const text = (customText ?? input).trim();
    if ((!text && attachments.length === 0) || isGenerating) return;
    const sentAttachments = attachments.map((attachment) => ({ ...attachment }));
    const displayText = text || (sentAttachments.length > 1 ? 'Pièces jointes' : 'Pièce jointe');
    setMessages((current) => [
      ...current,
      {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        text: displayText,
        fromVoice,
        attachments: sentAttachments,
      },
    ]);
    setInput('');
    setAttachments([]);
    scheduleReply(displayText);
  };

  const finishRecording = () => {
    const duration = recordSeconds;
    setIsRecording(false);
    setRecordSeconds(0);
    if (duration < 1) {
      showToast('Enregistrement trop court');
      return;
    }
    sendMessage(`Demande vocale enregistrée (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})`, true);
  };

  const resetConversation = () => {
    stopGeneration();
    setConversationId(createConversationId());
    setMessages([]);
    setInput('');
    setAttachments([]);
    setFeedback({});
    setFeedbackComments({});
    setIsMenuOpen(false);
    showToast('Nouvelle conversation');
  };

  const selectConversation = (conversation: AssistantConversation) => {
    stopGeneration();
    setConversationId(conversation.id);
    setMessages(conversation.messages);
    setFeedback({});
    setFeedbackComments({});
    setIsMenuOpen(false);
  };

  const removeConversation = (id: string) => {
    const next = deleteAssistantConversation(historyScope, id);
    setConversations(next);
    if (id === conversationId) {
      setConversationId(createConversationId());
      setMessages([]);
      setFeedback({});
      setFeedbackComments({});
    }
  };

  const handleFilePicked = (file: File, kind: 'image' | 'file') => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      showToast(`Maximum ${MAX_ATTACHMENTS} pièces jointes`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('Fichier trop volumineux (max 10 Mo)');
      return;
    }
    if (kind === 'image' && !file.type.startsWith('image/')) {
      showToast('Merci de choisir une image valide');
      return;
    }
    const addFile = (preview?: string) => {
      setAttachments((current) => [
        ...current,
        { id: `file_${Date.now()}_${Math.random()}`, name: file.name, type: file.type, preview },
      ]);
      setIsAttachmentSheetOpen(false);
    };
    if (kind === 'image') {
      const reader = new FileReader();
      reader.onload = () => addFile(typeof reader.result === 'string' ? reader.result : undefined);
      reader.readAsDataURL(file);
    } else addFile();
  };

  const handleCopy = async (message: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      showToast('Réponse copiée');
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => {
        setCopiedId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } catch {
      showToast('Copie indisponible dans ce navigateur');
    }
  };

  const handleRegenerate = (messageId: string) => {
    if (isGenerating) return;
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    const source = [...messages.slice(0, messageIndex)].reverse().find((message) => message.role === 'user');
    setMessages((current) => current.filter((message) => message.id !== messageId));
    scheduleReply(source?.text || 'Aide AYROVI');
  };

  const persistFeedback = async (message: AssistantMessage, rating: FeedbackValue, comment: string) => {
    const response = await fetch('/api/public/assistant-feedback', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getSessionId(),
        ...(customerCsrfToken ? { 'x-csrf-token': customerCsrfToken } : {}),
      },
      body: JSON.stringify({
        conversationId,
        messageId: message.id,
        rating,
        comment,
        responseExcerpt: message.text,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || 'Avis non envoyé');
  };

  const handleFeedback = (message: AssistantMessage, value: FeedbackValue) => {
    const previous = feedback[message.id];
    setFeedback((current) => ({ ...current, [message.id]: value }));
    void persistFeedback(message, value, feedbackComments[message.id] || '').catch(() => {
      setFeedback((current) => ({ ...current, [message.id]: previous }));
      showToast('Impossible d’envoyer votre avis');
    });
  };

  const saveFeedbackComment = async (rating: FeedbackValue, comment: string) => {
    if (!feedbackMessage) return;
    setIsFeedbackSaving(true);
    try {
      await persistFeedback(feedbackMessage, rating, comment);
      setFeedback((current) => ({ ...current, [feedbackMessage.id]: rating }));
      setFeedbackComments((current) => ({ ...current, [feedbackMessage.id]: comment }));
      setFeedbackMessage(null);
      showToast('Merci pour votre avis');
    } catch {
      showToast('Impossible d’envoyer votre avis');
    } finally {
      setIsFeedbackSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-[80] overflow-hidden ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`} dir="ltr" role="dialog" aria-modal="true" aria-label="Assistant AYROVI">
      <section ref={pageRef} tabIndex={-1} className={`relative flex h-screen h-[100dvh] min-h-0 w-full flex-col overflow-hidden font-[var(--ayrovi-font)] outline-none ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}>
        <AssistantHeader
          isDark={isDark}
          motionState={motionState}
          onBack={handleCloseAssistant}
          onOpenHistory={() => setIsMenuOpen(true)}
        />

        <AssistantMessages
          messages={messages}
          isGenerating={isGenerating}
          motionState={motionState}
          isDark={isDark}
          copiedId={copiedId}
          feedback={feedback}
          onPrompt={(prompt) => sendMessage(prompt)}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onFeedback={handleFeedback}
          onOpenComment={setFeedbackMessage}
        />

        <AssistantComposer
          value={input}
          attachments={attachments}
          isDark={isDark}
          isGenerating={isGenerating}
          isRecording={isRecording}
          recordSeconds={recordSeconds}
          onChange={setInput}
          onOpenAttachments={() => setIsAttachmentSheetOpen(true)}
          onRemoveAttachment={(id) => setAttachments((current) => current.filter((attachment) => attachment.id !== id))}
          onStartRecording={() => setIsRecording(true)}
          onFinishRecording={finishRecording}
          onCancelRecording={() => { setIsRecording(false); setRecordSeconds(0); }}
          onSend={() => sendMessage()}
          onStop={stopGeneration}
        />

        <AssistantSideMenu
          isOpen={isMenuOpen}
          isDark={isDark}
          conversations={conversations}
          activeConversationId={conversationId}
          isAuthenticated={isAuthenticated}
          onClose={() => setIsMenuOpen(false)}
          onNewConversation={resetConversation}
          onSelectConversation={selectConversation}
          onDeleteConversation={removeConversation}
          onOpenOrders={onOpenOrders}
          onOpenLens={onOpenLens}
          onOpenAccount={onOpenAccount}
          onHelp={() => { setIsMenuOpen(false); sendMessage('Comment utiliser l’assistant AYROVI et Lens ?'); }}
          onToggleDark={() => setIsDark((dark) => !dark)}
        />

        <AssistantAttachmentSheet
          isOpen={isAttachmentSheetOpen}
          isDark={isDark}
          webSearchEnabled={webSearchEnabled}
          onClose={() => setIsAttachmentSheetOpen(false)}
          onPickFile={handleFilePicked}
          onToggleWebSearch={() => setWebSearchEnabled((enabled) => !enabled)}
          onConnectors={() => showToast('Les connecteurs seront bientôt disponibles')}
        />

        <AssistantFeedbackSheet
          isOpen={Boolean(feedbackMessage)}
          isDark={isDark}
          initialRating={feedbackMessage ? feedback[feedbackMessage.id] : undefined}
          initialComment={feedbackMessage ? feedbackComments[feedbackMessage.id] : ''}
          isSaving={isFeedbackSaving}
          onClose={() => setFeedbackMessage(null)}
          onSave={saveFeedbackComment}
        />

        <div className={`pointer-events-none absolute bottom-24 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs shadow-lg transition ${toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'} ${isDark ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white'}`} role="status">
          {toast}
        </div>
      </section>
    </div>
  );
};
