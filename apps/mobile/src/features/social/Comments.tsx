/**
 * تعليقات (Q3، 08/10/2026).
 *
 * قاعدة الخادم هنا **أمان نقلناه كما هو**: التعليق يحتاج حساباً
 * (`401 AUTH_REQUIRED`)، والنصّ يُقلَّم إلى 500 حرف ويُرفض تحت حرفين.
 * فحقل الإدخال **ما يبانش** لزائر — موش يبان ويرفض بعد الكتابة.
 *
 * والسطر المضاف هو **ما يرجّعو الخادم** (`author`, `createdAt`)، موش ما
 * نخترعو نحنا: العميل ما يقرّرش هوية المعلّق.
 */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, useFieldChrome } from '@/design/ui';
import { WaitingBars } from '@/design/WaitingBars';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { fetchComments, sendInteraction, type SocialComment } from '@/api/social';
import { useSession } from '@/state/session';
import { useSessionId } from '@/session/session';

export interface CommentsProps {
  targetId: string;
}

export function Comments({ targetId }: CommentsProps) {
  const theme = useTheme();
  // Même habillage que tous les champs : fond blanc, contour gris, focus violet.
  const field = useFieldChrome();
  const t = useT();
  const session = useSession();
  const guestSession = useSessionId();
  const queryClient = useQueryClient();
  const signedIn = session.status === 'signedIn';

  const [draft, setDraft] = useState('');

  const comments = useQuery({
    queryKey: ['social', 'comments', targetId],
    queryFn: ({ signal }) => fetchComments(targetId, { signal }),
  });

  const post = useMutation({
    mutationFn: () => sendInteraction({
      type: 'comment',
      targetId,
      text: draft,
      sessionId: guestSession || undefined,
    }),
    onSuccess: (result) => {
      setDraft('');
      // نحقن ما سجّلو الخادم، ثم نعاود القراءة: الحقيقة عندو.
      if (result.comment) {
        queryClient.setQueryData<SocialComment[]>(['social', 'comments', targetId], (previous) => [
          ...(previous ?? []),
          result.comment!,
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ['social', 'comments', targetId] });
      queryClient.invalidateQueries({ queryKey: ['social', 'counts'] });
    },
  });

  useEffect(() => {
    setDraft('');
  }, [targetId]);

  const rows = comments.data ?? [];
  const tooShort = draft.trim().length < 2;

  return (
    <View style={styles.wrap}>
      {comments.isPending ? (
        <View accessibilityRole="progressbar" accessibilityLabel={t('loading.server')}>
          <WaitingBars compact testID="comments-loading-bars" />
        </View>
      ) : null}
      {comments.isError ? (
        <AppText variant="caption" color={theme.status.danger.fg}>{t('social.retry')}</AppText>
      ) : null}

      {!comments.isPending && rows.length === 0 ? (
        <AppText variant="caption" color={theme.colors.muted}>{t('social.noComments')}</AppText>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: theme.colors.divider }]}>
            <AppText variant="caption" weight="bold">{item.author}</AppText>
            <AppText variant="body">{item.text}</AppText>
          </View>
        )}
      />

      {signedIn ? (
        <View style={styles.form}>
          <TextInput
            {...field.inputProps}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('social.comment')}
            maxLength={500}
            multiline
            style={[
              styles.input,
              {
                ...field.style,
                borderRadius: theme.radius.control,
                minHeight: 44,
                paddingHorizontal: 12 - field.inset,
                paddingVertical: 10 - field.inset,
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: tooShort || post.isPending }}
            disabled={tooShort || post.isPending}
            onPress={() => post.mutate()}
            style={[styles.send, { backgroundColor: theme.colors.accent, borderRadius: theme.radius.cta, opacity: tooShort ? 0.45 : 1 }]}
          >
            <AppText variant="label" weight="bold" color={theme.colors.onAccent}>{t('social.send')}</AppText>
          </Pressable>
        </View>
      ) : (
        <AppText variant="caption" color={theme.colors.muted}>{t('social.needAccount')}</AppText>
      )}

      {draft.trim().length === 1 ? (
        <AppText variant="caption" color={theme.status.danger.fg}>{t('social.minLength')}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingVertical: 8 },
  row: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  form: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  input: { flex: 1, textAlignVertical: 'top' },
  send: { paddingHorizontal: 16, paddingVertical: 12 },
});
