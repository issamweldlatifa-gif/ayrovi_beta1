/**
 * المساعد الذكي — P5، الشريحة 4: محادثة حقيقية على تيّار SSE.
 *
 * قواعد الصدق:
 *  • **ما نصنعوش ردّاً**: النصّ يتجمّع من `delta` وحدها. كان التيّار انقطع بلا
 *    `done`، نقولوها — ما نكمّلوش الكلام من عندنا.
 *  • **الحالة من الخادم**: `state` (thinking/analyzing/reasoning/creating)
 *    تتعرض كما هي؛ والخطأ بكوده ونصّه.
 *  • **المساعد ما هوش جاهز ⇒ تقال**: `GET /status` و`503` يوصلوا لنفس الجملة،
 *    بلا صندوق دردشة يبعث رسائل ما يوصلش ردّها.
 *  • **التوقيف بيد المستعمل**: زرّ «وقّف» يقطع التيّار فعلاً (abort).
 *  • التيّار يتقرا بـ`expo/fetch` (React Native ما يعطيش `body` متاع تيّار في
 *    `fetch` العادي) — وهذا هو الحدّ الوحيد اللي يلمس الجهاز.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Button, Card, Field } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  fetchAssistantStatus, newAssistantConversationId, streamAssistantChat,
  type AssistantEvent, type AssistantState, type StreamFetch,
} from '@/api/assistant';
import { useAyWebsSessionId } from '@/features/aywebs/session';

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** رسالة خطأ العرض: تتلوّن، وما تتعرضش كجواب. */
  failed?: boolean;
}

export default function AssistantScreen() {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const insets = useSafeAreaInsets();
  const sessionId = useAyWebsSessionId();

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<AssistantState | ''>('');
  const [tool, setTool] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [note, setNote] = useState('');
  const [ready, setReady] = useState<boolean | null>(null);

  const streamRef = useRef<{ abort: () => void } | null>(null);
  const conversationId = useMemo(() => newAssistantConversationId(() => Crypto.randomUUID()), []);
  const scrollRef = useRef<ScrollView | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const status = await fetchAssistantStatus();
      setReady(status.ready);
      setNote(status.ready ? '' : t('assistant.notReady'));
    } catch (error) {
      setReady(false);
      setNote(isApiError(error) ? userMessage(error)[locale] : t('assistant.statusFailed'));
    }
  }, [locale, t]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const pushDelta = useCallback((text: string) => {
    setBubbles((current) => {
      const last = current.at(-1);
      if (!last || last.role !== 'assistant' || last.failed) {
        return [...current, { id: `a-${Date.now()}-${current.length}`, role: 'assistant', text }];
      }
      return [...current.slice(0, -1), { ...last, text: last.text + text }];
    });
  }, []);

  const onEvent = useCallback((event: AssistantEvent) => {
    if (event.type === 'delta') pushDelta(event.text);
    else if (event.type === 'state') setState(event.state);
    else if (event.type === 'tool') setTool(event.name);
    else if (event.type === 'done') { setState(''); setTool(''); }
    else if (event.type === 'error') {
      setState('');
      setTool('');
      setBubbles((current) => [...current, {
        id: `e-${Date.now()}`, role: 'assistant', text: event.message || event.code, failed: true,
      }]);
    }
  }, [pushDelta]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !sessionId || streaming) return;
    const history = [...bubbles.filter((bubble) => !bubble.failed).map((bubble) => ({ role: bubble.role, text: bubble.text })), { role: 'user' as const, text }];
    setBubbles((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text }]);
    setDraft('');
    setNote('');
    setStreaming(true);

    const run = streamAssistantChat(
      { conversationId, sessionId, messages: history },
      onEvent,
      { fetchImpl: expoFetch as unknown as StreamFetch },
    );
    streamRef.current = run;
    void run.finished
      .then((outcome) => {
        if (outcome === 'error') setNote(t('assistant.streamBroken'));
      })
      .catch((error) => {
        setNote(isApiError(error) ? userMessage(error)[locale] : t('assistant.streamBroken'));
      })
      .finally(() => { setStreaming(false); setState(''); setTool(''); streamRef.current = null; });
  }, [bubbles, conversationId, draft, locale, onEvent, sessionId, streaming, t]);

  const stop = useCallback(() => {
    streamRef.current?.abort();
    setStreaming(false);
    setState('');
    setTool('');
  }, []);

  const stateText = (value: AssistantState): string => {
    switch (value) {
      case 'thinking': return t('assistant.state.thinking');
      case 'analyzing': return t('assistant.state.analyzing');
      case 'reasoning': return t('assistant.state.reasoning');
      default: return t('assistant.state.creating');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + theme.space[2], paddingHorizontal: theme.space[3] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.title')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{t('assistant.title')}</AppText>
          <AppText variant="caption" color={theme.colors.muted}>{t('assistant.hint')}</AppText>
        </View>
        {streaming ? (
          <Button label={t('assistant.stop')} tone="quiet" onPress={stop} />
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingHorizontal: theme.space[3], paddingBottom: theme.space[3], gap: theme.space[2] }}
      >
        {ready === false ? (
          <Card title={t('assistant.unavailableTitle')}>
            <AppText variant="body">{note || t('assistant.notReady')}</AppText>
            <Button label={t('assistant.retry')} tone="quiet" onPress={() => { setReady(null); void checkStatus(); }} />
          </Card>
        ) : null}

        {ready !== false && bubbles.length === 0 ? (
          <Card>
            <AppText variant="body">{t('assistant.empty')}</AppText>
            <AppText variant="caption" color={theme.colors.muted}>{t('assistant.emptyHint')}</AppText>
          </Card>
        ) : null}

        {bubbles.map((bubble) => (
          <View
            key={bubble.id}
            style={[
              styles.bubble,
              {
                alignSelf: bubble.role === 'user' ? 'flex-end' : 'flex-start',
                borderRadius: theme.radius.card,
                backgroundColor: bubble.role === 'user' ? theme.colors.action : theme.colors.surface,
                borderColor: bubble.failed ? theme.colors.danger : theme.colors.line,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <AppText
              variant="body"
              color={bubble.role === 'user' ? theme.colors.onAction : bubble.failed ? theme.colors.danger : theme.colors.ink}
            >
              {bubble.text || '…'}
            </AppText>
          </View>
        ))}

        {streaming && (state || tool) ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {state ? stateText(state) : ''}{state && tool ? ' · ' : ''}{tool}
          </AppText>
        ) : null}
        {ready !== false && note && bubbles.length > 0 ? (
          <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">{note}</AppText>
        ) : null}
      </ScrollView>

      <View style={[styles.composer, {
        paddingHorizontal: theme.space[3],
        paddingBottom: insets.bottom + theme.space[2],
        borderTopColor: theme.colors.line,
      }]}>
        <Field
          label={t('assistant.input')}
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={ready !== false && Boolean(sessionId)}
          placeholder={t('assistant.placeholder')}
        />
        <Button
          label={t('assistant.send')}
          onPress={send}
          busy={streaming}
          disabled={streaming || ready === false || !sessionId || draft.trim().length < 2}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 8 },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, maxWidth: '92%' },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 6 },
});
