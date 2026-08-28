import React, { useEffect, useRef, useState } from 'react';
import { AssistantAttachmentSheet } from './AssistantAttachmentSheet';
import { AssistantComposer } from './AssistantComposer';
import { AssistantFeedbackSheet } from './AssistantFeedbackSheet';
import { AssistantHeader } from './AssistantHeader';
import { AssistantMessages } from './AssistantMessages';
import { AssistantSideMenu } from './AssistantSideMenu';
import { AssistantVoiceModeScreen } from './AssistantVoiceModeScreen';
import { AssistantVoiceOrb, VoiceState } from './AssistantVoiceOrb';
import { globalVoicePlayer } from './voicePlayer';
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
  listAssistantConversations,
  saveAssistantConversation,
} from './conversationHistory';
import { AssistantAttachment, AssistantMessage, FeedbackValue } from './types';
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

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 2;
const MAX_RECORD_SECONDS = 120;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
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
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [motionState, setMotionState] = useState<AyroviMotionState>('idle');
  const [lensActive, setLensActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
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
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [conversationId, setConversationId] = useState(createConversationId);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ messageId: string; product: AyrovixProduct; priceVerified: boolean } | null>(null);
  const [productBusyId, setProductBusyId] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const isSpeakerMutedRef = useRef(false);
  const voiceModeRef = useRef(false);
  const voiceStateRef = useRef<VoiceState>('idle');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const volumeAnimRef = useRef<number | null>(null);
  const speechRecognizerRef = useRef<any>(null);
  const speechSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenInTurnRef = useRef(false);

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
    setSelectedProduct(next);
    if (!productLayer) navigation.pushLayer({ id: 'assistant:product', payload: { messageId: next.messageId } });
  };

  const generationAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef(0);
  const voiceRequestRef = useRef(0);
  const voiceCapturePendingRef = useRef(false);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const historyReadyRef = useRef(false);
  const viewportFrameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);

  useBodyScrollLock(isOpen);

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
    const stored = listAssistantConversations(historyScope);
    setConversations(stored);
    if (stored[0]) {
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

  useEffect(() => {
    if (!isOpen || isGenerating || !historyReadyRef.current || !messages.length) return;
    const existing = conversations.find((item) => item.id === conversationId);
    const firstUserMessage = messages.find((message) => message.role === 'user')?.text || 'Nouvelle conversation';
    const now = new Date().toISOString();
    const next = saveAssistantConversation(historyScope, {
      id: conversationId,
      title: existing?.title || firstUserMessage.slice(0, 80),
      messages,
      selectedProduct,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setConversations(next);
  }, [messages, selectedProduct, conversationId, historyScope, isOpen, isGenerating]);

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
    setVolumeLevel(0);
    setLiveTranscript('');
    setIsMuted(false);
    isMutedRef.current = false;
    globalVoicePlayer.stop();

    if (volumeAnimRef.current !== null) {
      cancelAnimationFrame(volumeAnimRef.current);
      volumeAnimRef.current = null;
    }
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    try {
      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.onresult = null;
        speechRecognizerRef.current.onerror = null;
        speechRecognizerRef.current.onend = null;
        speechRecognizerRef.current.stop();
        speechRecognizerRef.current = null;
      }
    } catch {}
    const recorder = mediaRecorderRef.current;
    if (recorder?.state && recorder.state !== 'inactive') {
      discardRecordingRef.current = true;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    if (audioSourceRef.current) {
      try { audioSourceRef.current.disconnect(); } catch {}
      audioSourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { void audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    releaseMediaStream();
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (next) {
      if (speechRecognizerRef.current) {
        try { speechRecognizerRef.current.stop(); } catch {}
      }
      const recorder = mediaRecorderRef.current;
      if (recorder?.state && recorder.state !== 'inactive') {
        discardRecordingRef.current = true;
        recorder.stop();
      }
      setVoiceState('muted');
    } else {
      setVoiceState('listening');
      void startVoiceListeningTurn();
    }
  };

  const handleToggleSpeaker = () => {
    const next = !isSpeakerMuted;
    setIsSpeakerMuted(next);
    isSpeakerMutedRef.current = next;
    if (next) {
      globalVoicePlayer.stop();
    }
  };

  const interruptVoiceSpeech = () => {
    if (globalVoicePlayer.speaking || voiceStateRef.current === 'speaking' || isGenerating) {
      globalVoicePlayer.stop();
      if (generationAbortRef.current) {
        generationAbortRef.current.abort();
        generationAbortRef.current = null;
        setIsGenerating(false);
        setMotionState('idle');
      }
      setVoiceState('interrupted');
      setTimeout(() => {
        if (voiceModeRef.current && !isMutedRef.current) {
          setVoiceState('listening');
          void startVoiceListeningTurn();
        }
      }, 220);
    }
  };

  const finishVoiceTurn = () => {
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder?.state && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const processVoiceInput = async (audio: Blob, duration: number) => {
    if (duration < 0.4 || audio.size < 120) {
      if (voiceModeRef.current && !isMutedRef.current) void startVoiceListeningTurn();
      return;
    }
    setVoiceState('processing');
    const controller = new AbortController();
    transcriptionAbortRef.current = controller;
    setIsTranscribing(true);
    let recognizedText = liveTranscript.trim();

    try {
      const result = await transcribeAssistantAudio({
        audio,
        csrfToken: customerCsrfToken,
        signal: controller.signal,
      });
      if (result?.text?.trim()) {
        recognizedText = result.text.trim();
      }
    } catch {
      // Fallback: If server transcription is unavailable, use client speech recognition transcript
      console.warn('[Assistant Voice] Server transcription fallback to client transcript');
    } finally {
      if (transcriptionAbortRef.current === controller) {
        transcriptionAbortRef.current = null;
        setIsTranscribing(false);
      }
    }

    if (recognizedText) {
      setLiveTranscript('');
      sendMessage(recognizedText, true);
    } else {
      if (voiceModeRef.current) {
        showToast(tr('Parlez plus fort ou tapez votre message', 'تحدث بصوت أوضح أو اكتب رسالتك'));
        void startVoiceListeningTurn();
      }
    }
  };

  const startVoiceListeningTurn = async () => {
    if (!voiceModeRef.current || isGenerating || isTranscribing) return;
    setVoiceState('listening');
    setLiveTranscript('');
    spokenInTurnRef.current = false;

    try {
      let stream = mediaStreamRef.current;
      if (!stream || !stream.active || stream.getAudioTracks().every((t) => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
        });
        mediaStreamRef.current = stream;
      }

      // Web Audio API Pipeline with Noise Filtering & Compressor
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            void ctx.resume();
          }
          audioContextRef.current = ctx;

          // High-pass filter to eliminate rumble/background hum
          const filter = ctx.createBiquadFilter();
          filter.type = 'highpass';
          filter.frequency.value = 85;

          // Dynamics compressor to level out user speech vs speaker bleed
          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -30;
          compressor.knee.value = 30;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.35;
          analyserRef.current = analyser;

          const source = ctx.createMediaStreamSource(stream);
          source.connect(filter);
          filter.connect(compressor);
          compressor.connect(analyser);
          audioSourceRef.current = source;
        }
      } else if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume();
      }

      // Volume monitoring loop
      const checkVolume = () => {
        if (!voiceModeRef.current || !analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;
        const norm = Math.min(1, average / 110);
        setVolumeLevel(norm);

        // Instant Barge-in check: if currently speaking and user speaks
        if ((voiceStateRef.current === 'speaking' || globalVoicePlayer.speaking) && norm > 0.28) {
          interruptVoiceSpeech();
          return;
        }

        // Silence detection while listening (fast response)
        if (voiceStateRef.current === 'listening') {
          if (norm > 0.08) {
            spokenInTurnRef.current = true;
            if (speechSilenceTimerRef.current) {
              clearTimeout(speechSilenceTimerRef.current);
              speechSilenceTimerRef.current = null;
            }
          } else if (spokenInTurnRef.current && !speechSilenceTimerRef.current) {
            speechSilenceTimerRef.current = setTimeout(() => {
              if (voiceModeRef.current && voiceStateRef.current === 'listening' && spokenInTurnRef.current) {
                finishVoiceTurn();
              }
            }, 750);
          }
        }

        volumeAnimRef.current = requestAnimationFrame(checkVolume);
      };
      if (volumeAnimRef.current !== null) cancelAnimationFrame(volumeAnimRef.current);
      volumeAnimRef.current = requestAnimationFrame(checkVolume);

      // Web Speech API for instant interim subtitles & client STT fallback
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          if (speechRecognizerRef.current) {
            try { speechRecognizerRef.current.stop(); } catch {}
          }
          const recognizer = new SpeechRec();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = isArabic ? 'ar-TN' : 'fr-FR';
          recognizer.onresult = (event: any) => {
            let current = '';
            let hasFinal = false;
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              current += event.results[i][0].transcript;
              if (event.results[i].isFinal) hasFinal = true;
            }
            if (current.trim()) {
              if (voiceStateRef.current === 'speaking' || globalVoicePlayer.speaking) {
                interruptVoiceSpeech();
              }
              setLiveTranscript(current.trim());
              spokenInTurnRef.current = true;
              if (speechSilenceTimerRef.current) {
                clearTimeout(speechSilenceTimerRef.current);
                speechSilenceTimerRef.current = null;
              }
              if (hasFinal) {
                speechSilenceTimerRef.current = setTimeout(() => {
                  if (voiceModeRef.current && voiceStateRef.current === 'listening') {
                    finishVoiceTurn();
                  }
                }, 450);
              }
            }
          };
          recognizer.onerror = () => {};
          recognizer.start();
          speechRecognizerRef.current = recognizer;
        } catch {}
      }

      // Start MediaRecorder for audio capture
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const discarded = discardRecordingRef.current;
        const duration = (Date.now() - recordingStartedAtRef.current) / 1000;
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (discarded || !voiceModeRef.current) return;
        const audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        void processVoiceInput(audio, duration);
      };
      recorder.start(250);
    } catch (error: any) {
      stopVoiceMode();
      showToast(error?.name === 'NotAllowedError'
        ? tr('Autorisez le microphone pour activer le mode vocal', 'يرجى تفعيل صلاحية الميكروفون لاستخدام الوضع الصوتي')
        : tr('Microphone indisponible', 'الميكروفون غير متاح'));
    }
  };

  const handleToggleVoiceMode = () => {
    if (voiceMode) {
      stopVoiceMode();
    } else {
      setVoiceMode(true);
      voiceModeRef.current = true;
      setIsMuted(false);
      isMutedRef.current = false;

      const greeting = isArabic
        ? (customerFirstName ? `مرحباً ${customerFirstName}، كيف يمكنني مساعدتك اليوم؟` : 'مرحباً بك في AYROVI، كيف يمكنني مساعدتك اليوم؟')
        : (customerFirstName ? `Bonjour ${customerFirstName} ! Comment puis-je vous aider aujourd’hui ?` : 'Bonjour ! Comment puis-je vous aider aujourd’hui ?');

      setVoiceState('speaking');
      if (!isSpeakerMutedRef.current) {
        globalVoicePlayer.speak(
          greeting,
          isArabic ? 'ar' : 'fr',
          () => setVoiceState('speaking'),
          () => {
            if (voiceModeRef.current && !isMutedRef.current) {
              setVoiceState('listening');
              void startVoiceListeningTurn();
            } else if (voiceModeRef.current && isMutedRef.current) {
              setVoiceState('muted');
            }
          },
        );
      } else {
        setVoiceState('listening');
        void startVoiceListeningTurn();
      }
    }
  };

  const startAssistantReply = async (sourceMessages: AssistantMessage[], responseId: string) => {
    stopGeneration();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setIsGenerating(true);
    setMotionState('thinking'); setLensActive(false);

    let pendingSpeechBuffer = '';
    let hasStreamSpoken = false;

    try {
      await streamAssistantChat({
        conversationId,
        messages: sourceMessages,
        state: {
          orderStage: selectedProduct ? 'PRODUCT_CONFIGURATION' : 'CONVERSATION',
          webSearchEnabled,
          isAuthenticated,
          activeProduct: selectedProduct ? {
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
          if (event.type === 'state') {
            setMotionState(event.state);
            if (voiceModeRef.current) {
              if (event.state === 'analyzing' || event.state === 'reasoning') {
                setVoiceState('tool_call');
              } else if (event.state === 'thinking' || event.state === 'creating') {
                if (!globalVoicePlayer.speaking) setVoiceState('processing');
              }
            }
          }
          if (event.type === 'delta') {
            setMessages((current) => current.map((message) => message.id === responseId ? { ...message, text: message.text + event.text } : message));

            // Incremental sentence streaming TTS (sub-second spoken response like ChatGPT Voice)
            if (voiceModeRef.current && !isSpeakerMutedRef.current) {
              pendingSpeechBuffer += event.text;
              const match = pendingSpeechBuffer.match(/^([\s\S]+?[.!?؟\n]+)([\s\S]*)$/);
              if (match) {
                const sentence = match[1].trim();
                pendingSpeechBuffer = match[2];
                if (sentence) {
                  hasStreamSpoken = true;
                  setVoiceState('speaking');
                  globalVoicePlayer.queueSentence(
                    sentence,
                    isArabic ? 'ar' : 'fr',
                    () => setVoiceState('speaking'),
                    () => {
                      if (voiceModeRef.current && !isMutedRef.current && !generationAbortRef.current && !globalVoicePlayer.speaking) {
                        setVoiceState('listening');
                        void startVoiceListeningTurn();
                      }
                    },
                  );
                }
              }
            }
          }
          if (event.type === 'tool') {
            if (voiceModeRef.current) {
              setVoiceState('tool_call');
            }
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
                lensSummary: event.data.lens ? { confidence: Number(event.data.lens.confidence || 0), verified: Boolean(event.data.lens.verified), warnings: Array.isArray(event.data.lens.warnings) ? event.data.lens.warnings : [] } : null,
              };
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

        // Flush remainder of audio or speak full response if not yet queued
        if (voiceModeRef.current && !isSpeakerMutedRef.current) {
          if (pendingSpeechBuffer.trim()) {
            hasStreamSpoken = true;
            globalVoicePlayer.queueSentence(
              pendingSpeechBuffer.trim(),
              isArabic ? 'ar' : 'fr',
              () => setVoiceState('speaking'),
              () => {
                if (voiceModeRef.current && !isMutedRef.current) {
                  setVoiceState('listening');
                  void startVoiceListeningTurn();
                } else if (voiceModeRef.current && isMutedRef.current) {
                  setVoiceState('muted');
                }
              },
            );
          } else if (!hasStreamSpoken) {
            setMessages((latest) => {
              const resp = latest.find((m) => m.id === responseId);
              if (resp && resp.text.trim()) {
                setVoiceState('speaking');
                globalVoicePlayer.speak(
                  resp.text,
                  isArabic ? 'ar' : 'fr',
                  () => setVoiceState('speaking'),
                  () => {
                    if (voiceModeRef.current && !isMutedRef.current) {
                      setVoiceState('listening');
                      void startVoiceListeningTurn();
                    } else if (voiceModeRef.current && isMutedRef.current) {
                      setVoiceState('muted');
                    }
                  },
                );
              } else {
                if (voiceModeRef.current && !isMutedRef.current) {
                  setVoiceState('listening');
                  void startVoiceListeningTurn();
                }
              }
              return latest;
            });
          }
        } else if (voiceModeRef.current && isMutedRef.current) {
          setVoiceState('muted');
        } else if (voiceModeRef.current) {
          setVoiceState('listening');
          void startVoiceListeningTurn();
        }
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => pageRef.current?.focus({ preventScroll: true }));
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (feedbackLayer || productLayer || isAttachmentSheetOpen || isMenuOpen) closeAssistantLayer();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, feedbackLayer, productLayer, isAttachmentSheetOpen, isMenuOpen, onClose]);

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
    if (!isRecording || recordSeconds < MAX_RECORD_SECONDS) return;
    discardRecordingRef.current = false;
    setIsRecording(false);
    setRecordSeconds(0);
    const recorder = mediaRecorderRef.current;
    if (recorder?.state && recorder.state !== 'inactive') recorder.stop();
  }, [isRecording, recordSeconds]);

  useEffect(() => {
    if (isOpen) return;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setMotionState('idle');
    stopVoiceMode();
    voiceRequestRef.current += 1;
    voiceCapturePendingRef.current = false;
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
    setIsTranscribing(false);
    setIsRecording(false);
    setRecordSeconds(0);
    setFeedbackMessage(null);
  }, [isOpen]);

  useEffect(() => () => {
    isOpenRef.current = false;
    generationAbortRef.current?.abort();
    transcriptionAbortRef.current?.abort();
    stopVoiceMode();
    voiceRequestRef.current += 1;
    voiceCapturePendingRef.current = false;
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }, []);

  const handleCloseAssistant = () => {
    stopGeneration();
    stopVoiceMode();
    transcriptionAbortRef.current?.abort();
    voiceRequestRef.current += 1;
    voiceCapturePendingRef.current = false;
    discardRecordingRef.current = true;
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    setIsTranscribing(false);
    setIsRecording(false);
    setRecordSeconds(0);
    setFeedbackMessage(null);
    const start = navigation.stack.findIndex((layer) => layer.id === 'app:assistant');
    const pops = start >= 0 ? navigation.stack.length - start : 1;
    if (navigation.entry.depth <= 0 || pops >= navigation.entry.depth) navigation.goHome();
    else window.history.go(-pops);
  };

  if (!isOpen) return null;

  const sendMessage = (customText?: string, fromVoice = false) => {
    const text = (customText ?? input).trim();
    if ((!text && attachments.length === 0) || isGenerating || isTranscribing || isRecording || generationAbortRef.current) return;
    const sentAttachments = attachments.map((attachment) => ({ ...attachment }));
    const displayText = text || (sentAttachments.length > 1 ? 'Analyse ces images.' : 'Analyse cette image.');
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

  const releaseMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const transcribeRecording = async (audio: Blob, duration: number) => {
    if (duration < 0.5 || audio.size < 150) {
      showToast(tr('Enregistrement trop court', 'التسجيل قصير جدًا'));
      return;
    }
    const controller = new AbortController();
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = controller;
    setIsTranscribing(true);
    let text = liveTranscript.trim();
    try {
      const result = await transcribeAssistantAudio({
        audio,
        csrfToken: customerCsrfToken,
        signal: controller.signal,
      });
      if (result.text?.trim()) {
        text = result.text.trim();
      }
    } catch {
      // Fallback to client transcript
    } finally {
      if (transcriptionAbortRef.current === controller) {
        transcriptionAbortRef.current = null;
        setIsTranscribing(false);
      }
    }
    if (text) {
      setLiveTranscript('');
      sendMessage(text, true);
    } else {
      showToast(tr('Aucune parole détectée — veuillez parler plus clairement', 'لم يتم اكتشاف كلام واضح — يرجى التحدث بوضوح'));
    }
  };

  const startRecording = async () => {
    if (isGenerating || isTranscribing || isRecording || voiceCapturePendingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast(tr('L’enregistrement vocal n’est pas compatible avec ce navigateur', 'التسجيل الصوتي غير متوافق مع هذا المتصفح'));
      return;
    }
    const requestId = ++voiceRequestRef.current;
    voiceCapturePendingRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== voiceRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        discardRecordingRef.current = true;
        setIsRecording(false);
        setRecordSeconds(0);
        releaseMediaStream();
        showToast('Impossible d’enregistrer le message vocal');
      };
      recorder.onstop = () => {
        const discarded = discardRecordingRef.current;
        const duration = (Date.now() - recordingStartedAtRef.current) / 1000;
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        releaseMediaStream();
        if (discarded) return;
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        void transcribeRecording(audio, duration);
      };
      recorder.start(250);
      setRecordSeconds(0);
      setIsRecording(true);
    } catch (error: any) {
      stream?.getTracks().forEach((track) => track.stop());
      releaseMediaStream();
      if (requestId === voiceRequestRef.current) {
        showToast(error?.name === 'NotAllowedError'
          ? 'Autorisez le microphone pour envoyer un message vocal'
          : 'Microphone indisponible');
      }
    } finally {
      if (requestId === voiceRequestRef.current) voiceCapturePendingRef.current = false;
    }
  };

  const finishRecording = () => {
    discardRecordingRef.current = false;
    setIsRecording(false);
    setRecordSeconds(0);
    const recorder = mediaRecorderRef.current;
    if (recorder?.state && recorder.state !== 'inactive') recorder.stop();
    else releaseMediaStream();
  };

  const cancelRecording = () => {
    discardRecordingRef.current = true;
    setIsRecording(false);
    setRecordSeconds(0);
    const recorder = mediaRecorderRef.current;
    if (recorder?.state && recorder.state !== 'inactive') recorder.stop();
    else releaseMediaStream();
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
    if (isMenuOpen) closeAssistantLayer();
    showToast('Nouvelle conversation');
  };

  const selectConversation = (conversation: AssistantConversation) => {
    stopGeneration();
    setConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput('');
    setAttachments([]);
    setFeedback({});
    setFeedbackComments({});
    setSelectedProduct(conversation.selectedProduct || null);
    closeAssistantLayer();
  };

  const removeConversation = (id: string) => {
    const next = deleteAssistantConversation(historyScope, id);
    setConversations(next);
    if (id === conversationId) {
      setConversationId(createConversationId());
      setMessages([]);
      setFeedback({});
      setFeedbackComments({});
      setSelectedProduct(null);
    }
  };

  const handleFilePicked = (file: File, kind: 'image' | 'file') => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      showToast(`Maximum ${MAX_ATTACHMENTS} pièces jointes`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast('Image trop volumineuse (max 5 Mo)');
      return;
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      showToast('Formats acceptés : JPEG, PNG, WebP ou GIF');
      return;
    }
    const addFile = (preview?: string, type = file.type) => {
      setAttachments((current) => [
        ...current,
        { id: `file_${Date.now()}_${Math.random()}`, name: file.name, type, preview },
      ]);
      if (isAttachmentSheetOpen) closeAssistantLayer();
    };
    void kind;
    // Compression côté client : garantit que l'image atteint toujours le modèle
    // (≤2,5 Mo → base64 sûr), quel que soit l'appareil ou la taille d'origine.
    const compress = async (): Promise<{ dataUrl: string; type: string } | null> => {
      try {
        const bitmap = await createImageBitmap(file);
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const toBlob = (type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
        let blob = await toBlob('image/png');
        let type = 'image/png';
        if (!blob || blob.size > 2.5 * 1024 * 1024) {
          blob = await toBlob('image/jpeg', 0.85);
          type = 'image/jpeg';
        }
        if (!blob) return null;
        return { dataUrl: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('read'));
          reader.readAsDataURL(blob);
        }), type };
      } catch {
        return null;
      }
    };
    void compress().then((prepared) => {
      if (prepared) { addFile(prepared.dataUrl, prepared.type); return; }
      const reader = new FileReader();
      reader.onload = () => addFile(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => showToast('Impossible de lire cette image');
      reader.readAsDataURL(file);
    });
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
          rating: candidate.rating ?? result.product.rating ?? null,
          ratingCount: candidate.ratingCount ?? result.product.ratingCount ?? null,
          ratingKind: candidate.ratingKind || result.product.ratingKind || 'match',
          priceToken: candidate.priceToken || result.product.priceToken,
          colors: result.product.colors.length ? result.product.colors : candidate.colors,
          sizes: result.product.sizes.length ? result.product.sizes : candidate.sizes,
        };
      }
      openAssistantProduct({ messageId, product, priceVerified: product.priceVerificationStatus === 'VERIFIED' });
    } catch (error: any) {
      openAssistantProduct({ messageId, product: candidateToProduct(candidate), priceVerified: false });
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
      showToast(tr('Impossible d’envoyer votre avis', 'تعذّر إرسال رأيك'));
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
      closeAssistantLayer();
      showToast(tr('Merci pour votre avis', 'شكرًا على رأيك'));
    } catch {
      showToast(tr('Impossible d’envoyer votre avis', 'تعذّر إرسال رأيك'));
    } finally {
      setIsFeedbackSaving(false);
    }
  };

  return (
    <div
      ref={viewportFrameRef}
      className={`fixed z-[80] overflow-hidden overscroll-none [height:var(--assistant-viewport-height,100dvh)] [left:var(--assistant-viewport-left,0px)] [top:var(--assistant-viewport-top,0px)] [width:var(--assistant-viewport-width,100vw)] ${isDark ? 'bg-ink' : 'bg-surface'}`}
      dir={direction}
      role="dialog"
      aria-modal="true"
      aria-label={tr('SONIM', 'SONIM')}
    >
      <section ref={pageRef} tabIndex={-1} className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden font-[var(--ayrovi-font)] outline-none ${isDark ? 'bg-ink' : 'bg-surface'}`}>
        <AssistantHeader
          isDark={isDark}
          onOpenMenu={() => navigation.pushLayer({ id: 'assistant:menu' })}
          onClose={handleCloseAssistant}
        />

        {voiceMode ? (
          <AssistantVoiceModeScreen
            state={isMuted ? 'muted' : (voiceState as any)}
            volumeLevel={isMuted ? 0 : volumeLevel}
            isDark={isDark}
            isMuted={isMuted}
            isSpeakerMuted={isSpeakerMuted}
            liveTranscript={liveTranscript}
            attachments={attachments}
            activeProduct={selectedProduct ? {
              title: selectedProduct.product.title,
              brand: selectedProduct.product.brand,
              price: selectedProduct.product.price || undefined,
              currency: selectedProduct.product.currency || undefined,
              image: selectedProduct.product.image || undefined,
              priceTnd: selectedProduct.product.priceTnd || undefined,
            } : null}
            onToggleMute={handleToggleMute}
            onToggleSpeaker={handleToggleSpeaker}
            onExit={stopVoiceMode}
            onOpenSettings={() => setIsMenuOpen(true)}
            onOpenAttachments={() => navigation.pushLayer({ id: 'assistant:attachments' })}
            onOpenLens={onOpenLens}
          />
        ) : (
          <>
            {isBooting ? (
              <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 pb-8 pt-[max(4.75rem,calc(env(safe-area-inset-top)+3.25rem))]" aria-busy="true" aria-label={tr('Chargement de SONIM', 'جارٍ تحميل SONIM')}>
                <div className="mx-auto h-5 w-44 animate-pulse rounded-control bg-line" />
                <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-card bg-line" />)}
                </div>
              </main>
            ) : (
              <AssistantMessages
                messages={messages}
                isGenerating={isGenerating}
                motionState={motionState}
                assistantReady={assistantReady}
                isDark={isDark}
                copiedId={copiedId}
                feedback={feedback}
                selectedProduct={productLayer ? selectedProduct : null}
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
                isDark={isDark}
                isGenerating={isGenerating}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                voiceMode={voiceMode}
                recordSeconds={recordSeconds}
                onChange={setInput}
                onOpenAttachments={() => navigation.pushLayer({ id: 'assistant:attachments' })}
                onRemoveAttachment={(id) => setAttachments((current) => current.filter((attachment) => attachment.id !== id))}
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

        <AssistantSideMenu
          isOpen={isMenuOpen}
          isDark={isDark}
          conversations={conversations}
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
          onClose={closeAssistantLayer}
          onPickFile={handleFilePicked}
          onToggleWebSearch={() => setWebSearchEnabled((enabled) => !enabled)}
          onConnectors={() => showToast('Les connecteurs seront bientôt disponibles')}
        />

        <AssistantFeedbackSheet
          isOpen={Boolean(feedbackLayer && feedbackMessage)}
          isDark={isDark}
          initialRating={feedbackMessage ? feedback[feedbackMessage.id] : undefined}
          initialComment={feedbackMessage ? feedbackComments[feedbackMessage.id] : ''}
          isSaving={isFeedbackSaving}
          onClose={closeAssistantLayer}
          onSave={saveFeedbackComment}
        />

        <div className={`pointer-events-none absolute bottom-24 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs shadow-lg transition ${toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'} ${isDark ? 'bg-surface text-ink' : 'bg-ink text-white'}`} role="status">
          {toast}
        </div>
      </section>
    </div>
  );
};
