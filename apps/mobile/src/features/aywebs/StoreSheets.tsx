/**
 * AYWEBs — les deux volets ouverts depuis la barre du bas du navigateur marchand.
 *
 *  • StoreCartSheet : « mes achats » — même panier que l'onglet Panier, filtré :
 *    ce magasin / tous les magasins (AYWEBs) / Lens & Shop (panier Ayrovi).
 *  • StoreFavoriteSheet : mettre la page produit courante dans les favoris du client.
 *    Le serveur reçoit l'adresse et le titre ; le prix n'est pas envoyé d'ici.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppText, Button, Card } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/keys';
import { fetchAyWebsCart } from '@/api/aywebs';
import { fetchAyroviCart } from '@/api/cart';
import { addExternalFavorite } from '@/api/account';
import { userMessage } from '@/api/errors';
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
  const [segment, setSegment] = useState<StoreCartSegment>('thisStore');

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet }]}>
          <ScrollView contentContainerStyle={styles.body}>
            <AppText variant="title">{t('aywebs.cart.title')}</AppText>

            <View style={styles.segments} accessibilityRole="tablist">
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
                        minHeight: theme.geometry.minTarget,
                      },
                    ]}
                  >
                    <AppText variant="label" weight="bold" color={selected ? theme.colors.canvas : theme.colors.ink}>
                      {t(SEGMENT_LABEL[candidate])}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {active.isLoading ? <ActivityIndicator color={theme.colors.ink} /> : null}
            {active.isError ? (
              <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>
                {userMessage(active.error)[locale]}
              </AppText>
            ) : null}
            {!active.isLoading && !active.isError && sections.length === 0 ? (
              <AppText variant="body" color={theme.colors.muted}>{t('aywebs.cart.empty')}</AppText>
            ) : null}

            {sections.map((section) => (
              <Card key={section.storeKey} title={section.storeName}>
                {section.rows.map((row) => (
                  <View key={row.id} style={styles.row}>
                    <View style={styles.rowText}>
                      <AppText variant="label" weight="bold" numberOfLines={2}>{row.title}</AppText>
                      {row.variant ? (
                        <AppText variant="caption" color={theme.colors.muted}>{row.variant}</AppText>
                      ) : null}
                      <AppText variant="caption" color={theme.colors.muted}>× {row.quantity}</AppText>
                    </View>
                    {row.priceText ? <AppText variant="label" weight="bold">{row.priceText}</AppText> : null}
                  </View>
                ))}
              </Card>
            ))}

            <Button
              label={t('aywebs.cart.openFull')}
              tone="quiet"
              block
              onPress={() => { onClose(); router.push('/(tabs)/cart'); }}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export interface StoreFavoriteSheetProps {
  visible: boolean;
  onClose: () => void;
  sourceUrl: string;
  title: string;
  saved: boolean;
}

export function StoreFavoriteSheet({ visible, onClose, sourceUrl, title, saved }: StoreFavoriteSheetProps) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouch} accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas, borderTopLeftRadius: theme.radius.sheet, borderTopRightRadius: theme.radius.sheet }]}>
          <ScrollView contentContainerStyle={styles.body}>
            <AppText variant="title">{t('aywebs.fav.title')}</AppText>
            <AppText variant="lead" weight="bold" numberOfLines={3}>{title}</AppText>

            {add.isError ? (
              <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>
                {userMessage(add.error)[locale]}
              </AppText>
            ) : null}

            {isSaved ? (
              <>
                <AppText variant="label" weight="bold" color={theme.status.success.fg}>
                  {done ? t('aywebs.fav.done') : t('aywebs.fav.saved')}
                </AppText>
                <Button label={t('aywebs.fav.openList')} tone="quiet" block onPress={() => { onClose(); router.push('/account/favorites'); }} />
              </>
            ) : (
              <Button
                label={t('aywebs.fav.add')}
                block
                busy={add.isPending}
                disabled={!sourceUrl || !title}
                onPress={() => add.mutate()}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTouch: { ...StyleSheet.absoluteFill },
  sheet: { maxHeight: '85%' },
  body: { padding: 20, gap: 12 },
  segments: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segment: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  rowText: { flex: 1, gap: 2 },
});
