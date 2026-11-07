import {
  PUBLICATION_THEME as P,
  RADIUS,
  ICON_SIZE,
  OPACITY,
} from '@/design/tokens.mobile';
/** One persisted conversation per target, shared by feed and fullscreen viewer. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BrandIcon from '@expo/vector-icons/Ionicons';
import {
  PublicationText,
  PublicationIcon,
  PUBLICATION_PALETTE as SP,
  publicationTextStyle,
} from '@/features/publications/publicationDesign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText as BrandText, useFieldChrome } from '@/design/ui';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import {
  fetchComments,
  sendInteraction,
  type SocialComment,
} from '@/api/social';
import { isApiError, userMessage } from '@/api/errors';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';
import { PublicationAuthSheet } from '@/features/publications/PublicationAuthSheet';
import { PUBLICATION_SOCIAL_SURFACE } from '../../../../../shared/publicationPresentation';
const drafts = new Map<string, string>();
const attempts = new Map<string, string>();
const draftReplies = new Map<string, SocialComment | null>();
export interface CommentsProps {
  targetId: string;
  publication?: boolean;
  focusRequest?: number;
  header?: ReactNode;
  onScroll?: (offset: number) => void;
}
export function Comments({
  targetId,
  publication = false,
  header,
  onScroll,
  focusRequest = 0,
}: CommentsProps) {
  const theme = useTheme();
  const field = useFieldChrome();
  const t = useT();
  const { locale } = useI18n();
  const AppText = publication ? PublicationText : BrandText;
  const Ionicons = publication ? PublicationIcon : BrandIcon;
  const muted = publication ? SP.muted : theme.colors.muted;
  const ar = locale === 'ar';
  const session = useSession();
  const guest = useSessionId();
  const client = useQueryClient();
  const owner =
    session.status === 'signedIn' ? session.account?.id || 'guest' : 'guest';
  const key = `publication-comment-draft:${owner}:${targetId}`;
  const [draft, setDraft] = useState(drafts.get(key) || '');
  const [reply, setReply] = useState<SocialComment | null>(
    draftReplies.get(key) || null
  );
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState('');
  const edited = useRef(false);
  const input = useRef<TextInput>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!focusRequest) return;
    if (session.status === 'signedIn') input.current?.focus();
    else setAuth(true);
  }, [focusRequest]);
  useEffect(() => {
    let live = true;
    edited.current = false;
    setDraft(drafts.get(key) || '');
    setReply(draftReplies.get(key) || null);
    setError('');
    if (!drafts.has(key))
      void AsyncStorage.getItem(key)
        .then((v) => {
          if (live && !edited.current && v) {
            let value = {
              text: v,
              reply: null as SocialComment | null,
              requestId: '',
            };
            try {
              const parsed = JSON.parse(v);
              if (typeof parsed?.text === 'string')
                value = {
                  text: parsed.text,
                  reply: parsed.reply?.id ? parsed.reply : null,
                  requestId:
                    typeof parsed.requestId === 'string'
                      ? parsed.requestId
                      : '',
                };
            } catch {
              /* legacy text draft */
            }
            drafts.set(key, value.text);
            draftReplies.set(key, value.reply);
            setDraft(value.text);
            setReply(value.reply);
            if (value.requestId) attempts.set(key, value.requestId);
          }
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  const change = (value: string, targetReply: SocialComment | null = reply) => {
    attempts.delete(key);
    edited.current = true;
    setDraft(value);
    drafts.set(key, value);
    draftReplies.set(key, targetReply);
    void AsyncStorage.setItem(
      key,
      JSON.stringify({ text: value, reply: targetReply })
    ).catch(() => {});
  };
  const comments = useQuery({
    queryKey: ['social', 'comments', targetId],
    queryFn: ({ signal }) => fetchComments(targetId, { signal }),
  });
  const post = useMutation({
    mutationFn: async () => {
      if (lock.current) throw new Error('Envoi en cours');
      lock.current = true;
      if (!attempts.has(key))
        attempts.set(
          key,
          `comment_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2)}`
        );
      void AsyncStorage.setItem(
        key,
        JSON.stringify({ text: draft, reply, requestId: attempts.get(key) })
      ).catch(() => {});
      try {
        return await sendInteraction({
          type: 'comment',
          clientRequestId: attempts.get(key),
          targetId,
          text: draft,
          parentId: reply?.id,
          sessionId: guest || undefined,
        });
      } finally {
        lock.current = false;
      }
    },
    onSuccess: (r) => {
      change('', null);
      setReply(null);
      setError('');
      if (r.comment)
        client.setQueryData<SocialComment[]>(
          ['social', 'comments', targetId],
          (prev) => [
            ...(prev || []).filter((v) => v.id !== r.comment!.id),
            r.comment!,
          ]
        );
      void client.invalidateQueries({
        queryKey: ['social', 'comments', targetId],
      });
      void client.invalidateQueries({ queryKey: ['social', 'counts'] });
      void client.invalidateQueries({ queryKey: ['publication-feed'] });
    },
    onError: (e) => {
      if (isApiError(e) && e.status === 401) setAuth(true);
      setError(
        isApiError(e)
          ? userMessage(e)[ar ? 'ar' : 'fr']
          : ar
          ? 'تعذّر الإرسال. النص محفوظ، أعد المحاولة.'
          : 'Envoi impossible. Votre texte est conservé, réessayez.'
      );
    },
  });
  const rows = comments.data || [];
  const signed = session.status === 'signedIn';
  const feedback = (
    <>
      {comments.isPending ? (
        <LoadingSpinner
          size="sm"
          color={publication ? SP.icon : undefined}
          testID="comments-loading-spinner"
        />
      ) : null}
      {comments.isError ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void comments.refetch()}
          style={{ minHeight: 44 }}
        >
          <AppText>{t('social.retry')}</AppText>
        </Pressable>
      ) : null}
      {!comments.isPending && !comments.isError && !rows.length ? (
        <AppText variant="caption" color={muted}>
          {t('social.noComments')}
        </AppText>
      ) : null}
    </>
  );
  return (
    <View style={{ flex: 1, minHeight: 120, gap: 8 }}>
      {header ? null : feedback}
      <FlatList
        style={{ flex: 1 }}
        onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        data={rows}
        ItemSeparatorComponent={
          publication
            ? () => <View style={{ height: 1, backgroundColor: SP.line }} />
            : undefined
        }
        ListHeaderComponent={header ? <View>{header}</View> : null}
        ListFooterComponent={
          header ? (
            <View style={{ paddingHorizontal: 12 }}>{feedback}</View>
          ) : null
        }
        keyExtractor={(v) => v.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 12, paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: ar ? 'row-reverse' : 'row',
              gap: 8,
              marginLeft: item.parentId ? 20 : 0,
              ...(publication
                ? { paddingHorizontal: 12, paddingBottom: 12 }
                : {}),
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: RADIUS.lg,
                backgroundColor: publication
                  ? SP.neutral
                  : PUBLICATION_SOCIAL_SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="captionStrong">
                {item.author.slice(0, 1)}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View
                style={{
                  backgroundColor: publication ? SP.paper : P.commentPaper,
                  borderRadius: publication ? 0 : RADIUS.lg,
                  padding: publication ? 0 : 10,
                  gap: 4,
                }}
              >
                <AppText variant={publication ? 'bodyStrong' : 'captionStrong'}>
                  {item.author}
                </AppText>
                {item.parentId ? (
                  <AppText variant="caption" color={muted}>
                    {ar ? 'رد على' : 'En réponse à'}{' '}
                    {rows.find((v) => v.id === item.parentId)?.author ||
                      (ar ? 'تعليق' : 'un commentaire')}
                  </AppText>
                ) : null}
                <AppText>{item.text}</AppText>
              </View>
              <View
                style={{
                  flexDirection: ar ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <AppText variant="caption" color={muted}>
                  {Number.isFinite(Date.parse(item.createdAt))
                    ? new Date(item.createdAt).toLocaleString(
                        ar ? 'ar-TN' : 'fr-TN',
                        {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )
                    : ''}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (!signed) {
                      setAuth(true);
                      return;
                    }
                    change(draft, item);
                    setReply(item);
                    input.current?.focus();
                  }}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <AppText variant="captionStrong">
                    {ar ? 'رد' : 'Répondre'}
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
      {reply ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <AppText variant="caption">
            {ar ? 'رد على' : 'Réponse à'} {reply.author}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'إلغاء الرد' : 'Annuler la réponse'}
            onPress={() => {
              change(draft, null);
              setReply(null);
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={ICON_SIZE.md} />
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          variant="caption"
          color={theme.status.danger.fg}
        >
          {error}
        </AppText>
      ) : null}
      {signed ? (
        <View
          style={{
            flexDirection: ar ? 'row-reverse' : 'row',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <TextInput
            ref={input}
            {...field.inputProps}
            value={draft}
            onChangeText={(value) => change(value)}
            placeholder={t('social.comment')}
            accessibilityLabel={ar ? 'اكتب تعليقًا' : 'Écrire un commentaire'}
            maxLength={500}
            multiline
            editable={!post.isPending}
            style={[
              publication ? publicationTextStyle(locale) : theme.text('body'),
              field.style,
              {
                flex: 1,
                ...(publication
                  ? {
                      ...publicationTextStyle(locale),
                      backgroundColor: SP.input,
                      color: SP.ink,
                      borderWidth: 0,
                    }
                  : {}),
                minHeight: 44,
                maxHeight: 120,
                padding: 12,
                borderRadius: RADIUS.full,
                textAlignVertical: 'top',
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              post.isPending
                ? ar
                  ? 'جار الإرسال'
                  : 'Envoi…'
                : t('social.send')
            }
            accessibilityState={{
              disabled: draft.trim().length < 2 || post.isPending,
            }}
            disabled={draft.trim().length < 2 || post.isPending}
            onPress={() => {
              setError('');
              post.mutate();
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              backgroundColor: publication ? SP.ink : theme.colors.accentText,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: draft.trim().length < 2 ? OPACITY.disabled : 1,
            }}
          >
            {post.isPending ? (
              <LoadingSpinner
                size="sm"
                color={publication ? SP.paper : undefined}
              />
            ) : (
              <Ionicons
                name="send-outline"
                size={ICON_SIZE.md}
                color={P.paper}
              />
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setAuth(true)}
          style={{
            minHeight: 48,
            borderRadius: RADIUS.full,
            padding: 12,
            backgroundColor: publication
              ? SP.neutral
              : PUBLICATION_SOCIAL_SURFACE,
          }}
        >
          <AppText>{t('social.needAccount')}</AppText>
        </Pressable>
      )}
      {draft.trim().length === 1 ? (
        <AppText variant="caption" color={theme.status.danger.fg}>
          {t('social.minLength')}
        </AppText>
      ) : null}
      <PublicationAuthSheet visible={auth} onClose={() => setAuth(false)} />
    </View>
  );
}
