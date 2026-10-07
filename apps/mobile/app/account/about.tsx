/**
 * حول التطبيق — «شكون يشغّل شنوّة بالضبط».
 *
 * علاش هذا الشاشة موجودة: كان المستعمل (ولا انت) يقول «الخادم تبدّل» ولا
 * «التطبيق تبدّل»، ما فماش طريقة تفرّق. هنا نعرضو الحقيقة كاملة بلا تخمين:
 *  • **التطبيق**: الإصدار وكود البناء ومعرّف الحزمة — من `app.json` عن طريق
 *    `expo-constants` (نفس المصدر اللي تنبني بيه الحزمة).
 *  • **الهوية اللي نعلنوها للخادم** (`mobile/x.y.z`): الخادم يقبلها ولا لا
 *    عليها يتوقّف دخول التطبيق.
 *  • **الخادم**: قاعدة البيانات، الإصدار، و`commit` — الرقم اللي يقول أي كود
 *    قاعد يخدم فعلاً. `local` = خادم تشغيل محلي، موش منشور من Git.
 *
 * الأخطاء تتقال بلغة المستعمل (`userMessage`) — ما نعرضوش نصاً فرنسياً خاماً.
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { AppText, Button, Card, KeyValue } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { API_BASE_URL, CLIENT_HEADER } from '@/api/config';
import { fetchServerReadiness } from '@/api/public';
import { SubScreen } from '@/design/subScreen';

export default function AboutScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();

  const readiness = useQuery({
    queryKey: ['server', 'ready'],
    queryFn: ({ signal }) => fetchServerReadiness({ signal }),
    staleTime: 0,
    retry: 0,
  });

  const reload = useCallback(() => { readiness.refetch(); }, [readiness]);

  const expo = Constants.expoConfig ?? null;
  const version = String(expo?.version ?? '');
  const buildCode = expo?.android?.versionCode;
  const packageName = String(expo?.android?.package ?? '');
  const server = readiness.data ?? null;
  const commit = server?.commit || '';
  const notDeployed = !commit || commit === 'local';

  return (
    <SubScreen
      title={t('about.title')}
      subtitle={t('about.hint')}
      fallback="/(tabs)/account"
      onRefresh={reload}
      refreshing={readiness.isFetching && !readiness.isPending}
    >
      <Card title={t('about.app')}>
        <KeyValue label={t('about.version')} value={version || t('about.unknown')} />
        <KeyValue label={t('about.versionCode')} value={buildCode != null ? String(buildCode) : t('about.unknown')} />
        <KeyValue label={t('about.package')} value={packageName || t('about.unknown')} />
        <KeyValue label={t('about.clientHeader')} value={CLIENT_HEADER} />
      </Card>

      <Card title={t('about.server')}>
        <KeyValue label={t('about.origin')} value={API_BASE_URL || '/api'} />
        {readiness.isPending ? (
          <LoadingBlock label={{ fr: 'Lecture du serveur…', ar: 'جارٍ قراءة الخادم…' }} />
        ) : readiness.isError ? (
          <ErrorBlock error={readiness.error} onRetry={reload} />
        ) : (
          <>
            <KeyValue label={t('about.serverVersion')} value={server?.version || t('about.unknown')} />
            <KeyValue label={t('about.database')} value={server?.database || t('about.unknown')} />
            <KeyValue
              label={t('about.serverCommit')}
              value={notDeployed ? t('about.notDeployed') : commit.slice(0, 12)}
            />
            <KeyValue
              label={t('about.serverBranch')}
              value={server?.branch && server.branch !== 'unknown' ? server.branch : t('about.unknown')}
            />
          </>
        )}
      </Card>

      <Card hint={t('about.why')}>
        <AppText variant="caption" color={theme.colors.muted}>
          {stamp(readiness.dataUpdatedAt)
            ? `${t('about.checkedAt')} · ${stamp(readiness.dataUpdatedAt)}`
            : t('about.checkedAt')}
        </AppText>
        <View style={[styles.actions, { gap: theme.space[2] }]}>
          <Button label={t('about.check')} busy={readiness.isFetching} onPress={reload} />
        </View>
      </Card>
    </SubScreen>
  );
}

/**
 * وقت آخر قراءة ناجحة، مكتوب بلا `Intl` (Hermes ما يضمنهاش على كل جهاز):
 * `HH:MM:SS` من ساعة الجهاز.
 */
function stamp(value: number): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const styles = StyleSheet.create({
  actions: { marginTop: 8 },
});
