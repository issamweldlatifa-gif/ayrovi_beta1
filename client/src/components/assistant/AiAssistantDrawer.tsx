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
import { analyzeUrl, markChosen } from '../../ayrovix/services/lensApi';
import type { AyrovixCandidate, AyrovixOrderPayload, AyrovixProduct } from '../../ayrovix/types';
import type { AyrovixOrderSelection } from '../../ayrovix/components/ProductResult';
import { streamAssistantChat } from './assistantApi';
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
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const createConversationId = () => `conversation_${Date.now()}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

const toStoreKey = (source: string): AyrovixOrderPayload['store'] => {
  const value = source.toLowerCase();
  if (value.includes('shein')) return 'shein';
  if (value.includes('amazon')) return 'amazon';
  if (value.includes('temu')) return 'temu';
  if (value.includes('aliexpress')) return 'aliexpress';
  return 'generic';
};

const candidateToProduct = (candidate: AyrovixCandidate): AyrovixProduct => ({
  title: candidate.title,
  brand: candidate.brand,
  model: candidate.model,
  description: '',
  image: candidate.image,
  images: candidate.images?.length ? candidate.images : candidate.image ? [candidate.image] : [],
  source: candidate.source,
  sourceUrl: candidate.sourceUrl,
  price: candidate.price,
  currency: candidate.currency,
  priceTnd: candidate.priceTnd,
  priceToken: candidate.priceToken || null,
  priceVerified: candidate.priceVerificationStatus === 'VERIFIED',
  priceVerificationStatus: candidate.priceVerificationStatus || 'PENDING_MANUAL',
  exchangeRate: null,
  colors: candidate.colors,
  sizes: candidate.sizes,
  availability: candidate.kind === 'catalog' ? 'in_stock' : 'unknown',
});

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({
  isOpen,
  historyScope,
  customerCsrfToken = '',
  isAuthenticated = false,
  onClose,
  onOpenLens,
  onOpenOrders,
  onOpenAccount,
  onOrder,
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
  const [conversationId, setConversationId] = useState(createConversationId);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ messageId: string; product: AyrovixProduct; priceVerified: boolean } | null>(null);
  const [productBusyId, setProductBusyId] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);

  const generationAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyReadyRef = useRef(false);
  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const frame = viewportFrameRef.current;
    if (!frame) return;
    const viewport = window.visualViewport;
    let animationFrame = 0;

    const fitVisibleViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
        const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
        const left = Math.max(0, Math.round(viewport?.offsetLeft || 0));
        const width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
        frame.style.setProperty('--assistant-viewport-height', `${height}px`);
        frame.style.setProperty('--assistant-viewport-top', `${top}px`);
        frame.style.setProperty('--assistant-viewport-left', `${left}px`);
        frame.style.setProperty('--assistant-viewport-width', `${width}px`);
      });
    };

    fitVisibleViewport();
    viewport?.addEventListener('resize', fitVisibleViewport);
    viewport?.addEventListener('scroll', fitVisibleViewport);
    window.addEventListener('resize', fitVisibleViewport);
    window.addEventListener('orientationchange', fitVisibleViewport);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      viewport?.removeEventListener('resize', fitVisibleViewport);
      viewport?.removeEventListener('scroll', fitVisibleViewport);
      window.removeEventListener('resize', fitVisibleViewport);
      window.removeEventListener('orientationchange', fitVisibleViewport);
    };
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
    if (!isOpen || isGenerating || !historyReadyRef.current || !messages.length) return;
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
  }, [messages, conversationId, historyScope, isOpen, isGenerating]);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  };

  const stopGeneration = () => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setMotionState('idle');
  };

  const startAssistantReply = async (sourceMessages: AssistantMessage[], responseId: string) => {
    stopGeneration();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setIsGenerating(true);
    setMotionState('thinking');
    try {
      await streamAssistantChat({
        conversationId,
        messages: sourceMessages,
        csrfToken: customerCsrfToken,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'state') setMotionState(event.state);
          if (event.type === 'delta') {
            setMessages((current) => current.map((message) => message.id === responseId ? { ...message, text: message.text + event.text } : message));
          }
          if (event.type === 'tool') {
            setMessages((current) => current.map((message) => {
              if (message.id !== responseId) return message;
              if (event.name === 'calculate_price') return { ...message, priceBreakdown: (event.data.breakdown || event.data) as any };
              if (event.name === 'get_order_status') {
                const orderStatuses = Array.isArray(event.data.orders) ? event.data.orders : event.data.order ? [event.data.order] : [];
                return { ...message, orderStatuses: orderStatuses as any };
              }
              if (event.name === 'search_products') return { ...message, products: (event.data.products || []) as AyrovixCandidate[] };
              if (event.name === 'escalate_to_human') return { ...message, supportTicket: (event.data.ticket || event.data) as any };
              return message;
            }));
          }
        },
      });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setMessages((current) => current.map((message) => message.id === responseId
          ? { ...message, text: message.text || error?.message || 'Je rencontre un problème de connexion. Réessayez dans un instant.' }
          : message));
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        setIsGenerating(false);
        setMotionState('idle');
      }
    }
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
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setMotionState('idle');
    setIsRecording(false);
    setIsMenuOpen(false);
    setIsAttachmentSheetOpen(false);
    setFeedbackMessage(null);
  }, [isOpen]);

  useEffect(() => () => {
    generationAbortRef.current?.abort();
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
    const userMessage: AssistantMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      text: displayText,
      fromVoice,
      attachments: sentAttachments,
    };
    const responseId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sourceMessages = [...messages, userMessage];
    setMessages([...sourceMessages, { id: responseId, role: 'assistant', text: '' }]);
    setInput('');
    setAttachments([]);
    void startAssistantReply(sourceMessages, responseId);
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
    setSelectedProduct(null);
    setIsMenuOpen(false);
    showToast('Nouvelle conversation');
  };

  const selectConversation = (conversation: AssistantConversation) => {
    stopGeneration();
    setConversationId(conversation.id);
    setMessages(conversation.messages);
    setFeedback({});
    setFeedbackComments({});
    setSelectedProduct(null);
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
    if (messageIndex < 0) return;
    const sourceMessages = messages.slice(0, messageIndex);
    const responseId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setMessages([...sourceMessages, { id: responseId, role: 'assistant', text: '' }]);
    void startAssistantReply(sourceMessages, responseId);
  };

  const handleSelectProduct = async (messageId: string, candidate: AyrovixCandidate) => {
    if (productBusyId) return;
    setProductBusyId(candidate.id);
    try {
      let product = candidateToProduct(candidate);
      if (candidate.kind === 'external' && candidate.sourceUrl) {
        const result = await analyzeUrl(candidate.sourceUrl, 'url', undefined, false);
        if (result.eventId) void markChosen(result.eventId);
        product = {
          ...result.product,
          title: candidate.title || result.product.title,
          image: result.product.image || candidate.image,
          images: result.product.images.length ? result.product.images : (candidate.images || []),
          source: candidate.source || result.product.source,
          sourceUrl: candidate.sourceUrl,
          price: candidate.price ?? result.product.price,
          currency: candidate.currency ?? result.product.currency,
          priceTnd: candidate.priceTnd ?? result.product.priceTnd,
          priceToken: candidate.priceToken || result.product.priceToken,
          colors: result.product.colors.length ? result.product.colors : candidate.colors,
          sizes: result.product.sizes.length ? result.product.sizes : candidate.sizes,
        };
      }
      setSelectedProduct({ messageId, product, priceVerified: product.priceVerificationStatus === 'VERIFIED' });
    } catch (error: any) {
      setSelectedProduct({ messageId, product: candidateToProduct(candidate), priceVerified: false });
      showToast(error?.message || 'Le lien sera vérifié manuellement par AYROVI.');
    } finally { setProductBusyId(''); }
  };

  const handleProductOrder = async ({ size, color, option, quantity, customerNote, manualUrl }: AyrovixOrderSelection) => {
    const product = selectedProduct?.product;
    if (!product) return;
    const finalPrice = option?.price ?? product.price;
    const finalCurrency = option?.currency ?? product.currency;
    const priceToken = option?.priceToken || product.priceToken || '';
    if (finalPrice == null || !priceToken) {
      showToast('Le devis sécurisé a expiré. Relancez la recherche produit dans le chat.');
      return;
    }
    const variant = [size && `Taille: ${size}`, color && `Couleur: ${color}`].filter(Boolean).join(' · ');
    setIsOrdering(true);
    try {
      await onOrder({
        store: toStoreKey(product.sourceUrl || product.source || manualUrl),
        externalId: option?.id || null,
        url: manualUrl,
        referenceUrl: product.sourceUrl || '',
        title: product.title,
        imageUrl: product.image || '',
        sourcePrice: finalPrice,
        sourceCurrency: finalCurrency || 'EUR',
        priceTND: option?.priceTnd ?? product.priceTnd ?? 0,
        variant: option?.label || variant || undefined,
        requestedSize: size,
        requestedColor: color,
        customerNote,
        priceVerificationStatus: product.priceVerificationStatus || 'PENDING_MANUAL',
        priceToken,
        quantity,
      });
      setSelectedProduct(null);
      showToast('Produit ajouté au panier.');
    } catch (error: any) { showToast(error?.message || "L’article n’a pas pu être ajouté au panier."); }
    finally { setIsOrdering(false); }
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
    <div
      ref={viewportFrameRef}
      className={`fixed z-[80] overflow-hidden overscroll-none [height:var(--assistant-viewport-height,100dvh)] [left:var(--assistant-viewport-left,0px)] [top:var(--assistant-viewport-top,0px)] [width:var(--assistant-viewport-width,100vw)] ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}
      dir="ltr"
      role="dialog"
      aria-modal="true"
      aria-label="Assistant AYROVI"
    >
      <section ref={pageRef} tabIndex={-1} className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden font-[var(--ayrovi-font)] outline-none ${isDark ? 'bg-[#1a1a1f]' : 'bg-[#fbfaf8]'}`}>
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
          selectedProduct={selectedProduct}
          productBusyId={productBusyId}
          isOrdering={isOrdering}
          onPrompt={(prompt) => sendMessage(prompt)}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onFeedback={handleFeedback}
          onOpenComment={setFeedbackMessage}
          onOpenLens={onOpenLens}
          onSelectProduct={(messageId, candidate) => void handleSelectProduct(messageId, candidate)}
          onProductOrder={(selection) => void handleProductOrder(selection)}
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
