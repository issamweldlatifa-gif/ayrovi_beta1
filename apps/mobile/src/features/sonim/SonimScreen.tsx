/**
 * Sonim — assistant conversationnel IA natif branché sur `/api/assistant/*`.
 *
 * Prend en charge :
 *   • flux SSE temps réel (`expo/fetch` + repli texte si nécessaire) ;
 *   • pièces jointes image (jusqu'à 2 photos compressées localement) ;
 *   • outils métier (suivi commande, calcul TND, recherche produit → AYWEBs,
 *     escalade support) ;
 *   • respect intégral des jetons éditoriaux (clair/sombre, FR/AR RTL).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StatusBar,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  ASSISTANT_MAX_ATTACHMENTS,
  ASSISTANT_MAX_CHARS,
  fetchAssistantStatus,
  newAssistantConversationId,
  streamAssistantChat,
  type AssistantAttachment,
  type AssistantState,
  type StreamFetch,
} from '@/api/assistant';
import { TabSonimIcon, ReferenceNavigationGlyph } from '@/design/TabNavIcons';
import { AppImage } from '@/design/appImage';
import { useResponsive } from '@/design/layout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText, Drawer } from '@/design/ui';
import { AppSheet } from '@/design/sheet/AppSheet';
import { cancelSonimGeneration, claimSonimGeneration, releaseSonimGeneration, useSonimSession, type SonimAttachment } from './sonimSession';
import { sonimOwner } from './sonimContext';
import { useCleanKeyboard } from './useCleanKeyboard';
import { CleanCameraPanel } from './CleanCameraPanel';
import { useI18n } from '@/i18n';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import {
  applySonimToolEvent,
  cleanSonimText,
  sonimStateTranslationKey,
  type SonimChatMessage,
} from './sonimModel';
import { CLEAN, CLEAN_TYPE, CleanWordmark, CleanActionGlyph, CleanSpeakerIcon, CleanMenuGlyph } from './CleanVisuals';
import { useCleanRecording } from './useCleanRecording';
import { SonimToolCards } from './SonimToolCards';

type PickedAttachment = AssistantAttachment & { previewUri: string };

async function resolveNativeStreamFetch(): Promise<StreamFetch | undefined> {
  try {
    const mod = await import('expo/fetch');
    if (typeof mod.fetch === 'function') {
      return mod.fetch as unknown as StreamFetch;
    }
  } catch {
    // Environnement Jest/Node : `streamAssistantChat` bascule sur `globalThis.fetch`.
  }
  return undefined;
}

async function prepareAttachment(asset: ImagePicker.ImagePickerAsset): Promise<PickedAttachment | null> {
  const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let context: unknown = null;
  let sourceRef: unknown = null;
  let outputRef: unknown = null;

  const releaseQuiet = (target: unknown) => {
    try {
      (target as { release?: () => void } | null)?.release?.();
    } catch {
      // Libération best-effort.
    }
  };

  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const manipulator = ImageManipulator.manipulate(asset.uri);
    context = manipulator;
    const source = await manipulator.renderAsync();
    sourceRef = source;
    const maxEdge = 1280;
    if (Math.max(source.width, source.height) > maxEdge) {
      manipulator.resize(
        source.width >= source.height ? { width: maxEdge } : { height: maxEdge },
      );
    }
    const rendered = await manipulator.renderAsync();
    outputRef = rendered;
    const saved = await rendered.saveAsync({
      compress: 0.78,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (saved.base64) {
      return {
        id,
        previewUri: saved.uri || asset.uri,
        dataUrl: `data:image/jpeg;base64,${saved.base64}`,
        type: 'image/jpeg',
      };
    }
  } catch {
    // Repli sur le base64 fourni par la galerie si le manipulateur natif est absent.
  } finally {
    if (outputRef !== sourceRef) releaseQuiet(outputRef);
    releaseQuiet(sourceRef);
    releaseQuiet(context);
  }

  if (asset.base64) {
    const mime = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
    return {
      id,
      previewUri: asset.uri,
      dataUrl: `data:${mime};base64,${asset.base64}`,
      type: mime,
    };
  }
  return null;
}

export function SonimScreen() {
  const theme = useTheme();
  const isFocused = useIsFocused();
  const { locale, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  const sessionId = useSessionId();
  const { account, status } = useSession();
  const keyboard = useCleanKeyboard();
  const keyboardOpen = keyboard.open;
  const [cameraOpen, setCameraOpen] = useState(false);
  const closeCamera = useCallback(() => setCameraOpen(false), []);

  const [menuOpen, setMenuOpen] = useState(false);
  // Conversation is scoped to this signed-in account or guest session, held
  // in memory only. It survives route changes, never account changes/restarts.
  const owner = sonimOwner(sessionId, status, account?.id);
  const session = useSonimSession();
  const owned = Boolean(owner) && session.owner === owner;
  useEffect(() => { if (owner) useSonimSession.getState().open(owner); }, [owner]);
  const conversationId = owned ? session.conversationId : '';
  const messages = owned ? session.messages : [];
  const draft = owned ? session.draft : '';
  const attachments = owned ? session.attachments : [];
  const streamingState = owned ? session.streamingState : null;
  const isStreaming = owned && session.isStreaming;
  const setConversationId = useCallback((value: SetStateAction<string>) => useSonimSession.getState().update(owner, 'conversationId', value), [owner]);
  const setMessages = useCallback((value: SetStateAction<SonimChatMessage[]>) => useSonimSession.getState().update(owner, 'messages', value), [owner]);
  const setDraft = useCallback((value: SetStateAction<string>) => useSonimSession.getState().update(owner, 'draft', value), [owner]);
  const setAttachments = useCallback((value: SetStateAction<SonimAttachment[]>) => useSonimSession.getState().update(owner, 'attachments', value), [owner]);
  const setStreamingState = useCallback((value: SetStateAction<AssistantState | null>) => useSonimSession.getState().update(owner, 'streamingState', value), [owner]);
  const setIsStreaming = useCallback((value: SetStateAction<boolean>) => useSonimSession.getState().update(owner, 'isStreaming', value), [owner]);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const activeAssistantRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['assistant-status'],
    queryFn: ({ signal }) => fetchAssistantStatus({ signal }),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => () => {
    if (activeAssistantRef.current) cancelSonimGeneration(owner);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, [owner]);

  const rowDir = rowDirectionFor(theme.isRTL);
  const bottomComposerClearance = Math.max(insets.bottom, theme.space[2]);

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const stopGeneration = useCallback(() => {
    cancelSonimGeneration(owner);
  }, [owner]);

  const startNewChat = useCallback(() => {
    stopGeneration();
    setMessages([]);
    setAttachments([]);
    setDraft('');
    setConversationId(newAssistantConversationId());
  }, [stopGeneration, setMessages, setAttachments, setDraft, setConversationId]);

  const sendPrompt = useCallback(
    async (explicitPrompt?: string) => {
      if (isStreaming || !sessionId || !conversationId || !owned) return;
      const rawText = (explicitPrompt ?? draft).trim();
      const outgoingAttachments = explicitPrompt ? [] : attachments;
      if (!rawText && outgoingAttachments.length === 0) return;

      const effectiveText = rawText || t('sonim.imageDefaultPrompt');
      const userMsg: SonimChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: effectiveText,
        attachments: outgoingAttachments.length > 0 ? outgoingAttachments : undefined,
      };
      const assistantId = `a_${Date.now() + 1}`;
      const cancel = () => {
        generationRef.current += 1;
        abortRef.current?.();
        abortRef.current = null;
        activeAssistantRef.current = null;
        setMessages((current) => current.map((msg) => msg.id === assistantId ? { ...msg, errorText: t('sonim.error.stream') } : msg));
        setIsStreaming(false);
        setStreamingState(null);
      };
      if (!claimSonimGeneration(owner, cancel)) return;
      const generation = ++generationRef.current;
      activeAssistantRef.current = assistantId;
      const placeholderAssistant: SonimChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
      };

      const historyForRequest = [...messages, userMsg];
      if (!explicitPrompt) {
        setDraft('');
        setAttachments([]);
      }
      setMessages([...historyForRequest, placeholderAssistant]);
      setIsStreaming(true);
      setStreamingState('thinking');
      scrollToEnd(true);

      let receivedError = false;
      try {
        const fetchImpl = await resolveNativeStreamFetch();
        if (generationRef.current !== generation) return;
        const stream = streamAssistantChat(
          {
            conversationId,
            sessionId,
            state: { surface: 'mobile', tab: 'sonim', locale },
            messages: historyForRequest.map((item) => ({
              role: item.role,
              text: item.text,
              attachments: item.attachments?.map(({ id, dataUrl, type }) => ({ id, dataUrl, type })),
            })),
          },
          (event) => {
            if (generationRef.current !== generation) return;
            if (event.type === 'state') {
              setStreamingState(event.state);
              return;
            }
            if (event.type === 'delta') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, text: msg.text + event.text } : msg,
                ),
              );
              scrollToEnd(false);
              return;
            }
            if (event.type === 'tool') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? applySonimToolEvent(msg, event.name, event.data) : msg,
                ),
              );
              scrollToEnd(true);
              return;
            }
            if (event.type === 'error') {
              receivedError = true;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, errorText: event.message || t('sonim.error.stream') }
                    : msg,
                ),
              );
            }
          },
          fetchImpl ? { fetchImpl } : {},
        );

        abortRef.current = stream.abort;
        const outcome = await stream.finished;
        if (generationRef.current === generation && outcome === 'error' && !receivedError) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && !msg.errorText
                ? { ...msg, errorText: t('sonim.error.stream') }
                : msg,
            ),
          );
        }
      } catch {
        if (generationRef.current !== generation) return;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId && !msg.errorText
              ? { ...msg, errorText: t('sonim.error.stream') }
              : msg,
          ),
        );
      } finally {
        releaseSonimGeneration(owner, cancel);
        if (generationRef.current === generation) {
          abortRef.current = null;
          activeAssistantRef.current = null;
          setIsStreaming(false);
          setStreamingState(null);
        }
      }
    },
    [attachments, conversationId, draft, isStreaming, locale, messages, owned, owner, scrollToEnd, sessionId, t, setMessages, setDraft, setAttachments, setIsStreaming, setStreamingState],
  );

  const pickImage = useCallback(async (source: 'camera' | 'gallery') => {
    const origin = captureOwner.current;
    if (attachments.length >= ASSISTANT_MAX_ATTACHMENTS || isStreaming) return;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setAttachmentError(true); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.78, base64: true, exif: false };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const prepared = await prepareAttachment(result.assets[0]);
      if (origin !== captureOwner.current) return;
      if (prepared) {
        setAttachments((prev) => [...prev.slice(0, ASSISTANT_MAX_ATTACHMENTS - 1), prepared]);
      }
    } catch {
      setAttachmentError(true);
    }
  }, [attachments.length, isStreaming, setAttachments]);

  const captureSerial = useRef(0), captureOwner = useRef('');
  captureOwner.current = isFocused ? `${owner}:${conversationId}:${captureSerial.current}` : '';
  const acceptPhoto = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const origin = captureOwner.current;
    const prepared = await prepareAttachment(asset);
    if (origin !== captureOwner.current) return;
    if (!prepared) throw new Error('photo');
    setAttachments(prev => prev.length < ASSISTANT_MAX_ATTACHMENTS ? [...prev, prepared] : prev);
  }, [setAttachments]);
  const openCamera = useCallback(async () => {
    if (isStreaming || attachments.length >= ASSISTANT_MAX_ATTACHMENTS) return;
    const origin = captureOwner.current;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (origin !== captureOwner.current) return;
      if (!permission.granted) { setAttachmentError(true); return; }
      setCameraOpen(true);
    } catch { setAttachmentError(true); }
  }, [isStreaming, attachments.length]);
  useEffect(() => {
    captureSerial.current++;
    captureOwner.current = isFocused ? `${owner}:${conversationId}:${captureSerial.current}` : '';
    setCameraOpen(false); setAttachmentOpen(false);
    return () => { captureOwner.current = ''; };
  }, [owner, conversationId, isFocused]);
  const pickFile = useCallback(async () => {
    if (isStreaming || attachments.length >= ASSISTANT_MAX_ATTACHMENTS) return;
    const origin = captureOwner.current;
    try {
      const picker = require('expo-document-picker') as typeof import('expo-document-picker');
      // The existing assistant accepts image attachments, not arbitrary PDF payloads.
      const result = await picker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || origin !== captureOwner.current) return;
      const asset = result.assets[0];
      if (!asset || !asset.size || asset.size > 8 * 1024 * 1024) throw new Error('file-size');
      const { File } = require('expo-file-system') as typeof import('expo-file-system');
      const base64 = await new File(asset.uri).base64();
      if (origin !== captureOwner.current) return;
      await acceptPhoto({ uri: asset.uri, width: 0, height: 0, base64, mimeType: asset.mimeType });
    } catch { if (origin === captureOwner.current) setAttachmentError(true); }
  }, [isStreaming, attachments.length, acceptPhoto]);

  const copyMessage = useCallback(async (message: SonimChatMessage) => {
    const cleaned = cleanSonimText(message.text);
    if (!cleaned) return;
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(cleaned);
      setCopiedId(message.id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Presse-papiers indisponible : ignoré sans erreur.
    }
  }, []);

  const quickActions = useMemo(
    () => [
      {
        id: 'lens',
        icon: 'scan-outline' as const,
        title: t('sonim.action.lens.title'),
        subtitle: t('sonim.action.lens.subtitle'),
        onPress: () => router.push('/lens'),
      },
      {
        id: 'stores',
        icon: 'storefront-outline' as const,
        title: t('sonim.action.stores.title'),
        subtitle: t('sonim.action.stores.subtitle'),
        onPress: () => router.push('/(tabs)/aywebs'),
      },
      {
        id: 'cart',
        icon: 'bag-outline' as const,
        title: t('sonim.action.cart.title'),
        subtitle: t('sonim.action.cart.subtitle'),
        onPress: () => router.push('/panier'),
      },
      {
        id: 'price',
        icon: 'calculator-outline' as const,
        title: t('sonim.action.price.title'),
        subtitle: t('sonim.action.price.subtitle'),
        onPress: () => { void sendPrompt(t('sonim.action.price.prompt')); },
      },
      {
        id: 'search',
        icon: 'search-outline' as const,
        title: t('sonim.action.search.title'),
        subtitle: t('sonim.action.search.subtitle'),
        onPress: () => { void sendPrompt(t('sonim.action.search.prompt')); },
      },
      {
        id: 'order',
        icon: 'cube-outline' as const,
        title: t('sonim.action.order.title'),
        subtitle: t('sonim.action.order.subtitle'),
        onPress: () => { void sendPrompt(t('sonim.action.order.prompt')); },
      },
    ],
    [sendPrompt, t],
  );

  const recording = useCleanRecording(`${owner}:${conversationId}`, text => setDraft(previous => previous ? `${previous} ${text}` : text));
  useEffect(() => {
    if (!isFocused) recording.cancel();
    // Capture ownership is explicitly revoked on blur, even when tabs keep this screen mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);
  const voiceBusy = recording.state !== 'idle';
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && Boolean(sessionId && owned && conversationId);
  const assistantOffline = statusQuery.data?.ready === false;

  const content = (
    <View style={[styles.body, { backgroundColor: CLEAN.paper }]}>
      <View
        style={[
          styles.sonimHeader,
          {
            flexDirection: rowDir,
            paddingTop: insets.top + theme.space[1],
            paddingBottom: theme.space[2],
            paddingHorizontal: gutter,
            backgroundColor: CLEAN.paper,
            borderBottomColor: theme.colors.line,
          },
        ]}
        testID="sonim-standalone-header"
      >
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('nav.menu')}
          style={({ pressed }) => [
            styles.headerBtn,
            { opacity: pressed ? theme.opacity.subtle : 1 },
          ]}
          testID="sonim-menu-open"
        >
          <CleanMenuGlyph />
        </Pressable>

        <View style={styles.headerCenter}><CleanWordmark /></View>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: theme.space[3], paddingHorizontal: gutter },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="sonim-scroll"
      >
        {messages.length > 0 ? (
          <View style={[styles.topBar, { flexDirection: rowDir }]}>
            <View style={[styles.brandBadge, { flexDirection: rowDir }]}>
              <TabSonimIcon size={theme.iconSize.sm} color={theme.colors.ink} focused />
              <AppText variant="label" >
                {t('tabs.sonim')}
              </AppText>
            </View>
            <Pressable
              onPress={startNewChat}
              accessibilityRole="button"
              accessibilityLabel={t('sonim.newChat')}
              style={({ pressed }) => [
                styles.resetButton,
                {
                  borderColor: theme.colors.line,
                  borderRadius: theme.radius.full,
                  flexDirection: rowDir,
                  opacity: pressed ? theme.opacity.subtle : 1,
                },
              ]}
              testID="sonim-new-chat"
            >
              <Ionicons name="refresh-outline" size={theme.iconSize.xs} color={theme.colors.ink} accessibilityElementsHidden />
              <AppText variant="captionStrong" color={CLEAN.ink}>
                {t('sonim.newChat')}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {assistantOffline ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.noticeBanner,
              {
                backgroundColor: theme.status.warning.soft,
                borderColor: theme.status.warning.border,
                borderRadius: theme.radius.card,
              },
            ]}
          >
            <AppText variant="captionStrong" color={theme.status.warning.fg}>
              {t('sonim.unavailable')}
            </AppText>
          </View>
        ) : null}

        {messages.length === 0 ? (
          <View style={styles.welcomeWrap} testID="sonim-welcome">
            <View style={{ alignSelf: 'stretch', backgroundColor: CLEAN.bubble, borderRadius: theme.radius.xl, padding: theme.space[4], gap: theme.space[2] }}>
              <AppText style={{ ...theme.text('label'), ...CLEAN_TYPE, color: CLEAN.ink }}>{t('clean.welcome')}</AppText>
              <AppText style={{ ...theme.text('label'), ...CLEAN_TYPE, color: CLEAN.ink }}>{t('clean.disclaimer')}</AppText>
            </View>

            <View style={styles.actionsGrid}>
              {quickActions.filter(action => ['lens', 'search', 'price'].includes(action.id)).sort((a, b) => ['lens', 'search', 'price'].indexOf(a.id) - ['lens', 'search', 'price'].indexOf(b.id)).map((action) => (
                <Pressable
                  key={action.id}
                  onPress={action.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  style={({ pressed }) => [
                    styles.actionCard,
                    {
                      backgroundColor: CLEAN.bubble,
                      borderColor: CLEAN.bubble,
                      borderRadius: theme.radius.full,
                      opacity: pressed ? theme.opacity.subtle : 1,
                    },
                  ]}
                  testID={`sonim-action-${action.id}`}
                >
                  <AppText style={{ ...theme.text('label'), ...CLEAN_TYPE, color: CLEAN.ink }}>{action.title}</AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.messageList}>
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              const isLastAssistant = !isUser && index === messages.length - 1;
              const displayText = isUser ? message.text : cleanSonimText(message.text);

              if (isUser) {
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.userRow,
                      { flexDirection: rowDir, justifyContent: 'flex-end', alignItems: 'flex-start' },
                    ]}
                  >
                    <View style={{ maxWidth: '82%', gap: 8, alignItems: 'flex-end' }}>
                    {message.attachments?.length ? (
                      <View style={[styles.attachmentRow, { flexDirection: rowDir }]}>
                        {message.attachments.map((att) => (
                          <View
                            key={att.id}
                            style={[
                              styles.sentThumbWrap,
                              { borderColor: theme.colors.line, borderRadius: theme.radius.md },
                            ]}
                          >
                            <AppImage uri={att.previewUri} style={styles.sentThumb} contentFit="cover" decorative />
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {displayText ? <View
                      style={[
                        styles.userBubble,
                        {
                          backgroundColor: CLEAN.bubble,
                          borderBottomEndRadius: theme.radius.xs,
                          borderRadius: theme.radius.xl,
                        },
                      ]}
                    >
                      <AppText variant="label" style={{ ...CLEAN_TYPE }} color={CLEAN.text}>
                        {displayText}
                      </AppText>
                    </View> : null}
                    </View>
                    <CleanSpeakerIcon role="user" />
                  </View>
                );
              }

              return (
                <View key={message.id} style={[styles.assistantRow, { flexDirection: rowDir, gap: 8, alignItems: 'flex-start' }]}><CleanSpeakerIcon role="assistant" />
                  <View
                    style={[
                      styles.assistantBubble,
                      {
                        backgroundColor: CLEAN.paper,
                        borderColor: CLEAN.paper,
                        borderRadius: theme.radius.card,
                      },
                    ]}
                  >
                    {displayText ? (
                      <AppText variant="label" style={{ ...CLEAN_TYPE }} color={CLEAN.ink}>{displayText}</AppText>
                    ) : null}

                    {isLastAssistant && isStreaming && streamingState ? (
                      <View style={[styles.statusRow, { flexDirection: rowDir }]} testID="sonim-streaming-state">
                        <ActivityIndicator size="small" color={theme.colors.muted} />
                        <AppText variant="caption" color={theme.colors.muted}>
                          {t(sonimStateTranslationKey(streamingState))}
                        </AppText>
                      </View>
                    ) : null}

                    <SonimToolCards message={message} />

                    {message.errorText ? (
                      <View
                        accessibilityRole="alert"
                        style={[
                          styles.errorBox,
                          {
                            backgroundColor: theme.status.danger.soft,
                            borderColor: theme.status.danger.border,
                            borderRadius: theme.radius.control,
                          },
                        ]}
                      >
                        <AppText variant="captionStrong" color={theme.status.danger.fg}>
                          {message.errorText}
                        </AppText>
                        {isLastAssistant && !isStreaming && messages[index - 1]?.role === 'user' && !draft && attachments.length === 0 ? (
                          <Pressable testID="sonim-retry-edit" accessibilityRole="button" onPress={() => {
                            const previous = messages[index - 1];
                            if (!previous) return;
                            setDraft(previous.text);
                            setAttachments(previous.attachments ?? []);
                          }} style={styles.retryAction}>
                            <AppText variant="captionStrong" color={theme.status.danger.fg}>{t('sonim.retryEdit')}</AppText>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}

                    {displayText && (!isLastAssistant || !isStreaming) ? (
                      <View style={[styles.messageActions, { flexDirection: rowDir }]}>
                        <Pressable
                          onPress={() => { void copyMessage(message); }}
                          accessibilityRole="button"
                          accessibilityLabel={copiedId === message.id ? t('sonim.copied') : t('sonim.copy')}
                          style={({ pressed }) => [
                            styles.copyBtn,
                            {
                              flexDirection: rowDir,
                              opacity: pressed ? theme.opacity.subtle : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name={copiedId === message.id ? 'checkmark-outline' : 'copy-outline'}
                            size={theme.iconSize.xs}
                            color={theme.colors.muted}
                            accessibilityElementsHidden
                          />
                          <AppText variant="caption" color={theme.colors.muted}>
                            {copiedId === message.id ? t('sonim.copied') : t('sonim.copy')}
                          </AppText>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.composerOuter,
          {
            backgroundColor: CLEAN.paper,
            borderTopColor: theme.colors.line,
            paddingHorizontal: gutter,
            paddingBottom: keyboardOpen ? theme.space[2] : bottomComposerClearance,
          },
        ]}
      >
        {attachmentError ? <AppText accessibilityRole="alert" variant="caption">{t('sonim.attachmentError')}</AppText> : null}
        {attachments.length > 0 ? (
          <View style={[styles.pendingAttachments, { flexDirection: rowDir }]}>
            {attachments.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.pendingThumbCard,
                  {
                    borderColor: theme.colors.line,
                    borderRadius: theme.radius.sm,
                    flexDirection: rowDir,
                  },
                ]}
              >
                <AppImage uri={item.previewUri} style={styles.pendingThumb} contentFit="cover" decorative />
                <Pressable
                  onPress={() => setAttachments((prev) => prev.filter((entry) => entry.id !== item.id))}
                  accessibilityRole="button"
                  accessibilityLabel={t('sonim.removeAttachment')}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {recording.error ? <AppText accessibilityRole="alert" variant="caption" color={CLEAN.ink}>{t('clean.voiceError')}</AppText> : null}
        <View style={[styles.composerBox, { backgroundColor: CLEAN.paper, borderColor: CLEAN.line, borderRadius: theme.radius.xl }]}>
          {voiceBusy ? <View style={{ flexDirection: rowDir, alignItems: 'center', minHeight: 40, gap: 8 }}>
            <AppText color={CLEAN.ink}>{recording.state === 'recording' ? t('clean.recording') : t('clean.processing')}</AppText>
            <Pressable onPress={recording.cancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.composerIconBtn}><Ionicons name="close-outline" size={theme.iconSize.md} color={CLEAN.ink} /></Pressable>
          </View> : <TextInput value={draft} onChangeText={setDraft} placeholder={t('sonim.placeholder')} placeholderTextColor={CLEAN.muted} selectionColor={CLEAN.text} multiline maxLength={ASSISTANT_MAX_CHARS} textAlign={theme.isRTL ? 'right' : 'left'} style={[theme.text('label'), CLEAN_TYPE, theme.direction, styles.input, { color: CLEAN.ink }]} testID="sonim-input" />}
          <View style={{ flexDirection: rowDir, alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { Keyboard.dismiss(); setAttachmentError(false); setAttachmentOpen(true); }} disabled={isStreaming || voiceBusy || attachments.length >= ASSISTANT_MAX_ATTACHMENTS} accessibilityRole="button" accessibilityLabel={t('sonim.attach')} style={styles.composerIconBtn} testID="sonim-attach"><Ionicons name="add-outline" size={theme.iconSize.md} color={CLEAN.ink} /></Pressable>
            <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 4 }}>
              <View style={{ width: 1, height: 24, backgroundColor: CLEAN.line }} />
              {recording.state === 'recording' ? <Pressable onPress={() => { void recording.finish(); }} accessibilityRole="button" accessibilityLabel={t('clean.finishRecording')} style={styles.composerIconBtn} testID="clean-recording-stop"><CleanActionGlyph state="recording" /></Pressable> : <>
                <Pressable onPress={() => { void recording.start(); }} disabled={isStreaming || voiceBusy || statusQuery.data?.voiceReady !== true} accessibilityRole="button" accessibilityLabel={t('clean.record')} style={styles.composerIconBtn} testID="clean-mic"><Ionicons name="mic-outline" size={theme.iconSize.md} color={CLEAN.ink} /></Pressable>
                <Pressable onPress={isStreaming ? stopGeneration : canSend ? () => { void sendPrompt(); } : () => { void recording.start(); }} disabled={voiceBusy || (!isStreaming && !canSend && statusQuery.data?.voiceReady !== true)} accessibilityRole="button" accessibilityLabel={isStreaming ? t('sonim.stop') : canSend ? t('sonim.send') : t('clean.record')} style={styles.composerIconBtn} testID={isStreaming ? 'sonim-stop' : 'sonim-send'}><CleanActionGlyph state={isStreaming || voiceBusy ? 'busy' : canSend ? 'send' : 'wave'} /></Pressable>
              </>}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View ref={keyboard.root} onLayout={keyboard.measure} style={[styles.root, { backgroundColor: CLEAN.paper, paddingBottom: keyboard.overlap }]}>
      {isFocused && <StatusBar barStyle="dark-content" />}
      {content}

      <Drawer surfaceColor={CLEAN.paper} visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <View
          style={[
            styles.drawerHeader,
            {
              flexDirection: rowDir,
              borderBottomColor: theme.colors.line,
            },
          ]}
        >
          <CleanWordmark />
          <Pressable
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [
              styles.headerBtn,
              { opacity: pressed ? theme.opacity.subtle : 1 },
            ]}
          >
            <Ionicons name="close-outline" size={theme.iconSize.md} color={CLEAN.ink} accessibilityElementsHidden />
          </Pressable>
        </View>

      </Drawer>
      <AppSheet surfaceColor={CLEAN.paper} open={attachmentOpen} onDismiss={() => setAttachmentOpen(false)} presentation="bottom"
        header={<View style={[styles.drawerHeader, { flexDirection: rowDir, borderBottomColor: CLEAN.line }]}><AppText style={CLEAN_TYPE} color={CLEAN.ink}>{t('sonim.attach')}</AppText><Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setAttachmentOpen(false)} style={styles.headerBtn}><Ionicons name="close-outline" size={theme.iconSize.md} color={CLEAN.ink} /></Pressable></View>}>
        {([
          ['camera', 'camera-outline', t('sonim.camera'), () => { void openCamera(); }],
          ['aywebs', 'search-outline', 'AYWEBs', () => router.push('/(tabs)/aywebs')],
          ['lens', 'scan-outline', 'Lens', () => router.push('/lens')],
          ['gallery', 'image-outline', t('sonim.gallery'), () => { void pickImage('gallery'); }],
          ['files', 'attach-outline', t('clean.files'), () => { void pickFile(); }],
        ] as const).map(([id, icon, label, action]) => <Pressable key={id} testID={`sonim-attach-${id}`} accessibilityRole="button" onPress={() => { setAttachmentOpen(false); action(); }} style={[styles.attachmentAction, { flexDirection: rowDir }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: CLEAN.line, alignItems: 'center', justifyContent: 'center' }}>{id === 'aywebs' || id === 'lens' ? <ReferenceNavigationGlyph kind={id === 'aywebs' ? 'search' : 'lens'} size={theme.iconSize.md} color={CLEAN.ink} /> : <Ionicons name={icon} size={theme.iconSize.md} color={CLEAN.ink} />}</View>
          <AppText variant="body" style={CLEAN_TYPE} color={CLEAN.ink}>{label}</AppText>
        </Pressable>)}
      </AppSheet>
      {cameraOpen && <CleanCameraPanel key={`${owner}:${conversationId}`} onClose={closeCamera} onPhoto={acceptPhoto} />}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  sonimHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  drawerHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16, gap: 16 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandBadge: { alignItems: 'center', gap: 8 },
  resetButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 6,
  },
  noticeBanner: { borderWidth: 1, padding: 12 },
  welcomeWrap: { alignItems: 'flex-start', paddingTop: 12, gap: 10 },
  heroMarkWrap: {
    width: 64,
    height: 64,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  welcomeBody: { maxWidth: 340 },
  actionsGrid: { width: '100%', gap: 10, marginTop: 12 },
  actionCard: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  messageList: { gap: 12 },
  userRow: { gap: 8 },
  attachmentRow: { gap: 8, flexWrap: 'wrap' },
  sentThumbWrap: { width: 96, height: 96, borderWidth: 1, overflow: 'hidden' },
  sentThumb: { width: '100%', height: '100%' },
  userBubble: { maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 10 },
  assistantRow: { width: '100%' },
  assistantBubble: { flex: 1, minWidth: 0, gap: 8 },
  assistantHead: { alignItems: 'center', gap: 6 },
  statusRow: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  errorBox: { borderWidth: 1, padding: 10 },
  messageActions: { paddingTop: 4 },
  copyBtn: { alignItems: 'center', gap: 4, paddingVertical: 2 },
  composerOuter: { borderTopWidth: 1, paddingTop: 8, gap: 8 },
  pendingAttachments: { gap: 8, flexWrap: 'wrap' },
  pendingThumbCard: {
    borderWidth: 1,
    padding: 4,
    alignItems: 'center',
    gap: 6,
  },
  pendingThumb: { width: 44, height: 44 },
  composerBox: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  retryAction: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  attachmentAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  composerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 36,
    maxHeight: 112,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  sendCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
