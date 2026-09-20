import { resolveProductSelection, completeProductOffer, productSelectionLabels } from '../../ayrovix/services/productSelection';
import { useAssistantAttachments } from './media/useAssistantAttachments';
import { VoiceNoteCapture, type VoiceNoteState } from './media/VoiceNoteCapture';
import { imageErrorLabels, voiceNoteErrorLabels } from './media/mediaLabels';
import { AssistantHistoryNotice } from './AssistantHistoryNotice';
import { validProductUrl } from '../../ayrovix/services/resultPolicy';
import type { HistoryStatus } from './conversationHistory';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { copyAssistantText, textActionLabels } from './messageActions';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AssistantAttachmentSheet } from './AssistantAttachmentSheet';
import { AssistantComposer } from './AssistantComposer';
import { AssistantFeedbackSheet } from './AssistantFeedbackSheet';
import { AssistantHeader } from './AssistantHeader';
import { AssistantMessages } from './AssistantMessages';
import { AssistantSideMenu } from './AssistantSideMenu';
import { AssistantVoiceModeScreen } from './AssistantVoiceModeScreen';
import { VoiceChatController } from './voice/VoiceChatController';
import type { VoiceChatState } from './voice/types';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { getSessionId } from '../../utils/session';
import { AyroviMotionState } from '../AyroviMotion';
import { analyzeUrl, markChosen } from '../../ayrovix/services/lensApi';
import type { AyrovixCandidate, AyrovixOrderPayload, AyrovixProduct } from '../../ayrovix/types';
import type { AyrovixOrderSelection } from '../../ayrovix/components/ProductResult';
import { streamAssistantChat, transcribeAssistantAudio } from './assistantApi';
import {
  AssistantConversation,
  deleteAssistantConversation,
  readAssistantHistory,
  saveAssistantConversation,
} from './conversationHistory';
import { AssistantMessage, FeedbackValue } from './types';
import { useNavigationHistory } from '../../navigation/NavigationHistory';
import { useLocale } from '../../i18n/LocaleContext';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  historyScope?: string | null;
  customerCsrfToken?: string;
  isAuthenticated?: boolean;
  customerFirstName?: string;
  onClose: () => void;
  onOpenLens: () => void;
  onOpenOrders: () => void;
  onOpenAccount: () => void;
  onOrder: (payload: AyrovixOrderPayload) => Promise<void>;
}

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
  rating: candidate.rating ?? null,
  ratingCount: candidate.ratingCount ?? null,
  ratingKind: candidate.ratingKind || 'match',
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
  customerFirstName = '',
  onClose,
  onOpenLens,
  onOpenOrders,
  onOpenAccount,
  onOrder,
}) => {
  const { direction, tr } = useLocale();
  const navigation = useNavigationHistory();
  const isMenuOpen = navigation.stack.some((layer) => layer.id === 'assistant:menu');
  const isAttachmentSheetOpen = navigation.stack.some((layer) => layer.id === 'assistant:attachments');
  const feedbackLayer = navigation.stack.find((layer) => layer.id === 'assistant:feedback');
  const productLayer = navigation.stack.find((layer) => layer.id === 'assistant:product');
  const closeAssistantLayer = () => navigation.back();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('ready');
  const [historyRestored, setHistoryRestored] = useState(false);
  const [historySaveAttempt, setHistorySaveAttempt] = useState(0);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [motionState, setMotionState] = useState<AyroviMotionState>('idle');
  const [lensActive, setLensActive] = useState(false);
  const [voiceNoteState, setVoiceNoteState] = useState<VoiceNoteState>('idle');
  const isRecording = voiceNoteState === 'recording';
  const isTranscribing = voiceNoteState === 'stopping' || voiceNoteState === 'transcribing';
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);
  const [assistantReady, setAssistantReady] = useState<boolean | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [toast, setToast] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, FeedbackValue | undefined>>({});
  const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<AssistantMessage | null>(null);
  const [feedbackPending, setFeedbackPending] = useState<Record<string, boolean>>({});
  const [conversationId, setConversationId] = useState(createConversationId);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ messageId: string; product: AyrovixProduct; priceVerified: boolean } | null>(null);
  const [isStoredProduct, setIsStoredProduct] = useState(false);
  const [productBusyId, setProductBusyId] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceChatState>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const isSpeakerMutedRef = useRef(false);
  const voiceModeRef = useRef(false);
  const voiceStateRef = useRef<VoiceChatState>('idle');
  const voiceTurnHandlerRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const openAssistantProduct = (next: { messageId: string; product: AyrovixProduct; priceVerified: boolean }) => {
    if (!isOpenRef.current) return;
    setIsStoredProduct(false);
    setSelectedProduct(next);
    if (!productLayer) navigation.pushLayer({ id: 'assistant:product', payload: { messageId: next.messageId } });
  };

  const generationAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaScope = JSON.stringify([isOpen, historyScope || null, conversationId]);
  const mediaScopeRef = useRef(mediaScope); mediaScopeRef.current = mediaScope;
  const attachmentQueue = useAssistantAttachments(mediaScope, code => showToast(tr(...imageErrorLabels[code])));
  const { attachments, pending: pendingAttachments } = attachmentQueue;
  const voiceNoteRef = useRef<VoiceNoteCapture | null>(null);
  const cancelVoiceNote = () => {
    voiceNoteRef.current?.cancel(false); voiceNoteRef.current = null;
    setVoiceNoteState('idle'); setRecordSeconds(0);
  };
  useLayoutEffect(() => {
    setVoiceNoteState('idle'); setRecordSeconds(0); stopVoiceMode();
    return () => {
      voiceNoteRef.current?.cancel(false); voiceNoteRef.current = null;
      const voice = voiceControllerRef.current; voiceControllerRef.current = null;
      voice?.stop(); voiceModeRef.current = false;
    };
  }, [mediaScope]);

  const historyReadyRef = useRef(false);
  const restoredMessageIdsRef = useRef(new Set<string>());
  const saveOnExitRef = useRef<(updateView?: boolean) => HistoryStatus>(() => 'ready');
  const savedSnapshotRef = useRef<{ id: string; scope: typeof historyScope; messages: AssistantMessage[]; product: typeof selectedProduct; attempt: number } | null>(null);
  const rememberSnapshot = (conversation: AssistantConversation) => {
    savedSnapshotRef.current = { id: conversation.id, scope: historyScope, messages: conversation.messages, product: conversation.selectedProduct || null, attempt: historySaveAttempt };
  };
  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const previousHistoryScope = useRef(historyScope);
  const productRequestRef = useRef<AbortController | null>(null);
  const productContextRef = useRef({ isOpen, conversationId, historyScope, entry: navigation.entry });
  productContextRef.current = { isOpen, conversationId, historyScope, entry: navigation.entry };
  useEffect(() => {
    productRequestRef.current?.abort(); productRequestRef.current = null;
    setProductBusyId('');
    return () => { productRequestRef.current?.abort(); productRequestRef.current = null; };
  }, [isOpen, conversationId, historyScope]);

  useEffect(() => {
    if (!feedbackLayer && !isMenuOpen && !isAttachmentSheetOpen) return;
    // Do not carry a previous screen's transient notice over a newly opened form.
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setToast('');
  }, [feedbackLayer, isMenuOpen, isAttachmentSheetOpen]);

  useBodyScrollLock(isOpen);
  useDialogFocus(pageRef, isOpen);
  const feedbackRequests = useRef(new Set<string>());
  const feedbackContext = useRef({ isOpen, historyScope, conversationId, layer: feedbackLayer, top: navigation.current });
  feedbackContext.current = { isOpen, historyScope, conversationId, layer: feedbackLayer, top: navigation.current };

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch('/api/assistant/status', { credentials: 'same-origin', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload) => setVoiceReady(payload?.data?.voiceReady === true))
      .catch(() => { if (!controller.signal.aborted) setVoiceReady(null); });
    return () => controller.abort();
  }, [isOpen]);

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
    setIsBooting(true);
    historyReadyRef.current = false;
    if (previousHistoryScope.current !== historyScope) {
      previousHistoryScope.current = historyScope;
      stopGeneration(); stopVoiceMode();
      setInput(''); attachmentQueue.clear();
    }
    const result = readAssistantHistory(historyScope);
    const stored = result.conversations;
    setHistoryStatus(result.status);
    setHistoryRestored(Boolean(stored[0]));
    setIsStoredProduct(Boolean(stored[0]?.selectedProduct));
    restoredMessageIdsRef.current = new Set(stored[0]?.messages.map(message => message.id) || []);
    setConversations(stored);
    if (stored[0]) {
      rememberSnapshot(stored[0]);
      setConversationId(stored[0].id);
      setMessages(stored[0].messages);
      setSelectedProduct(stored[0].selectedProduct || null);
    } else {
      setConversationId(createConversationId());
      setMessages([]);
      setSelectedProduct(null);
    }
    setFeedback({});
    setFeedbackComments({});
    const readyTimer = window.setTimeout(() => {
      historyReadyRef.current = true;
      setIsBooting(false);
    }, 0);
    return () => window.clearTimeout(readyTimer);
  }, [isOpen, historyScope]);

  const saveActiveConversation = (updateView = true): HistoryStatus => {
    if (!historyReadyRef.current || !messages.length) return 'ready';
    // Never write a previous account's view under a newly supplied scope.
    if (previousHistoryScope.current !== historyScope) return 'unavailable';
    const saved = savedSnapshotRef.current;
    if (saved?.id === conversationId && saved.scope === historyScope && saved.messages === messages && saved.product === selectedProduct && saved.attempt === historySaveAttempt) return 'ready' as const;
    const existing = conversations.find((item) => item.id === conversationId);
    const firstUserMessage = messages.find((message) => message.role === 'user')?.text || tr('Nouvelle conversation', 'محادثة جديدة');
    const now = new Date().toISOString();
    const next = saveAssistantConversation(historyScope, {
      id: conversationId,
      title: existing?.title || firstUserMessage,
      messages,
      selectedProduct,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    if (updateView) { setConversations(next.conversations); setHistoryStatus(next.status); }
    if (next.status === 'ready') savedSnapshotRef.current = { id: conversationId, scope: historyScope, messages, product: selectedProduct, attempt: historySaveAttempt };
    return next.status;
  };
  saveOnExitRef.current = saveActiveConversation;

  useEffect(() => {
    if (!isOpen || isGenerating) return;
    saveActiveConversation();
  }, [messages, selectedProduct, conversationId, historyScope, isOpen, isGenerating, historySaveAttempt]);

  const voiceControllerRef = useRef<VoiceChatController | null>(null);

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

  const stopVoiceMode = () => {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setVoiceState('idle');
    voiceStateRef.current = 'idle';
    setVolumeLevel(0);
    setLiveTranscript('');
    setIsMuted(false);
    voiceControllerRef.current?.stop();
    voiceControllerRef.current = null;
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    voiceControllerRef.current?.setMuted(next);
  };

  const handleToggleSpeaker = () => {
    const next = !isSpeakerMuted;
    setIsSpeakerMuted(next);
    isSpeakerMutedRef.current = next;
    voiceControllerRef.current?.setSpeakerMuted(next);
  };

  const stopActiveVoiceResponse = () => {
    if (generationAbortRef.current) {
      generationAbortRef.current.abort();
      generationAbortRef.current = null;
      setIsGenerating(false);
      setMotionState('idle');
    }
    voiceControllerRef.current?.interruptOutput();
  };

  const handleToggleVoiceMode = async () => {
    if (voiceModeRef.current) {
      stopVoiceMode();
      return;
    }
    if (voiceNoteRef.current?.busy || attachmentQueue.isPending() || isGenerating) return;

    setVoiceMode(true);
    voiceModeRef.current = true;
    setIsMuted(false);
    setVoiceState('starting');
    voiceStateRef.current = 'starting';

    const controller = new VoiceChatController({
      language: direction === 'rtl' ? 'ar-TN' : 'fr-FR',
      csrfToken: customerCsrfToken,
      onState: (state) => {
        if (voiceControllerRef.current !== controller) return;
        voiceStateRef.current = state;
        setVoiceState(state);
      },
      onLevel: (level) => {
        if (voiceControllerRef.current === controller) setVolumeLevel(level);
      },
      onTranscript: (text) => {
        if (voiceControllerRef.current === controller) setLiveTranscript(text);
      },
      onTurn: (text) => {
        if (voiceControllerRef.current !== controller) return;
        setLiveTranscript('');
        voiceTurnHandlerRef.current(text);
      },
      onError: (message) => {
        if (voiceControllerRef.current === controller) showToast(message);
      },
    });
    voiceControllerRef.current = controller;
    controller.setSpeakerMuted(isSpeakerMutedRef.current);

    const isRtl = direction === 'rtl';
    const greeting = isRtl
      ? (customerFirstName ? `مرحباً ${customerFirstName}، كيف يمكنني مساعدتك اليوم؟` : 'مرحباً بك في AYROVI، كيف يمكنني مساعدتك اليوم؟')
      : (customerFirstName ? `Bonjour ${customerFirstName} ! Comment puis-je vous aider aujourd’hui ?` : 'Bonjour ! Comment puis-je vous aider aujourd’hui ?');

    const connected = await controller.start(greeting);
    if (!connected && voiceControllerRef.current === controller) stopVoiceMode();
  };

  const handleAddVoiceAttachment = async (file: File) => {
    const scope = mediaScopeRef.current;
    if (await attachmentQueue.add(file) && isOpenRef.current && mediaScopeRef.current === scope) showToast(tr('Photo ajoutée pour analyse', 'تمت إضافة الصورة للتحليل'));
  };

  const startAssistantReply = async (sourceMessages: AssistantMessage[], responseId: string) => {
    stopGeneration();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setIsGenerating(true);
    setMotionState('thinking');
    setLensActive(false);
    voiceControllerRef.current?.markThinking();

    let spokenResponse = '';

    try {
      await streamAssistantChat({
        conversationId,
        messages: sourceMessages,
        state: {
          orderStage: selectedProduct && !isStoredProduct ? 'PRODUCT_CONFIGURATION' : 'CONVERSATION',
          webSearchEnabled,
          isAuthenticated,
          activeProduct: selectedProduct && !isStoredProduct ? {
            messageId: selectedProduct.messageId,
            title: selectedProduct.product.title,
            brand: selectedProduct.product.brand,
            model: selectedProduct.product.model,
            source: selectedProduct.product.source,
            sourceUrl: selectedProduct.product.sourceUrl,
            price: selectedProduct.product.price,
            currency: selectedProduct.product.currency,
            priceVerificationStatus: selectedProduct.product.priceVerificationStatus,
            colors: selectedProduct.product.colors,
            sizes: selectedProduct.product.sizes,
          } : null,
        },
        csrfToken: customerCsrfToken,
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted || generationAbortRef.current !== controller) return;
          if (event.type === 'done') {
            setMessages(current => current.map(message => message.id === responseId ? { ...message, incomplete: false } : message));
          }
          if (event.type === 'state') {
            setMotionState(event.state);
          }

          if (event.type === 'delta') {
            spokenResponse += event.text;
            setMessages((current) => current.map((message) => (
              message.id === responseId ? { ...message, text: message.text + event.text } : message
            )));
          }

          if (event.type === 'tool') {
            if (event.name === 'lens_search') setLensActive(true);
            if (event.name === 'lens_search' && event.data.product) {
              const product = event.data.product as AyrovixProduct;
              openAssistantProduct({
                messageId: responseId,
                product,
                priceVerified: product.priceVerificationStatus === 'VERIFIED' || product.priceVerified === true,
              });
            }
            setMessages((current) => current.map((message) => {
              if (message.id !== responseId) return message;
              if (event.name === 'calculate_price') return { ...message, priceBreakdown: (event.data.breakdown || event.data) as any };
              if (event.name === 'get_order_status') {
                const orderStatuses = Array.isArray(event.data.orders) ? event.data.orders : event.data.order ? [event.data.order] : [];
                return { ...message, orderStatuses: orderStatuses as any };
              }
              if (event.name === 'search_products' || event.name === 'lens_search') return {
                ...message,
                products: (event.data.products || []) as AyrovixCandidate[],
                suggestedActions: Array.isArray(event.data.suggestedActions) ? event.data.suggestedActions : undefined,
                lensSummary: event.data.lens ? {
                  confidence: Number(event.data.lens.confidence || 0),
                  verified: Boolean(event.data.lens.verified),
                  warnings: Array.isArray(event.data.lens.warnings) ? event.data.lens.warnings : [],
                } : null,
              };
              if (event.name === 'escalate_to_human') return { ...message, supportTicket: (event.data.ticket || event.data) as any };
              return message;
            }));
          }
        },
      });
    } catch (error: any) {
      if (generationAbortRef.current === controller && !controller.signal.aborted && error?.name !== 'AbortError') {
        const fallback = error?.message || 'Je rencontre un problème de connexion. Réessayez dans un instant.';
        if (!spokenResponse.trim()) spokenResponse = fallback;
        setMessages((current) => current.map((message) => (
          message.id === responseId ? { ...message, text: message.text || fallback } : message
        )));
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        setIsGenerating(false);
        setMotionState('idle');

        if (voiceModeRef.current) {
          const voiceController = voiceControllerRef.current;
          const speech = spokenResponse.trim();
          if (!voiceController) return;
          if (isSpeakerMutedRef.current || !speech) voiceController.resumeListening();
          else void voiceController.speak(speech, direction === 'rtl' ? 'ar-TN' : 'fr-FR');
        }
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (feedbackLayer || productLayer || isAttachmentSheetOpen || isMenuOpen) closeAssistantLayer();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, feedbackLayer, productLayer, isAttachmentSheetOpen, isMenuOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;
    saveActiveConversation();
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setMotionState('idle');
    stopVoiceMode();
    cancelVoiceNote(); attachmentQueue.clear();
    setFeedbackMessage(null);
  }, [isOpen]);

  useEffect(() => () => {
    saveOnExitRef.current(false);
    isOpenRef.current = false;
    feedbackContext.current = { ...feedbackContext.current, isOpen: false };
    generationAbortRef.current?.abort();
    stopVoiceMode();
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const handleCloseAssistant = () => {
    saveActiveConversation();
    stopGeneration();
    stopVoiceMode();
    cancelVoiceNote(); attachmentQueue.clear();
    setFeedbackMessage(null);
    const start = navigation.stack.findIndex((layer) => layer.id === 'app:assistant');
    const pops = start >= 0 ? navigation.stack.length - start : 1;
    if (navigation.entry.depth <= 0 || pops >= navigation.entry.depth) navigation.goHome();
    else window.history.go(-pops);
  };

  if (!isOpen) return null;

  const sendMessage = (customText?: string, fromVoice = false) => {
    const readyAttachments = attachmentQueue.getReady();
    const text = (customText ?? input).trim();
    if (attachmentQueue.isPending()) {
      if (fromVoice && text) {
        setInput(current => [current, text].filter(Boolean).join('\n'));
        stopVoiceMode();
        showToast(tr('Images en préparation. Votre texte vocal est conservé dans le brouillon ; envoyez-le quand les images sont prêtes.', 'الصور قيد التجهيز. حُفظ النص الصوتي في المسودة؛ أرسله عندما تجهز الصور.'));
      }
      return;
    }
    if ((!text && readyAttachments.length === 0) || isGenerating || voiceNoteRef.current?.busy || generationAbortRef.current) return;
    const sentAttachments = readyAttachments.map((attachment) => ({ ...attachment }));
    const displayText = text || (sentAttachments.length > 1 ? tr('Analyse ces images.', 'حلّل هذه الصور.') : tr('Analyse cette image.', 'حلّل هذه الصورة.'));
    const userMessage: AssistantMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      text: displayText,
      fromVoice,
      attachments: sentAttachments,
    };
    const responseId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sourceMessages = [...messages, userMessage];
    setMessages([...sourceMessages, { id: responseId, role: 'assistant', text: '', incomplete: true }]);
    if (!fromVoice) setInput('');
    attachmentQueue.clear();
    void startAssistantReply(sourceMessages, responseId);
  };

  // The controller lives across renders; route completed turns through the
  // latest message state instead of retaining the callback from the opening render.
  voiceTurnHandlerRef.current = (text) => sendMessage(text, true);

  const startRecording = async () => {
    if (isGenerating || generationAbortRef.current || voiceModeRef.current || attachmentQueue.isPending() || voiceNoteRef.current?.busy) return;
    const origin = mediaScopeRef.current;
    voiceNoteRef.current?.cancel(false);
    const current = () => isOpenRef.current && mediaScopeRef.current === origin && voiceNoteRef.current === capture;
    const capture = new VoiceNoteCapture({
      onState: state => { if (current()) setVoiceNoteState(state); },
      onSeconds: seconds => { if (current()) setRecordSeconds(seconds); },
      onError: code => { if (current()) showToast(tr(...voiceNoteErrorLabels[code])); },
      onText: text => { if (current()) voiceTurnHandlerRef.current(text); },
      transcribe: (audio, signal) => transcribeAssistantAudio({ audio, signal, csrfToken: customerCsrfToken }),
    });
    voiceNoteRef.current = capture;
    await capture.start();
  };
  const finishRecording = () => voiceNoteRef.current?.finish();
  const cancelRecording = cancelVoiceNote;

  const resetConversation = () => {
    saveActiveConversation();
    cancelVoiceNote(); stopVoiceMode();
    stopGeneration();
    setHistoryRestored(false);
    restoredMessageIdsRef.current.clear();
    setConversationId(createConversationId());
    setMessages([]);
    setInput('');
    attachmentQueue.clear();
    setFeedback({});
    setFeedbackComments({});
    setSelectedProduct(null);
    if (isMenuOpen) closeAssistantLayer();
    showToast(tr('Nouvelle conversation', 'محادثة جديدة'));
  };

  const selectConversation = (conversation: AssistantConversation) => {
    if (conversation.id === conversationId) { closeAssistantLayer(); return; }
    saveActiveConversation();
    cancelVoiceNote(); stopVoiceMode();
    stopGeneration();
    rememberSnapshot(conversation);
    restoredMessageIdsRef.current = new Set(conversation.messages.map(message => message.id));
    setHistoryRestored(true);
    setConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput('');
    attachmentQueue.clear();
    setFeedback({});
    setFeedbackComments({});
    setIsStoredProduct(Boolean(conversation.selectedProduct));
    setSelectedProduct(conversation.selectedProduct || null);
    closeAssistantLayer();
  };

  const removeConversation = (id: string) => {
    const next = deleteAssistantConversation(historyScope, id);
    setHistoryStatus(next.status);
    if (next.status !== 'ready') return;
    setConversations(next.conversations);
    if (id === conversationId) {
      cancelVoiceNote(); stopVoiceMode();
      stopGeneration();
      setHistoryRestored(false);
      setInput(''); attachmentQueue.clear();
      setConversationId(createConversationId());
      setMessages([]);
      setFeedback({});
      setFeedbackComments({});
      setSelectedProduct(null);
    }
  };

  const handleFilePicked = (file: File, _kind: 'image' | 'file') => {
    const origin = navigation.current;
    void attachmentQueue.add(file).then(added => {
      if (added && isOpenRef.current && origin?.id === 'assistant:attachments' && feedbackContext.current.top === origin) closeAssistantLayer();
    });
  };

  const handleCopy = async (message: AssistantMessage) => {
    try {
      const result = await copyAssistantText(message.text);
      showToast(tr(...textActionLabels[result]));
      if (result !== 'copied') { setCopiedId(null); return; }
      setCopiedId(message.id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => {
        setCopiedId(null);
        copiedTimerRef.current = null;
      }, 1800);
    } catch {
      showToast(tr(...textActionLabels.error));
    }
  };

  const handleRegenerate = (messageId: string) => {
    if (isGenerating) return;
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;
    const sourceMessages = messages.slice(0, messageIndex);
    const responseId = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setMessages([...sourceMessages, { id: responseId, role: 'assistant', text: '', incomplete: true }]);
    void startAssistantReply(sourceMessages, responseId);
  };

  const handleSelectProduct = async (messageId: string, candidate: AyrovixCandidate, restoring = false) => {
    if (productRequestRef.current) return;
    if (!validProductUrl(candidate.sourceUrl)) {
      showToast(tr('Lien produit indisponible. Relancez la recherche.', 'رابط المنتج غير متاح. أعد البحث.'));
      return;
    }
    const refreshRequired = restoring || restoredMessageIdsRef.current.has(messageId);
    const controller = new AbortController();
    productRequestRef.current = controller;
    const context = productContextRef.current;
    const current = () => {
      const latest = productContextRef.current;
      return !controller.signal.aborted && productRequestRef.current === controller && latest.isOpen
        && latest.conversationId === context.conversationId && latest.historyScope === context.historyScope
        && latest.entry === context.entry;
    };
    setProductBusyId(candidate.id);
    try {
      let product = candidateToProduct(candidate);
      if (refreshRequired || candidate.kind === 'external') {
        const result = await analyzeUrl(candidate.sourceUrl, 'url', controller.signal, false);
        if (!current()) return;
        if (result.eventId) void markChosen(result.eventId);
        // Quote-bound fields (title, URL, price, currency, status, token) must all
        // come from the same new response. Never overwrite them with history.
        product = result.product;
      }
      if (current()) openAssistantProduct({ messageId, product, priceVerified: product.priceVerificationStatus === 'VERIFIED' });
    } catch (error: any) {
      if (!current()) return;
      if (!refreshRequired) openAssistantProduct({ messageId, product: candidateToProduct(candidate), priceVerified: false });
      showToast(refreshRequired ? tr('Actualisation impossible. Le produit conservé n’a pas été remplacé. Réessayez.', 'تعذّر التحديث. لم يُستبدل المنتج المحفوظ. أعد المحاولة.') : error?.message || tr('Le lien sera vérifié manuellement par AYROVI.', 'ستتحقق AYROVI من الرابط يدويًا.'));
    } finally {
      if (productRequestRef.current === controller) { productRequestRef.current = null; setProductBusyId(''); }
    }
  };

  const handleProductOrder = async ({ size, color, quantity, customerNote, manualUrl }: AyrovixOrderSelection) => {
    const product = selectedProduct?.product;
    if (!product) return;
    if (isStoredProduct) { showToast(tr('Actualisez d’abord le produit conservé.', 'حدّث المنتج المحفوظ أولًا.')); return; }
    const { option, offer } = resolveProductSelection(product, size, color);
    if (!completeProductOffer(offer)) {
      showToast(tr(...productSelectionLabels.unavailable));
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
        sourcePrice: offer.price,
        sourceCurrency: offer.currency,
        priceTND: offer.priceTnd ?? 0,
        variant: option?.label || variant || undefined,
        requestedSize: size,
        requestedColor: color,
        customerNote,
        priceVerificationStatus: product.priceVerificationStatus || 'PENDING_MANUAL',
        priceToken: offer.priceToken,
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

  // A confirmed write only updates its original conversation. Per-message admission
  // prevents double submission and out-of-order thumb/comment writes in this view.
  const submitFeedback = async (message: AssistantMessage, rating: FeedbackValue, comment: string, fromSheet: boolean) => {
    if (feedbackRequests.current.has(message.id)) return;
    feedbackRequests.current.add(message.id);
    setFeedbackPending(current => ({ ...current, [message.id]: true }));
    const context = feedbackContext.current;
    const sameConversation = () => {
      const current = feedbackContext.current;
      return current.isOpen && current.historyScope === context.historyScope && current.conversationId === context.conversationId;
    };
    const sameSheet = () => feedbackContext.current.layer === context.layer && feedbackContext.current.top === context.layer;
    try {
      await persistFeedback(message, rating, comment);
      if (!sameConversation()) return;
      if (fromSheet && !sameSheet()) return;
      setFeedback(current => ({ ...current, [message.id]: rating }));
      setFeedbackComments(current => ({ ...current, [message.id]: comment }));
      if (fromSheet && sameSheet()) {
        setFeedbackMessage(null);
        closeAssistantLayer();
        showToast(tr('Merci pour votre avis', 'شكرًا على رأيك'));
      }
    } catch {
      if (sameConversation() && (!fromSheet || sameSheet())) showToast(tr('Impossible d’envoyer votre avis', 'تعذّر إرسال رأيك'));
    } finally {
      feedbackRequests.current.delete(message.id);
      setFeedbackPending(current => { const next = { ...current }; delete next[message.id]; return next; });
    }
  };

  const handleFeedback = (message: AssistantMessage, value: FeedbackValue) => {
    void submitFeedback(message, value, feedbackComments[message.id] || '', false);
  };

  const saveFeedbackComment = (rating: FeedbackValue, comment: string) => {
    if (feedbackMessage && feedbackLayer) void submitFeedback(feedbackMessage, rating, comment, true);
  };

  return (
    <div
      ref={viewportFrameRef}
      data-sonim-tone={isDark ? 'dark' : 'light'}
      data-ay-design="editorial" data-tone={isDark ? 'dark' : 'light'}
      className={`fixed z-[80] overflow-hidden overscroll-none [height:var(--assistant-viewport-height,100dvh)] [left:var(--assistant-viewport-left,0px)] [top:var(--assistant-viewport-top,0px)] [width:var(--assistant-viewport-width,100vw)] ${isDark ? 'bg-ink' : 'bg-surface'}`}
      dir={direction}
      role="dialog"
      aria-modal="true"
      aria-label={tr('SONIM', 'SONIM')}
    >
      <section ref={pageRef} tabIndex={-1} className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden font-[var(--ayrovi-font)] outline-none ${isDark ? 'bg-ink' : 'bg-surface'}`}>
        <div className="contents" inert={Boolean(isMenuOpen || isAttachmentSheetOpen || (feedbackLayer && feedbackMessage))}>
        {voiceMode ? (
          <AssistantVoiceModeScreen
            state={isMuted ? 'muted' : voiceState}
            volumeLevel={isMuted ? 0 : volumeLevel}
            isDark={isDark}
            isMuted={isMuted}
            isSpeakerMuted={isSpeakerMuted}
            liveTranscript={liveTranscript}
            attachments={attachments}
            pendingAttachments={pendingAttachments}
            onCancelAttachments={attachmentQueue.cancelPending}
            activeProduct={selectedProduct && !isStoredProduct ? {
              title: selectedProduct.product.title,
              brand: selectedProduct.product.brand || undefined,
              price: selectedProduct.product.price ?? undefined,
              currency: selectedProduct.product.currency || undefined,
              image: selectedProduct.product.image || undefined,
              priceTnd: selectedProduct.product.priceTnd ?? undefined,
            } : null}
            onToggleMute={handleToggleMute}
            onToggleSpeaker={handleToggleSpeaker}
            onExit={stopVoiceMode}
            onTapOrb={() => {
              if (voiceStateRef.current === 'speaking' || voiceStateRef.current === 'thinking') {
                stopActiveVoiceResponse();
              } else {
                voiceControllerRef.current?.forceFinishTurn();
              }
            }}
            onOpenAttachments={() => navigation.pushLayer({ id: 'assistant:attachments' })}
            onOpenLens={onOpenLens}
            onAddAttachment={handleAddVoiceAttachment}
            onRemoveAttachment={attachmentQueue.remove}
            onSelectSuggestion={(suggestion) => sendMessage(suggestion, true)}
            initialSettings={voiceControllerRef.current?.getVoiceSettings()}
            onVoiceSettingsChange={(settings) => voiceControllerRef.current?.configureVoice(settings)}
          />
        ) : (
          <>
            <AssistantHeader
              isDark={isDark}
              onOpenMenu={() => navigation.pushLayer({ id: 'assistant:menu' })}
              onClose={handleCloseAssistant}
            />
            {isBooting ? (
              <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-8 pt-8" aria-busy="true" aria-label={tr('Chargement de SONIM', 'جارٍ تحميل SONIM')}>
                <div className="mx-auto h-5 w-44 animate-pulse rounded-control bg-line" />
                <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-card bg-line" />)}
                </div>
              </main>
            ) : (
              <AssistantMessages
                messages={messages}
                historyNotice={<>
                  <AssistantHistoryNotice status={historyStatus} restored={historyRestored} busy={isGenerating} onRetry={messages.length ? () => setHistorySaveAttempt(value => value + 1) : undefined}/>
                  {historyRestored && selectedProduct && (!productLayer || isStoredProduct) && <div data-restored-product className="ay-readable-label mb-4 border border-line p-3 text-sm">
                    <p>{tr('Produit conservé :', 'المنتج المحفوظ:')} {selectedProduct.product.title}</p>
                    <button type="button" disabled={Boolean(productBusyId) || !validProductUrl(selectedProduct.product.sourceUrl)} className="ay-btn-secondary mt-2 min-h-11 px-3 text-xs" onClick={() => void handleSelectProduct(selectedProduct.messageId, { ...selectedProduct.product, id: 'restored-product', kind: 'external', match: 0, ratingKind: selectedProduct.product.ratingKind === 'merchant' ? 'merchant' : 'match' }, true)}>{productBusyId === 'restored-product' ? tr('Vérification…', 'جارٍ التحقق…') : tr('Actualiser et ouvrir le produit', 'تحديث المنتج وفتحه')}</button>
                    {!validProductUrl(selectedProduct.product.sourceUrl) && <p className="mt-2 text-xs">{tr('Lien produit indisponible. Relancez la recherche.', 'رابط المنتج غير متاح. أعد البحث.')}</p>}
                  </div>}
                </>}
                isGenerating={isGenerating}
                motionState={motionState}
                assistantReady={assistantReady}
                isDark={isDark}
                copiedId={copiedId}
                feedback={feedback}
                feedbackPending={feedbackPending}
                selectedProduct={productLayer && !isStoredProduct ? selectedProduct : null}
                productBusyId={productBusyId}
                isOrdering={isOrdering}
                analyzingImage={lensActive}
                onPrompt={(prompt) => sendMessage(prompt)}
                onCopy={handleCopy}
                onRegenerate={handleRegenerate}
                onFeedback={handleFeedback}
                onOpenComment={(message) => { setFeedbackMessage(message); navigation.pushLayer({ id: 'assistant:feedback', payload: { messageId: message.id } }); }}
                onOpenLens={onOpenLens}
                onSelectProduct={(messageId, candidate) => void handleSelectProduct(messageId, candidate)}
                onProductOrder={(selection) => void handleProductOrder(selection)}
                customerFirstName={customerFirstName}
              />
            )}

            {!isBooting && (
              <AssistantComposer
                value={input}
                attachments={attachments}
                pendingAttachments={pendingAttachments}
                onCancelAttachments={attachmentQueue.cancelPending}
                capturePending={voiceNoteState === 'requesting'}
                onCancelTranscription={cancelVoiceNote}
                isDark={isDark}
                isGenerating={isGenerating}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                voiceMode={voiceMode}
                recordSeconds={recordSeconds}
                onChange={setInput}
                onOpenAttachments={() => navigation.pushLayer({ id: 'assistant:attachments' })}
                onRemoveAttachment={attachmentQueue.remove}
                onStartRecording={() => void startRecording()}
                onFinishRecording={finishRecording}
                onCancelRecording={cancelRecording}
                onToggleVoiceMode={handleToggleVoiceMode}
                onSend={() => sendMessage()}
                onStop={stopGeneration}
              />
            )}
          </>
        )}

        </div>
        <AssistantSideMenu
          isOpen={isMenuOpen}
          isDark={isDark}
          conversations={conversations}
          historyStatus={historyStatus}
          activeConversationId={conversationId}
          isAuthenticated={isAuthenticated}
          onClose={closeAssistantLayer}
          onNewConversation={resetConversation}
          onSelectConversation={selectConversation}
          onDeleteConversation={removeConversation}
          onOpenOrders={onOpenOrders}
          onOpenLens={onOpenLens}
          onOpenAccount={onOpenAccount}
          onHelp={() => { closeAssistantLayer(); sendMessage('Comment utiliser SONIM et Lens ?'); }}
          onToggleDark={() => setIsDark((dark) => !dark)}
          onExit={handleCloseAssistant}
        />

        <AssistantAttachmentSheet
          isOpen={isAttachmentSheetOpen}
          isDark={isDark}
          webSearchEnabled={webSearchEnabled}
          pendingAttachments={pendingAttachments}
          onCancelAttachments={attachmentQueue.cancelPending}
          onClose={closeAssistantLayer}
          onPickFile={handleFilePicked}
          onToggleWebSearch={() => setWebSearchEnabled((enabled) => !enabled)}
          onConnectors={() => showToast(tr('Les connecteurs seront bientôt disponibles', 'الخدمات المتصلة ستتوفر قريبًا'))}
        />

        <AssistantFeedbackSheet
          isOpen={Boolean(feedbackLayer && feedbackMessage)}
          isDark={isDark}
          initialRating={feedbackMessage ? feedback[feedbackMessage.id] : undefined}
          initialComment={feedbackMessage ? feedbackComments[feedbackMessage.id] : ''}
          isSaving={Boolean(feedbackMessage && feedbackPending[feedbackMessage.id])}
          onClose={closeAssistantLayer}
          onSave={saveFeedbackComment}
        />

        <div className={`pointer-events-none absolute bottom-24 left-1/2 z-[70] -translate-x-1/2 w-max max-w-[calc(100%-2rem)] whitespace-normal ay-readable text-center rounded-card px-4 py-2.5 text-xs shadow-lg transition ${toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 invisible'} ${isDark ? 'bg-surface text-ink' : 'bg-ink text-white'}`} role="status">
          {toast}
        </div>
      </section>
    </div>
  );
};
