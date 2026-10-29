/**
 * Panier officiel unifié ZAYROVI (style Bag / Zalando) :
 *   • Zone centrale défilante (`ScrollView flex: 1`) pour la liste des articles :
 *     vignette portrait, marque/boutique en gras + menu `•••`, titre sur 1 ligne,
 *     prix en rouge + prix d'origine barré lorsqu'il y a une réduction (ou prix
 *     normal en encre sinon), lignes empilées `Couleur :` / `Taille :`, `Quantité : N`.
 *   • Bloc inférieur FIXE (hors du `ScrollView`, immobile pendant le défilement) :
 *     filet supérieur, `Livraison`, `Total` + `TVA incluse`, bouton pastille noir
 *     compact `Commander`, et rangée des moyens de paiement acceptés.
 */
import { type ReactNode, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { SheetHeader } from '@/design/sheet/SheetHeader';
import { useTheme } from '@/design/theme';
import { RADIUS, veil } from '@/design/tokens.mobile';
import { AppText, Button, KeyValue } from '@/design/ui';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { formatMoney } from '@/format/money';

export interface OfficialCartItemModel {
  id: string;
  brandOrStore: string;
  title: string;
  imageUrl: string;
  quantity: number;
  lineTotalTnd: number | null;
  originalLineTotalTnd?: number | null;
  discountPercent?: number | null;
  color?: string;
  size?: string;
  rawVariant?: string;
  sourcePriceLabel?: string;
  availabilityLabel?: string;
  trustLabel?: string;
  blockedAlert?: string;
}

import { splitCartVariantLabels } from './cartVariantLabels';
export { splitCartVariantLabels };

export function PaymentMethodsBadgeStrip() {
  const theme = useTheme();
  const { t } = useI18n();
  const badges = [
    { key: 'visa', label: 'VISA', icon: 'card-outline' as const },
    { key: 'mastercard', label: 'Mastercard', icon: 'card-outline' as const },
    { key: 'edinar', label: t('cart.payBadgePoste'), icon: 'wallet-outline' as const },
    { key: 'transfer', label: t('cart.payBadgeTransfer'), icon: 'swap-horizontal-outline' as const },
    { key: 'cod', label: t('cart.payBadgeCod'), icon: 'cash-outline' as const },
  ];

  return (
    <View
      testID="cart-payment-badges"
      style={[styles.badgesRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}
    >
      {badges.map((badge) => (
        <View
          key={badge.key}
          style={[
            styles.paymentBadge,
            {
              flexDirection: rowDirectionFor(theme.isRTL),
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Ionicons name={badge.icon} size={theme.iconSize.xs} color={theme.colors.ink} accessibilityElementsHidden />
          <AppText variant="caption" weight="semibold" color={theme.colors.ink}>
            {badge.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function OfficialCartRow({
  item,
  busy = false,
  maxQuantity = 99,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: OfficialCartItemModel;
  busy?: boolean;
  maxQuantity?: number;
  onDecrease?: () => void;
  onIncrease?: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const imageUri = item.imageUrl ? mediaUrl(item.imageUrl) : '';
  const hasDiscount =
    item.lineTotalTnd != null
    && item.originalLineTotalTnd != null
    && item.originalLineTotalTnd > item.lineTotalTnd;
  const computedPct = hasDiscount && item.originalLineTotalTnd
    ? Math.round(((item.originalLineTotalTnd - (item.lineTotalTnd ?? 0)) / item.originalLineTotalTnd) * 100)
    : (item.discountPercent ?? null);

  return (
    <>
      <View
        testID={`cart-row-${item.id}`}
        style={[
          styles.itemRow,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            borderBottomColor: theme.colors.line,
          },
        ]}
      >
        {imageUri ? (
          <AppImage
            uri={imageUri}
            style={[styles.itemThumb, { backgroundColor: theme.colors.skeleton }]}
            contentFit="cover"
            accessibilityLabel={item.title}
          />
        ) : (
          <View
            style={[
              styles.itemThumb,
              styles.itemThumbPlaceholder,
              {
                backgroundColor: theme.colors.skeleton,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Ionicons name="image-outline" size={theme.iconSize.lg} color={theme.colors.muted} accessibilityElementsHidden />
          </View>
        )}

        <View style={styles.itemMeta}>
          <View style={[styles.itemTopLine, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="label" weight="bold" numberOfLines={1} style={styles.brandName}>
              {item.brandOrStore || 'ZAYROVI'}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('cart.itemActions')}
              onPress={() => setMenuOpen(true)}
              hitSlop={8}
              testID={`cart-line-${item.id}-menu`}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed ? theme.opacity.subtle : 1 }]}
            >
              <Ionicons name="ellipsis-horizontal-outline" size={theme.iconSize.sm} color={theme.colors.ink} accessibilityElementsHidden />
            </Pressable>
          </View>

          <AppText variant="label" color={theme.colors.ink} numberOfLines={1}>
            {item.title}
          </AppText>

          {item.lineTotalTnd == null ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('cart.noLineTotal')}
            </AppText>
          ) : hasDiscount ? (
            <View style={styles.priceGroup}>
              <AppText variant="body" weight="bold" color={theme.status.danger.fg}>
                {formatMoney(item.lineTotalTnd)}
              </AppText>
              <View style={[styles.originalPriceRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('cart.originally')}
                </AppText>
                <AppText variant="caption" color={theme.colors.muted} style={styles.strikethrough}>
                  {formatMoney(item.originalLineTotalTnd as number)}
                </AppText>
                {computedPct && computedPct > 0 ? (
                  <AppText variant="caption" weight="semibold" color={theme.status.danger.fg}>
                    {`-${computedPct}%`}
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : (
            <AppText variant="body" weight="bold" color={theme.colors.ink} style={styles.regularPrice}>
              {formatMoney(item.lineTotalTnd)}
            </AppText>
          )}

          <View style={styles.variantsStack}>
            {item.color ? (
              <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
                {`${t('catalog.color')} : `}
                <AppText variant="caption" color={theme.colors.ink}>{item.color}</AppText>
              </AppText>
            ) : null}
            {item.size ? (
              <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
                {`${t('catalog.size')} : `}
                <AppText variant="caption" color={theme.colors.ink}>{item.size}</AppText>
              </AppText>
            ) : null}
            {!item.color && !item.size && item.rawVariant ? (
              <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
                {`${t('cart.variant')} : `}
                <AppText variant="caption" color={theme.colors.ink}>{item.rawVariant}</AppText>
              </AppText>
            ) : null}
          </View>

          {item.blockedAlert ? (
            <AppText variant="caption" color={theme.status.danger.fg} accessibilityRole="alert">
              {item.blockedAlert}
            </AppText>
          ) : null}

          <View style={[styles.qtyControlBar, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="caption" color={theme.colors.muted}>
              {`${t('aywebs.quantity')} : `}
              <AppText variant="caption" weight="semibold" color={theme.colors.ink}>
                {String(item.quantity)}
              </AppText>
            </AppText>

            {onDecrease || onIncrease || onRemove ? (
              <View style={[styles.qtyButtons, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                {onDecrease ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.decrease')}
                    testID={`cart-line-${item.id}-minus`}
                    disabled={busy || item.quantity <= 1}
                    onPress={onDecrease}
                    hitSlop={6}
                    style={[
                      styles.stepBtn,
                      {
                        borderColor: theme.colors.line,
                        opacity: busy || item.quantity <= 1 ? theme.opacity.disabled : 1,
                      },
                    ]}
                  >
                    <Ionicons name="remove-outline" size={theme.iconSize.xs} color={theme.colors.ink} accessibilityElementsHidden />
                  </Pressable>
                ) : null}
                {onIncrease ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.increase')}
                    testID={`cart-line-${item.id}-plus`}
                    disabled={busy || item.quantity >= maxQuantity}
                    onPress={onIncrease}
                    hitSlop={6}
                    style={[
                      styles.stepBtn,
                      {
                        borderColor: theme.colors.line,
                        opacity: busy || item.quantity >= maxQuantity ? theme.opacity.disabled : 1,
                      },
                    ]}
                  >
                    <Ionicons name="add-outline" size={theme.iconSize.xs} color={theme.colors.ink} accessibilityElementsHidden />
                  </Pressable>
                ) : null}
                {onRemove ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('cart.remove')}
                    testID={`cart-line-${item.id}-remove`}
                    disabled={busy}
                    onPress={onRemove}
                    hitSlop={6}
                    style={[
                      styles.stepBtn,
                      {
                        borderColor: theme.colors.line,
                        opacity: busy ? theme.opacity.disabled : 1,
                      },
                    ]}
                  >
                    <Ionicons name="trash-outline" size={theme.iconSize.xs} color={theme.colors.ink} accessibilityElementsHidden />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {menuOpen ? (
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={t('sheet.close')}
              onPress={() => setMenuOpen(false)}
            />
            <View
              style={[
                styles.modalSheet,
                {
                  backgroundColor: theme.colors.surface,
                  borderTopLeftRadius: theme.radius.sheet,
                  borderTopRightRadius: theme.radius.sheet,
                },
              ]}
            >
              <SheetHeader
                title={item.brandOrStore || t('cart.itemActions')}
                subtitle={item.title}
                onClose={() => setMenuOpen(false)}
              />
              <View style={styles.sheetContent}>
                {item.sourcePriceLabel ? <KeyValue label={t('cart.sourcePrice')} value={item.sourcePriceLabel} /> : null}
                {item.lineTotalTnd != null ? <KeyValue label={t('cart.lineTotal')} value={formatMoney(item.lineTotalTnd)} /> : null}
                {item.availabilityLabel ? <KeyValue label={t('cart.availability')} value={item.availabilityLabel} /> : null}
                {item.trustLabel ? <KeyValue label={t('cart.priceTrust')} value={item.trustLabel} /> : null}
                {onRemove ? (
                  <Button
                    label={t('cart.remove')}
                    tone="quiet"
                    block
                    disabled={busy}
                    leading={<Ionicons name="trash-outline" size={theme.iconSize.sm} color={theme.colors.ink} />}
                    onPress={() => {
                      setMenuOpen(false);
                      onRemove();
                    }}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

export function OfficialCartStickySummary({
  deliveryTnd,
  totalTnd,
  checkoutLabel,
  checkoutDisabled = false,
  checkoutBusy = false,
  onCheckout,
  checkoutTestID = 'cart-checkout',
  bottomPadding = 12,
  extraAboveButton,
}: {
  deliveryTnd: number | null;
  totalTnd: number | null;
  checkoutLabel: string;
  checkoutDisabled?: boolean;
  checkoutBusy?: boolean;
  onCheckout: () => void;
  checkoutTestID?: string;
  bottomPadding?: number;
  extraAboveButton?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View
      testID="cart-sticky-summary"
      style={[
        styles.stickySummary,
        {
          backgroundColor: theme.colors.canvas,
          borderTopColor: theme.colors.line,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {deliveryTnd != null ? (
        <View style={[styles.summaryRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <AppText variant="label" color={theme.colors.ink}>{t('cart.delivery')}</AppText>
          <AppText variant="label" color={theme.colors.ink}>{formatMoney(deliveryTnd)}</AppText>
        </View>
      ) : null}

      {totalTnd != null ? (
        <View style={[styles.summaryRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <View style={[styles.totalTitleGroup, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText variant="body" weight="bold" color={theme.colors.ink}>{t('cart.total')}</AppText>
            <AppText variant="caption" color={theme.colors.muted}>{t('cart.vatIncluded')}</AppText>
          </View>
          <AppText variant="body" weight="bold" color={theme.colors.ink}>{formatMoney(totalTnd)}</AppText>
        </View>
      ) : null}

      {extraAboveButton}

      <Button
        label={checkoutLabel}
        tone="solid"
        block
        busy={checkoutBusy}
        disabled={checkoutDisabled}
        onPress={onCheckout}
        testID={checkoutTestID}
      />

      <PaymentMethodsBadgeStrip />
    </View>
  );
}

export function OfficialCartScaffold({
  title,
  itemCount,
  onBack,
  onRefresh,
  refreshing = false,
  topNotice,
  children,
  stickyFooter,
}: {
  title: string;
  itemCount?: number;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  topNotice?: ReactNode;
  children: ReactNode;
  stickyFooter?: ReactNode;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const headerLabel = useMemo(
    () => (typeof itemCount === 'number' && itemCount > 0 ? `${title} (${itemCount})` : title),
    [itemCount, title],
  );

  return (
    <View style={[styles.scaffold, { backgroundColor: theme.colors.canvas }]}>
      <View
        style={[
          styles.topBar,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            borderBottomColor: theme.colors.line,
          },
        ]}
      >
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Ionicons
              name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
              size={theme.iconSize.md}
              color={theme.colors.ink}
              accessibilityElementsHidden
            />
          </Pressable>
        ) : null}
        <AppText variant="lead" weight="bold" numberOfLines={1} style={styles.topBarTitle}>
          {headerLabel}
        </AppText>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accentText}
              colors={[theme.colors.accentText]}
            />
          ) : undefined
        }
      >
        {topNotice}
        {children}
      </ScrollView>

      {stickyFooter}
    </View>
  );
}

const styles = StyleSheet.create({
  scaffold: { flex: 1 },
  topBar: {
    minHeight: 48,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  itemRow: {
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  itemThumb: {
    width: 96,
    height: 128,
    borderRadius: RADIUS.xs,
  },
  itemThumbPlaceholder: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMeta: {
    flex: 1,
    gap: 4,
  },
  itemTopLine: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandName: { flex: 1 },
  moreBtn: {
    width: 32,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceGroup: {
    marginTop: 2,
    gap: 2,
  },
  regularPrice: {
    marginTop: 2,
  },
  originalPriceRow: {
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  variantsStack: {
    marginTop: 4,
    gap: 2,
  },
  qtyControlBar: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  qtyButtons: {
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    gap: 12,
    paddingBottom: 8,
  },
  stickySummary: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: veil(0.46),
  },
  modalSheet: {
    paddingBottom: 24,
  },
  summaryRow: {
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  totalTitleGroup: {
    alignItems: 'baseline',
    gap: 6,
  },
  badgesRow: {
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  paymentBadge: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
