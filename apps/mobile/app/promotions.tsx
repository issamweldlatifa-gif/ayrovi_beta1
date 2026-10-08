/**
 * شاشة العروض (Q2) — كل العروض النشطة.
 *
 * والخصم يُعرض كما بعثو الخادم (`value` + `discountType`): **ما نحسبش سعراً
 * بعد الخصم**، لأنّ السعر النهائي (`finalPrice`) قرار الخادم وحدو، وعرض سعر
 * نحسبوه نحنا = سعر ثانٍ لنفس المنتوج.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { SubScreen } from '@/design/subScreen';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useT } from '@/i18n';
import { usePromotions } from '@/api/hooks';
import { PromotionCard } from '@/features/sections/PromotionCard';
import type { Promotion } from '@/api/sections';

export default function PromotionsScreen() {
  const theme = useTheme();
  const t = useT();
  const promotions = usePromotions();

  const open = (promotion: Promotion) => {
    if (promotion.productIds.length > 0) {
      router.push({ pathname: '/product/[id]', params: { id: promotion.productIds[0]! } });
      return;
    }
    if (promotion.arrivalIds.length > 0) {
      router.push({ pathname: '/catalog', params: { arrivalId: promotion.arrivalIds[0]! } });
    }
  };

  return (
    <SubScreen
      title={t('sections.promotions')}
      onRefresh={() => promotions.refetch()}
      refreshing={promotions.isFetching}
      fallback="/(tabs)"
    >
      {promotions.isPending ? <LoadingBlock /> : null}
      {promotions.isError ? <ErrorBlock error={promotions.error} onRetry={() => promotions.refetch()} /> : null}

      {!promotions.isPending && !promotions.isError && (promotions.data ?? []).length === 0 ? (
        <EmptyBlock>{t('sections.empty')}</EmptyBlock>
      ) : null}

      <View style={[styles.grid, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        {(promotions.data ?? []).map((promotion) => (
          <PromotionCard key={promotion.id} promotion={promotion} onOpen={open} />
        ))}
      </View>

      <AppText variant="caption" color={theme.colors.muted}>
        {(promotions.data ?? []).length} · {t('sections.promotions')}
      </AppText>
      <View style={styles.spacer} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
  spacer: { height: 24 },
});
