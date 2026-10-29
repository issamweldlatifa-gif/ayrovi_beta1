/**
 * AYWEBs — les deux volets ouverts depuis la barre du bas du navigateur marchand.
 *
 * Ils utilisent le tiroir unifié de l'application (`AppSheet` + `SheetHeader`) et
 * les jetons du thème : même apparence que les autres tiroirs de l'application.
 *
 *  • StoreCartSheet : « mes achats » — même panier que l'onglet Panier, filtré :
 *    ce magasin / tous les magasins (AYWEBs) / Lens & Shop (panier unique).
 *  • StoreFavoriteSheet : mettre la page produit courante dans les favoris du client.
 *    Les favoris exigent un compte : hors connexion, la ligne mène à la connexion.
 *    Le serveur reçoit l'adresse et le titre ; le prix n'est pas envoyé d'ici.
 */
import { RADIUS } from '@/design/tokens.mobile';
import { useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { AppSheet } from '@/design/sheet/AppSheet';
import { SheetHeader } from '@/design/sheet/SheetHeader';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/keys';
import { fetchAyWebsCart } from '@/api/aywebs';
import { fetchAyroviCart } from '@/api/cart';
import { addExternalFavorite } from '@/api/account';
import { addErrorMessage } from '@/features/aywebs/addError';
import { useSession } from '@/state/session';
import {
  OfficialCartRow,
  OfficialCartStickySummary,
  splitCartVariantLabels,
  type OfficialCartItemModel,
} from '@/features/shopping/OfficialCartView';
import {
  STORE_CART_SEGMENTS, storeCartSections, type StoreCartSegment,
} from './storeShopping';

const SEGMENT_LABEL: Record<StoreCartSegment, TranslationKey> = {
  thisStore: 'aywebs.cart.thisStore',
  allStores: 'aywebs.cart.allStores',
  ayrovi: 'aywebs.cart.ayrovi',
};

export interface StoreCartSheetProps {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  storeId: string;
}

export function StoreCartSheet({ visible, onClose, sessionId, storeId }: StoreCartSheetProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const [segment, setSegment] = useState<StoreCartSegment>('allStores');

  const aywebs = useQuery({
    queryKey: ['store-sheet', 'aywebs-cart', sessionId],
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    enabled: visible && Boolean(sessionId),
    retry: false,
  });
  const ayrovi = useQuery({
    queryKey: ['store-sheet', 'ayrovi-cart', sessionId],
    queryFn: ({ signal }) => fetchAyroviCart({ sessionId, signal }),
    enabled: visible && Boolean(sessionId),
    retry: false,
  });

  const active = segment === 'ayrovi' ? ayrovi : aywebs;
  const sections = storeCartSections(segment, {
    aywebs: aywebs.data ?? null,
    ayrovi: ayrovi.data ?? null,
    storeId,
  });

  const unifiedRows = useMemo<OfficialCartItemModel[]>(() => {
    if (segment === 'ayrovi') {
      return (ayrovi.data?.items ?? []).map((line) => {
        const parsed = splitCartVariantLabels({
          requestedColor: line.requestedColor,
          requestedSize: line.requestedSize,
          variant: line.variant,
        });
        return {
          id: line.id,
          brandOrStore: line.store || 'ZAYROVI',
          title: line.title,
          imageUrl: line.imageUrl,
          quantity: line.quantity,
          lineTotalTnd: line.lineTotalTND,
          originalLineTotalTnd: line.originalLineTotalTND,
          color: parsed.color,
          size: parsed.size,
          rawVariant: parsed.extra || (!parsed.color && !parsed.size ? line.variant : ''),
        };
      });
    }
    const items = (aywebs.data?.items ?? []).filter(
      (item) => segment !== 'thisStore' || !storeId || item.storeId === storeId,
    );
    return items.map((item) => {
      const parsed = splitCartVariantLabels({ variant: item.variantLabel });
      return {
        id: item.id,
        brandOrStore: item.storeName || item.storeId || 'AYWEBs',
        title: item.title,
        imageUrl: item.images[0] || '',
        quantity: item.quantity,
        lineTotalTnd: item.lineTotalTnd,
        color: parsed.color,
        size: parsed.size,
        rawVariant: parsed.extra || (!parsed.color && !parsed.size ? item.variantLabel : ''),
      };
    });
  }, [ayrovi.data?.items, aywebs.data?.items, segment, storeId]);

  const totalUnits = unifiedRows.reduce((sum, item) => sum + item.quantity, 0);
  const summaryTotalTnd = segment === 'ayrovi'
    ? (ayrovi.data?.totalTND ?? null)
    : (aywebs.data?.totals?.productSubtotalTnd ?? ayrovi.data?.totalTND ?? null);
  const summaryDeliveryTnd = segment === 'ayrovi' ? (ayrovi.data?.deliveryTND ?? null) : null;

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      header={(
        <SheetHeader
          title={totalUnits > 0 ? `${t('tabs.cart')} (${totalUnits})` : t('aywebs.cart.title')}
          onClose={onClose}
        />
      )}
      footer={(
        <OfficialCartStickySummary
          deliveryTnd={summaryDeliveryTnd}
          totalTnd={summaryTotalTnd}
          checkoutLabel={t('aywebs.cart.openFull')}
          onCheckout={() => {
            onClose();
            router.push('/(tabs)/cart');
          }}
          checkoutTestID="aywebs-store-cart-open-full"
          bottomPadding={4}
        />
      )}
    >
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.segments, { flexDirection: rowDirectionFor(theme.isRTL) }]} accessibilityRole="tablist">
          {STORE_CART_SEGMENTS.map((candidate) => {
            const selected = candidate === segment;
            return (
              <Pressable
                key={candidate}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setSegment(candidate)}
                style={[
                  styles.segment,
                  {
                    borderColor: selected ? theme.colors.ink : theme.colors.line,
                    backgroundColor: selected ? theme.colors.ink : 'transparent',
                    minHeight: theme.chrome.button,
                  },
                ]}
              >
                <AppText variant="caption" weight="bold" color={selected ? theme.colors.canvas : theme.colors.ink}>
                  {t(SEGMENT_LABEL[candidate])}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {active.isLoading ? <ActivityIndicator color={theme.colors.ink} /> : null}
        {active.isError ? (
          <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>
            {addErrorMessage(active.error, locale, t)}
          </AppText>
        ) : null}
        {!active.isLoading && !active.isError && sections.length === 0 && unifiedRows.length === 0 ? (
          <AppText variant="body" color={theme.colors.muted}>{t('aywebs.cart.empty')}</AppText>
        ) : null}

        {unifiedRows.map((row) => (
          <OfficialCartRow key={row.id} item={row} />
        ))}
      </ScrollView>
    </AppSheet>
  );
}

export interface StoreFavoriteSheetProps {
  visible: boolean;
  onClose: () => void;
  sourceUrl: string;
  title: string;
  saved: boolean;
}

/** Une ligne d'action du volet : libellé à gauche (en sens de lecture), icône à droite. */
function SheetRow({ label, icon, onPress, disabled = false, busy = false, active = false, testID }: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  active?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          flexDirection: rowDirectionFor(theme.isRTL),
          minHeight: theme.geometry.minTarget + 12,
          borderBottomColor: theme.colors.divider,
          opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.subtle : 1,
        },
      ]}
    >
      <AppText variant="body" weight="bold" style={styles.rowLabel}>{label}</AppText>
      {busy ? (
        <ActivityIndicator color={theme.colors.action} />
      ) : (
        <Ionicons
          name={icon}
          size={theme.iconSize.md}
          color={active ? theme.colors.accentText : theme.colors.ink}
          accessibilityElementsHidden
        />
      )}
    </Pressable>
  );
}

