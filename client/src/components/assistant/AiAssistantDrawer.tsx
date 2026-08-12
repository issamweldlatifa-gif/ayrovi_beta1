import React, { useEffect, useRef, useState } from 'react';
import { AssistantAttachmentSheet } from './AssistantAttachmentSheet';
import { AssistantComposer } from './AssistantComposer';
import { AssistantHeader } from './AssistantHeader';
import { AssistantMessages } from './AssistantMessages';
import { AssistantSideMenu } from './AssistantSideMenu';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { AssistantAttachment, AssistantMessage, FeedbackValue } from './types';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

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
      const { rates } = context.pricing;
      return `Taux AYROVI publiés : 1 EUR = ${rates.EUR} TND, 1 USD = ${rates.USD} TND, 1 GBP = ${rates.GBP} TND et 1 JPY = ${rates.JPY} TND. Le total calculé inclut les frais applicables et s’affiche avant confirmation.`;
    }
    if (includesAny(text, ['frais', 'service', 'douane', 'shipping']) || (text.includes('express') && includesAny(text, ['coût', 'cout', 'tarif', 'prix']))) {
      const pricing = context.pricing;
      return `Configuration publiée : douane ${pricing.customsFeePercent} %, livraison ${pricing.shippingFeeTND} TND, service ${pricing.serviceFeePercent} % avec un minimum de ${pricing.minimumServiceFeeTND} TND, et option Express ${pricing.expressFeeTND} TND lorsqu’elle s’applique.`;
    }
    if (includesAny(text, ['paiement', 'd17', 'flouci', 'cash', 'cod'])) {
      const names: Record<string, string> = { COD: 'paiement à la livraison', D17: 'D17', FLOUCI: 'Flouci' };
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
  if (includesAny(text, ['shein', 'amazon', 'temu', 'aliexpress', 'commander', 'capture', 'image', 'photo'])) {
    return 'Pour préparer un achat, ouvrez Lens depuis la barre inférieure, ajoutez une capture d’écran ou collez le lien du produit. Le total en Dinars Tunisiens est ensuite calculé avant confirmation.';
  }
  if (includesAny(text, ['suivi', 'référence', 'statut'])) {
    const contact = context?.facts.company_phone || context?.facts.company_email;
    return `Pour protéger vos données, le suivi d’une commande nécessite une vérification par l’équipe AYROVI.${contact ? ` Contact publié : ${contact}.` : ''}`;
  }
  return 'Je peux vous renseigner sur les taux, frais, arrivages, promotions, marques, livraisons et paiements publiés par AYROVI, ou vous guider pour utiliser Lens.';
};

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue | undefined>>({});
  const [commercialContext, setCommercialContext] = useState<AssistantContext | null>(null);

  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  };

  const stopGeneration = () => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = null;
    setIsGenerating(false);
  };

  const scheduleReply = (sourceText: string) => {
    stopGeneration();
    setIsGenerating(true);
    replyTimerRef.current = setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          text: createReply(sourceText, commercialContext),
        },
      ]);
      setIsGenerating(false);
      replyTimerRef.current = null;
    }, 720);
  };

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => pageRef.current?.focus({ preventScroll: true }));
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isAttachmentSheetOpen) setIsAttachmentSheetOpen(false);
        else if (isMenuOpen) setIsMenuOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isAttachmentSheetOpen, isMenuOpen, onClose]);

  useEffect(() => {
    if (isRecording) {
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    } else if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    if (isOpen) return;
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    replyTimerRef.current = null;
    setIsGenerating(false);
    setIsRecording(false);
    setIsMenuOpen(false);
    setIsAttachmentSheetOpen(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
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
        id: `user_${Date.now()}`,
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
    setMessages([]);
    setInput('');
    setAttachments([]);
    setFeedback({});
    setIsMenuOpen(false);
    showToast('Nouvelle conversation');
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
    } else {
      addFile();
    }
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

  const handleFeedback = (messageId: string, value: FeedbackValue) => {
    setFeedback((current) => ({ ...current, [messageId]: current[messageId] === value ? undefined : value }));
  };

  const handleShare = async () => {
    const shareText = messages.map((message) => `${message.role === 'user' ? 'Moi' : 'AYROVI'} : ${message.text}`).join('\n\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Conversation AYROVI', text: shareText || 'AYROVI' });
      else {
        await navigator.clipboard.writeText(shareText || window.location.href);
        showToast('Discussion copiée');
      }
    } catch {
      // The user may cancel the native share dialog.
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[80] overflow-hidden ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}
      dir="ltr"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant AYROVI"
    >
      <section
        ref={pageRef}
        tabIndex={-1}
        className={`relative flex h-screen h-[100dvh] min-h-0 w-full flex-col overflow-hidden outline-none ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}
      >
        <AssistantHeader
          isDark={isDark}
          onOpenMenu={() => setIsMenuOpen(true)}
          onClose={handleCloseAssistant}
          onShare={handleShare}
          onRename={() => showToast('La discussion a été renommée')}
          onDelete={() => { resetConversation(); showToast('Discussion supprimée'); }}
        />

        <AssistantMessages
          messages={messages}
          isGenerating={isGenerating}
          isDark={isDark}
          copiedId={copiedId}
          feedback={feedback}
          onPrompt={(prompt) => sendMessage(prompt)}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onFeedback={handleFeedback}
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
          onClose={() => setIsMenuOpen(false)}
          onNewConversation={resetConversation}
          onToggleDark={() => setIsDark((dark) => !dark)}
          onNotice={showToast}
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

        <div className={`pointer-events-none absolute bottom-24 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs shadow-lg transition ${toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'} ${isDark ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 text-white'}`} role="status">
          {toast}
        </div>
      </section>
    </div>
  );
};
