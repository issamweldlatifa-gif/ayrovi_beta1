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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  ASSISTANT_MAX_ATTACHMENTS,
  fetchAssistantStatus,
  newAssistantConversationId,
  streamAssistantChat,
  type AssistantAttachment,
  type AssistantState,
  type StreamFetch,
} from '@/api/assistant';
import { AppImage } from '@/design/appImage';
import { headerSolidFor } from '@/design/chromeLogic';
import { useResponsive } from '@/design/layout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { TabSonimIcon } from '@/design/TabNavIcons';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useKeyboardInset } from '@/design/useKeyboardInset';
import { AppHeader } from '@/features/shell/AppHeader';
import { useI18n } from '@/i18n';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import {
  applySonimToolEvent,
  cleanSonimText,
  sonimStateTranslationKey,
  type SonimChatMessage,
} from './sonimModel';
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
  const { locale, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { gutter } = useResponsive();
  const sessionId = useSessionId();
  const { account } = useSession();
  const keyboardInset = useKeyboardInset(true);
  const keyboardOpen = keyboardInset > 0;

  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [conversationId, setConversationId] = useState(() => newAssistantConversationId());
  const [messages, setMessages] = useState<SonimChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [streamingState, setStreamingState] = useState<AssistantState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusQuery = useQuery({
    queryKey: ['assistant-status'],
    queryFn: ({ signal }) => fetchAssistantStatus({ signal }),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => () => {
    abortRef.current?.();
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const firstName = useMemo(() => {
    const raw = account?.displayName?.trim() ?? '';
    return raw ? raw.split(/\s+/)[0] : '';
  }, [account?.displayName]);

  const rowDir = rowDirectionFor(theme.isRTL);
  const topInset = insets.top + theme.chrome.header;
  const floatingTabClearance =
    theme.chrome.tabBar - theme.space[0] + Math.max(insets.bottom, theme.space[1]) + theme.space[1];

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setIsStreaming(false);
    setStreamingState(null);
  }, []);

  const startNewChat = useCallback(() => {
    stopGeneration();
    setMessages([]);
    setAttachments([]);
    setDraft('');
    setConversationId(newAssistantConversationId());
  }, [stopGeneration]);

  const sendPrompt = useCallback(
    async (explicitPrompt?: string) => {
      if (isStreaming || !sessionId) return;
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

      const fetchImpl = await resolveNativeStreamFetch();
      let receivedError = false;

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
      try {
        const outcome = await stream.finished;
        if (outcome === 'error' && !receivedError) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && !msg.errorText
                ? { ...msg, errorText: t('sonim.error.stream') }
                : msg,
            ),
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId && !msg.errorText
              ? { ...msg, errorText: t('sonim.error.stream') }
              : msg,
          ),
        );
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setStreamingState(null);
      }
    },
    [attachments, conversationId, draft, isStreaming, locale, messages, scrollToEnd, sessionId, t],
  );

  const pickImage = useCallback(async () => {
    if (attachments.length >= ASSISTANT_MAX_ATTACHMENTS || isStreaming) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.78,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const prepared = await prepareAttachment(result.assets[0]);
      if (prepared) {
        setAttachments((prev) => [...prev.slice(0, ASSISTANT_MAX_ATTACHMENTS - 1), prepared]);
      }
    } catch {
      // Galerie refusée ou fermée : aucun blocage.
    }
  }, [attachments.length, isStreaming]);

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

  const canSend = (draft.trim().length > 0 || attachments.length > 0) && Boolean(sessionId);
  const assistantOffline = statusQuery.data?.ready === false;

  const content = (
    <View style={styles.body}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + theme.space[2], paddingHorizontal: gutter },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const next = headerSolidFor(event.nativeEvent.contentOffset.y);
          setHeaderScrolled((current) => (current === next ? current : next));
        }}
        testID="sonim-scroll"
      >
        {messages.length > 0 ? (
          <View style={[styles.topBar, { flexDirection: rowDir }]}>
            <View style={[styles.brandBadge, { flexDirection: rowDir }]}>
              <TabSonimIcon size={theme.iconSize.sm} color={theme.colors.ink} focused />
              <AppText variant="label" weight="bold">
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
              <AppText variant="caption" weight="semibold">
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
            <AppText variant="caption" weight="semibold" color={theme.status.warning.fg}>
              {t('sonim.unavailable')}
            </AppText>
          </View>
        ) : null}

        {messages.length === 0 ? (
          <View style={styles.welcomeWrap} testID="sonim-welcome">
            <View
              style={[
                styles.heroMarkWrap,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.line,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <TabSonimIcon size={theme.iconSize.lg} color={theme.colors.ink} focused />
            </View>

            <AppText variant="title" weight="semibold" align="center">
              {firstName ? t('sonim.greetingNamed', { name: firstName }) : t('sonim.greeting')}
            </AppText>
            <AppText variant="lead" weight="bold" align="center">
              {t('sonim.subtitle')}
            </AppText>
            <AppText variant="body" color={theme.colors.muted} align="center" style={styles.welcomeBody}>
              {t('sonim.body')}
            </AppText>

            <View style={styles.actionsGrid}>
              {quickActions.map((action) => (
                <Pressable
                  key={action.id}
                  onPress={action.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.title} — ${action.subtitle}`}
                  style={({ pressed }) => [
                    styles.actionCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.line,
                      borderRadius: theme.radius.card,
                      opacity: pressed ? theme.opacity.subtle : 1,
                    },
                  ]}
                  testID={`sonim-action-${action.id}`}
                >
                  <View
                    style={[
                      styles.actionIconWrap,
                      {
                        backgroundColor: theme.colors.canvas,
                        borderColor: theme.colors.line,
                        borderRadius: theme.radius.control,
                      },
                    ]}
                  >
                    <Ionicons name={action.icon} size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
                  </View>
                  <AppText variant="label" weight="bold">
                    {action.title}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.muted}>
                    {action.subtitle}
                  </AppText>
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
                      { alignItems: theme.isRTL ? 'flex-start' : 'flex-end' },
                    ]}
                  >
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
                    <View
                      style={[
                        styles.userBubble,
                        {
                          backgroundColor: theme.colors.ink,
                          borderRadius: theme.radius.lg,
                        },
                      ]}
                    >
                      <AppText variant="body" color={theme.colors.canvas}>
                        {displayText}
                      </AppText>
                    </View>
                  </View>
                );
              }

              return (
                <View key={message.id} style={styles.assistantRow}>
                  <View
                    style={[
                      styles.assistantBubble,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.line,
                        borderRadius: theme.radius.card,
                      },
                    ]}
                  >
                    <View style={[styles.assistantHead, { flexDirection: rowDir }]}>
                      <TabSonimIcon size={theme.iconSize.xs} color={theme.colors.ink} focused />
                      <AppText variant="caption" weight="bold">
                        {t('tabs.sonim')}
                      </AppText>
                    </View>

                    {displayText ? (
                      <AppText variant="body">{displayText}</AppText>
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
                        <AppText variant="caption" weight="semibold" color={theme.status.danger.fg}>
                          {message.errorText}
                        </AppText>
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
                            name={copiedId === message.id ? 'checkmark' : 'copy-outline'}
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
            backgroundColor: theme.colors.canvas,
            borderTopColor: theme.colors.line,
            paddingHorizontal: gutter,
            paddingBottom: keyboardOpen ? theme.space[1] : floatingTabClearance,
          },
        ]}
      >
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
                  <Ionicons name="close-circle" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View
          style={[
            styles.composerBox,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.lineControl,
              borderRadius: theme.radius.xl,
              flexDirection: rowDir,
            },
          ]}
        >
          <Pressable
            onPress={() => { void pickImage(); }}
            disabled={isStreaming || attachments.length >= ASSISTANT_MAX_ATTACHMENTS}
            accessibilityRole="button"
            accessibilityLabel={t('sonim.attach')}
            style={({ pressed }) => [
              styles.composerIconBtn,
              {
                opacity:
                  isStreaming || attachments.length >= ASSISTANT_MAX_ATTACHMENTS
                    ? theme.opacity.disabled
                    : pressed
                      ? theme.opacity.subtle
                      : 1,
              },
            ]}
            testID="sonim-attach"
          >
            <Ionicons name="image-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('sonim.placeholder')}
            placeholderTextColor={theme.colors.muted}
            selectionColor={theme.colors.selection}
            multiline
            maxLength={4000}
            textAlign={theme.isRTL ? 'right' : 'left'}
            style={[
              theme.text('body'),
              theme.direction,
              styles.input,
              { color: theme.colors.ink },
            ]}
            testID="sonim-input"
          />

          {isStreaming ? (
            <Pressable
              onPress={stopGeneration}
              accessibilityRole="button"
              accessibilityLabel={t('sonim.stop')}
              style={({ pressed }) => [
                styles.sendCircle,
                {
                  backgroundColor: theme.colors.ink,
                  borderRadius: theme.radius.full,
                  opacity: pressed ? theme.opacity.subtle : 1,
                },
              ]}
              testID="sonim-stop"
            >
              <Ionicons name="close" size={theme.iconSize.sm} color={theme.colors.canvas} accessibilityElementsHidden />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { void sendPrompt(); }}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={t('sonim.send')}
              style={({ pressed }) => [
                styles.sendCircle,
                {
                  backgroundColor: canSend ? theme.colors.ink : theme.colors.disabled,
                  borderRadius: theme.radius.full,
                  opacity: pressed ? theme.opacity.subtle : 1,
                },
              ]}
              testID="sonim-send"
            >
              <Ionicons
                name="arrow-up-outline"
                size={theme.iconSize.sm}
                color={canSend ? theme.colors.canvas : theme.colors.disabledText}
                accessibilityElementsHidden
              />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.body} behavior="padding">
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
      <AppHeader scrolled={headerScrolled} showNotifications={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
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
  welcomeWrap: { alignItems: 'center', paddingTop: 12, gap: 10 },
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
  actionCard: { borderWidth: 1, padding: 12, gap: 4 },
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
  userBubble: { maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 10 },
  assistantRow: { width: '100%' },
  assistantBubble: { borderWidth: 1, padding: 12, gap: 8 },
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
    alignItems: 'flex-end',
    gap: 8,
  },
  composerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
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
