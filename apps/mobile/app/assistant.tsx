/**
 * SONIM BETA — L'assistant IA d'AYROVI.
 *
 * Le moteur existait déjà (SSE réel, `expo/fetch`, états du serveur, arrêt par
 * la personne) ; ce qui manquait était l'IDENTITÉ et le parcours : un nom, une
 * marque, des amorces, un menu, un historique. Le flux n'a pas été réécrit :
 * il a été habillé, sans qu'une seule règle de vérité en soit assouplie.
 *
 * Règles de vérité — inchangées, et elles sont toute la valeur de l'écran :
 *  • **aucune réponse inventée** : le texte vient des `delta` du serveur, un
 *    seul mot de nous serait un mensonge présenté comme une réponse ;
 *  • **l'état vient du serveur** (`thinking/analyzing/reasoning/creating`) et
 *    l'erreur s'affiche avec son code, jamais travestie en réponse ;
 *  • **assistant indisponible ⇒ dit** : `GET /status` faux ou 503 mènent à la
 *    même phrase, au lieu d'une boîte de dialogue qui envoie dans le vide ;
 *  • **l'arrêt est réel** : le bouton coupe le flux (abort), il ne le masque pas.
 *
 * Ce que Q6 ajoute, et pourquoi :
 *  • **une marque dessinée ici** (`SonimMark`) — pas d'image importée ;
 *  • **des amorces** : face à un champ vide, personne ne sait ce que
 *    l'assistant SAIT faire. Une amorce REMPLIT le champ, elle ne répond pas à
 *    la place de la personne ;
 *  • **un menu** (nouvelle discussion · historique · ma commande · AYROVIX ·
 *    réglages) dont chaque entrée mène à un écran qui EXISTE, vérifié ;
 *  • **un historique local** : il n'y a pas d'endpoint d'historique serveur.
 *    Plutôt que de fabriquer une entrée morte, on conserve les discussions sur
 *    l'appareil — une fonctionnalité réelle, qui marche aujourd'hui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText, Card } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor, startAlignFor } from '@/design/layoutLogic';
import { useI18n, useT } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';
import {
  fetchAssistantStatus, newAssistantConversationId, streamAssistantChat,
  type AssistantEvent, type AssistantState, type StreamFetch,
} from '@/api/assistant';
import { useAyWebsSessionId } from '@/features/aywebs/session';
import { SonimMark } from '@/features/sonim/SonimMark';
import { SonimChips, type SonimChip } from '@/features/sonim/SonimChips';
import { SonimMenu } from '@/features/sonim/SonimMenu';
import {
  loadSonimThreads, saveSonimThreads, sonimTitle, upsertSonimThread,
  type SonimThread,
} from '@/features/sonim/history';

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Message d'échec : coloré, et jamais présenté comme une réponse. */
  failed?: boolean;
}

