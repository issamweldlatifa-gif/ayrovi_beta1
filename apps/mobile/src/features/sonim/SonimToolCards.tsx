/**
 * Cartes structurées des outils Sonim : suivi de commande, estimation TND,
 * articles marchands ouvrables dans AYWEBs et ticket support.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { formatAmount, formatMoney } from '@/format/money';
import { useI18n } from '@/i18n';
import {
  buildSonimBrowserRoute,
  type SonimChatMessage,
  type SonimOrderCard,
  type SonimPriceBreakdown,
  type SonimProductCard,
  type SonimSupportTicket,
} from './sonimModel';

function OrderCardView({ order }: { order: SonimOrderCard }) {
  const theme = useTheme();
  const { t } = useI18n();
  const rowDir = rowDirectionFor(theme.isRTL);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <View style={[styles.cardHead, { flexDirection: rowDir }]}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: theme.colors.ink, borderRadius: theme.radius.control },
          ]}
        >
          <Ionicons name="cube-outline" size={theme.iconSize.sm} color={theme.colors.canvas} accessibilityElementsHidden />
        </View>
        <View style={styles.cardTitleBlock}>
          <AppText variant="caption" color={theme.colors.muted}>
            {t('sonim.tool.orderPrefix', { id: order.orderId })}
          </AppText>
          <AppText variant="label" weight="bold">
            {order.statusLabel}
          </AppText>
          <AppText variant="caption" color={theme.colors.muted}>
            {order.carrier ? `${order.carrier} · ` : ''}
            {order.trackingCode || t('sonim.tool.trackingPending')}
          </AppText>
        </View>
      </View>

      {order.history.length > 0 ? (
        <View style={[styles.sectionRule, { borderTopColor: theme.colors.line }]}>
          {[...order.history].reverse().slice(0, 4).map((step, idx) => (
            <View
              key={`${step.status}-${step.at}-${idx}`}
              style={[styles.kvRow, { flexDirection: rowDir }]}
            >
              <AppText variant="caption" style={styles.kvLabel}>{step.label}</AppText>
              {step.at ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  {step.at.slice(0, 10)}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PriceBreakdownView({ breakdown }: { breakdown: SonimPriceBreakdown }) {
  const theme = useTheme();
  const { t } = useI18n();
  const rowDir = rowDirectionFor(theme.isRTL);

  const possibleLines: Array<{ label: string; amount: number | null }> = [
    { label: t('sonim.tool.converted'), amount: breakdown.convertedPriceTND },
    { label: t('sonim.tool.customs'), amount: breakdown.customsFeeTND },
    { label: t('sonim.tool.shipping'), amount: breakdown.shippingFeeTND },
    { label: t('sonim.tool.service'), amount: breakdown.serviceFeeTND },
  ];
  if (breakdown.expressFeeTND !== null && breakdown.expressFeeTND > 0) {
    possibleLines.push({ label: t('sonim.tool.express'), amount: breakdown.expressFeeTND });
  }

  const lines = possibleLines.filter((line): line is { label: string; amount: number } => line.amount !== null);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.status.success.soft,
          borderColor: theme.status.success.border,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <View style={[styles.cardHead, { flexDirection: rowDir }]}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: theme.status.success.fg, borderRadius: theme.radius.control },
          ]}
        >
          <Ionicons name="calculator-outline" size={theme.iconSize.sm} color={theme.colors.onMedia} accessibilityElementsHidden />
        </View>
        <View style={styles.cardTitleBlock}>
          <AppText variant="caption" weight="bold" color={theme.status.success.fg}>
            {t('sonim.tool.priceTitle')}
          </AppText>
          <AppText variant="lead" weight="bold">
            {formatMoney(breakdown.totalTND)}
          </AppText>
        </View>
      </View>

      <View style={[styles.sectionRule, { borderTopColor: theme.status.success.border }]}>
        {lines.map((line) => (
          <View key={line.label} style={[styles.kvRow, { flexDirection: rowDir }]}>
            <AppText variant="caption" color={theme.colors.muted} style={styles.kvLabel}>
              {line.label}
            </AppText>
            <AppText variant="caption" weight="semibold">
              {formatMoney(line.amount)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ProductCardView({ product }: { product: SonimProductCard }) {
  const theme = useTheme();
  const { t } = useI18n();
  const rowDir = rowDirectionFor(theme.isRTL);

  return (
    <Pressable
      onPress={() => router.push(buildSonimBrowserRoute(product.sourceUrl) as never)}
      accessibilityRole="button"
      accessibilityLabel={`${product.title} — ${t('sonim.tool.openStore')}`}
      style={({ pressed }) => [
        styles.productCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
          opacity: pressed ? theme.opacity.subtle : 1,
        },
      ]}
    >
      <View style={[styles.productRow, { flexDirection: rowDir }]}>
        <View
          style={[
            styles.productThumbWrap,
            {
              backgroundColor: theme.colors.canvas,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          {product.image ? (
            <AppImage uri={product.image} style={styles.productThumb} contentFit="contain" decorative />
          ) : (
            <Ionicons name="bag-handle-outline" size={theme.iconSize.md} color={theme.colors.muted} accessibilityElementsHidden />
          )}
        </View>

        <View style={styles.productMeta}>
          <AppText variant="caption" weight="bold" color={theme.colors.muted} numberOfLines={1}>
            {product.source}
          </AppText>
          <AppText variant="label" weight="semibold" numberOfLines={2}>
            {product.title}
          </AppText>
          <View style={[styles.priceRow, { flexDirection: rowDir }]}>
            {product.priceTnd !== null ? (
              <AppText variant="label" weight="bold">
                {formatMoney(product.priceTnd)}
              </AppText>
            ) : null}
            <AppText variant="caption" color={theme.colors.muted}>
              {`${product.price % 1 === 0 ? String(product.price) : formatAmount(product.price)} ${product.currency}`}
            </AppText>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.productCta,
          {
            borderTopColor: theme.colors.line,
            flexDirection: rowDir,
          },
        ]}
      >
        <AppText variant="caption" weight="bold">
          {t('sonim.tool.openStore')}
        </AppText>
        <Ionicons
          name={theme.isRTL ? 'arrow-back' : 'arrow-forward'}
          size={theme.iconSize.xs}
          color={theme.colors.ink}
          accessibilityElementsHidden
        />
      </View>
    </Pressable>
  );
}

function SupportTicketView({ ticket }: { ticket: SonimSupportTicket }) {
  const theme = useTheme();
  const { t } = useI18n();
  const rowDir = rowDirectionFor(theme.isRTL);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <View style={[styles.cardHead, { flexDirection: rowDir }]}>
        <View
          style={[
            styles.iconBox,
            { backgroundColor: theme.colors.ink, borderRadius: theme.radius.control },
          ]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={theme.iconSize.sm} color={theme.colors.canvas} accessibilityElementsHidden />
        </View>
        <View style={styles.cardTitleBlock}>
          <AppText variant="label" weight="bold">
            {t('sonim.tool.ticketTitle')}
          </AppText>
          <AppText variant="caption" color={theme.colors.muted}>
            {t('sonim.tool.ticketRef', { id: ticket.id })}
          </AppText>
        </View>
      </View>
    </View>
  );
}

export function SonimToolCards({ message }: { message: SonimChatMessage }) {
  const hasTools = Boolean(
    message.orders?.length ||
      message.priceBreakdown ||
      message.products?.length ||
      message.supportTicket,
  );
  if (!hasTools) return null;

  return (
    <View style={styles.stack}>
      {message.orders?.map((order) => (
        <OrderCardView key={order.orderId} order={order} />
      ))}
      {message.priceBreakdown ? (
        <PriceBreakdownView breakdown={message.priceBreakdown} />
      ) : null}
      {message.products?.map((product) => (
        <ProductCardView key={product.id} product={product} />
      ))}
      {message.supportTicket ? (
        <SupportTicketView ticket={message.supportTicket} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10, marginTop: 8 },
  card: { borderWidth: 1, padding: 12, gap: 10 },
  cardHead: { alignItems: 'center', gap: 10 },
  iconBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  cardTitleBlock: { flex: 1, gap: 2 },
  sectionRule: { borderTopWidth: 1, paddingTop: 8, gap: 6 },
  kvRow: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kvLabel: { flex: 1 },
  productCard: { borderWidth: 1, overflow: 'hidden' },
  productRow: { padding: 10, gap: 12, alignItems: 'center' },
  productThumbWrap: {
    width: 68,
    height: 68,
    borderWidth: 1,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productThumb: { width: '100%', height: '100%' },
  productMeta: { flex: 1, gap: 4 },
  priceRow: { alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  productCta: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