export function StoreFavoriteSheet({ visible, onClose, sourceUrl, title, saved }: StoreFavoriteSheetProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  /* Les favoris exigent un compte : hors connexion, la première ligne mène à la connexion. */
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const [done, setDone] = useState(false);

  const add = useMutation({
    mutationFn: () => addExternalFavorite({ sourceUrl, title, imageUrl: '', priceTnd: null }),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['account', 'favorites'] });
    },
  });

  const isSaved = saved || done;

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      presentation="bottom"
      header={<SheetHeader title={t('aywebs.fav.title')} subtitle={title || undefined} onClose={onClose} />}
    >
      <View style={styles.body}>
        {signedIn ? (
          <SheetRow
            testID="aywebs-fav-add"
            label={isSaved ? (done ? t('aywebs.fav.done') : t('aywebs.fav.saved')) : t('aywebs.fav.add')}
            icon={isSaved ? 'heart' : 'heart-outline'}
            active={isSaved}
            disabled={isSaved || !sourceUrl || !title}
            busy={add.isPending}
            onPress={() => add.mutate()}
          />
        ) : (
          <SheetRow
            testID="aywebs-fav-login"
            label={t('aywebs.fav.login')}
            icon={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
            onPress={() => { onClose(); router.push('/sign-in'); }}
          />
        )}
        {add.isError ? (
          <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>
            {addErrorMessage(add.error, locale, t)}
          </AppText>
        ) : null}
        {signedIn ? (
          <SheetRow
            testID="aywebs-fav-view"
            label={t('aywebs.fav.openList')}
            icon={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
            onPress={() => { onClose(); router.push('/account/favorites'); }}
          />
        ) : null}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  segments: { flexWrap: 'wrap', gap: 8 },
  segment: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 16, justifyContent: 'center' },
  cartRow: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  rowText: { flex: 1, gap: 2 },
  row: { alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  rowLabel: { flex: 1 },
});