/** Hauteur de la barre de saisie — tenue à 52 pt, comme la maquette. */
const COMPOSER_HEIGHT = 52;

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [threads, setThreads] = useState<SonimThread[]>([]);

  /**
   * La conversation est un ÉTAT et non plus une valeur figée : « nouvelle
   * discussion » doit pouvoir en changer sans recréer l'écran.
   */
  const [conversationId, setConversationId] = useState(() => newAssistantConversationId(() => Crypto.randomUUID()));

  const streamRef = useRef<{ abort: () => void } | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  /* ── Historique : chargé à l'ouverture, sauvegardé à chaque réponse finie ── */

  useEffect(() => { void loadSonimThreads().then(setThreads); }, []);

  const currentThread = useCallback((messages: Bubble[]): SonimThread | null => {
    const clean = messages
      .filter((bubble) => !bubble.failed)
      .map((bubble) => ({ role: bubble.role, text: bubble.text }));
    // Rien à garder : une discussion sans question de la personne n'a pas de
    // titre possible, et un historique plein de « Nouvelle discussion » vides
    // est pire qu'un historique vide.
    if (!clean.some((message) => message.role === 'user' && message.text.trim())) return null;
    return { id: conversationId, title: sonimTitle(clean), updatedAt: Date.now(), messages: clean };
  }, [conversationId]);

  useEffect(() => {
    if (streaming) return; // on n'écrit pas un fil pendant qu'il se remplit
    const thread = currentThread(bubbles);
    if (!thread) return;
    setThreads((current) => {
      const next = upsertSonimThread(current, thread);
      void saveSonimThreads(next);
      return next;
    });
  }, [bubbles, currentThread, streaming]);

  /* ── Statut ─────────────────────────────────────────────────────────────── */

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

  /* ── Flux ───────────────────────────────────────────────────────────────── */

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
    const history = [
      ...bubbles.filter((bubble) => !bubble.failed).map((bubble) => ({ role: bubble.role, text: bubble.text })),
      { role: 'user' as const, text },
    ];
    setBubbles((current) => [...current, { id: `u-${Date.now()}-${current.length}`, role: 'user', text }]);
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

  /* ── Menu ───────────────────────────────────────────────────────────────── */

  const newChat = useCallback(() => {
    stop();
    // La discussion en cours est déjà dans l'historique (effet de sauvegarde) :
    // on ne fait que repartir d'un fil neuf.
    setConversationId(newAssistantConversationId(() => Crypto.randomUUID()));
    setBubbles([]);
    setNote('');
  }, [stop]);

  const openThread = useCallback((thread: SonimThread) => {
    stop();
    setConversationId(thread.id);
    setBubbles(thread.messages.map((message, index) => ({
      id: `${thread.id}-${index}`,
      role: message.role === 'user' ? 'user' : 'assistant',
      text: message.text,
    })));
    setNote('');
  }, [stop]);

  /* ── Présentation ───────────────────────────────────────────────────────── */

  const chips = useMemo<SonimChip[]>(() => [
    { id: 'find', label: t('sonim.chip.find'), icon: 'search-outline' },
    { id: 'order', label: t('sonim.chip.order'), icon: 'receipt-outline' },
    { id: 'compare', label: t('sonim.chip.compare'), icon: 'git-compare-outline' },
    { id: 'pay', label: t('sonim.chip.pay'), icon: 'card-outline' },
  ], [t]);

  const stateText = (value: AssistantState): string => {
    switch (value) {
      case 'thinking': return t('assistant.state.thinking');
      case 'analyzing': return t('assistant.state.analyzing');
      case 'reasoning': return t('assistant.state.reasoning');
      default: return t('assistant.state.creating');
    }
  };

  const composerEnabled = ready !== false && Boolean(sessionId) && !streaming;
  const canSend = composerEnabled && draft.trim().length >= 2;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SonimMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNewChat={newChat}
        onOpenThread={openThread}
        threads={threads}
      />

      <View style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL), paddingTop: insets.top + theme.space[2], paddingHorizontal: theme.space[3] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('sonim.menu.settings')}
          onPress={() => setMenuOpen(true)}
          style={styles.headerButton}
        >
          <Ionicons name="menu" size={24} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>

        <View style={{ flex: 1 }}>
          <SonimMark withPhase phase={t('sonim.phase')} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.headerButton}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            size={24}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>

      <SonimChips chips={chips} onPick={(chip) => setDraft(chip.label)} disabled={streaming} />

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingHorizontal: theme.space[3], paddingBottom: theme.space[3], gap: theme.space[2] }}
      >
        {ready === false ? (
          <Card title={t('assistant.unavailableTitle')}>
            <AppText variant="body">{note || t('assistant.notReady')}</AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setReady(null); void checkStatus(); }}
              style={[styles.retry, { alignItems: startAlignFor(theme.isRTL) }, { minHeight: theme.geometry.minTarget }]}
            >
              <AppText variant="label" weight="bold" color={theme.status.warning.fg}>{t('assistant.retry')}</AppText>
            </Pressable>
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
                borderColor: bubble.failed ? theme.status.danger.fg : theme.colors.line,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <AppText
              variant="body"
              color={bubble.role === 'user' ? theme.colors.onAction : bubble.failed ? theme.status.danger.fg : theme.colors.ink}
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
          <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">{note}</AppText>
        ) : null}
      </ScrollView>

      {/* Barre de saisie : 52 pt, une ligne, bouton circulaire centré. */}
      <View style={[styles.composer, {
        flexDirection: rowDirectionFor(theme.isRTL),
        paddingBottom: insets.bottom,
        paddingHorizontal: theme.space[3],
        borderTopColor: theme.colors.line,
        backgroundColor: theme.colors.canvas,
      }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('assistant.placeholder')}
          placeholderTextColor={theme.colors.muted}
          accessibilityLabel={t('assistant.input')}
          editable={composerEnabled}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={canSend ? send : undefined}
          style={[styles.input, {
            borderRadius: theme.radius.cta,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            color: theme.colors.ink,
          }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={streaming ? t('assistant.stop') : t('assistant.send')}
          onPress={streaming ? stop : send}
          disabled={!streaming && !canSend}
          style={({ pressed }) => [styles.send, {
            backgroundColor: streaming ? theme.status.danger.fg : theme.colors.accent,
            opacity: !streaming && !canSend ? 0.45 : pressed ? 0.85 : 1,
          }]}
        >
          <Ionicons name={streaming ? 'stop' : 'arrow-up'} size={20} color={theme.colors.onAccent} accessibilityElementsHidden />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 4, paddingBottom: 8 },
  headerButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, maxWidth: '92%' },
  retry: { alignItems: 'flex-start', justifyContent: 'center' },
  composer: { alignItems: 'center', gap: 8, height: COMPOSER_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 40, paddingHorizontal: 12, paddingVertical: 0, borderWidth: StyleSheet.hairlineWidth, textAlignVertical: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
