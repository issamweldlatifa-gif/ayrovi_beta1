/**
 * `CartGlyph` relié aux paniers réels. Les clés de requête sont CELLES de la
 * page Panier (cache partagé) : ajouter, retirer ou lier un article met à jour
 * toutes les icônes sans appel supplémentaire.
 *
 * Hors `QueryClientProvider` (tests de composants isolés), l'icône reste nue.
 */
import { useContext } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { QueryClientContext, useQuery } from '@tanstack/react-query';

import { CartGlyph } from '@/design/CartGlyph';
import { useTheme } from '@/design/theme';
import { fetchZayroviCart } from '@/api/cart';
import { fetchAyWebsCart } from '@/api/aywebs';
import { useSessionId } from '@/session/session';
import { useSession } from '@/state/session';
import { totalCartUnits } from './cartUnits';

type GlyphProps = Omit<Parameters<typeof CartGlyph>[0], 'count'>;

/** Total des articles (panier ZAYROVI + AYWEBs en attente). */
export function useCartUnits(): number {
  const sessionId = useSessionId();
  const { account, status } = useSession();
  const zayrovi = useQuery({
    queryKey: ['cart', 'zayrovi', sessionId, status, account?.id ?? ''],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchZayroviCart({ sessionId, signal }),
    staleTime: 30_000,
  });
  const aywebs = useQuery({
    queryKey: ['aywebs', 'cart', sessionId],
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => fetchAyWebsCart({ sessionId, signal }),
    staleTime: 30_000,
  });
  return totalCartUnits(zayrovi.data?.units, aywebs.data?.items);
}

function CountedCartGlyph(props: GlyphProps) {
  return <CartGlyph {...props} count={useCartUnits()} />;
}

export function LiveCartGlyph(props: GlyphProps) {
  const client = useContext(QueryClientContext);
  return client ? <CountedCartGlyph {...props} /> : <CartGlyph {...props} count={0} />;
}

/**
 * Bouton panier d'en-tête : icône + badge, et l'étiquette lue annonce aussi le
 * nombre (« Panier, 3 articles »).
 */
export function LiveCartButton({
  label,
  countLabel,
  onPress,
  testID,
  hitStyle,
  ...glyph
}: GlyphProps & {
  label: string;
  /** Formate l'annonce du nombre, ex. `(n) => t('cart.unitsA11y', { count: n })`. */
  countLabel: (count: number) => string;
  onPress: () => void;
  testID?: string;
  hitStyle?: StyleProp<ViewStyle>;
}) {
  const client = useContext(QueryClientContext);
  return client
    ? <CountedCartButton {...glyph} label={label} countLabel={countLabel} onPress={onPress} testID={testID} hitStyle={hitStyle} />
    : <CartButtonFrame {...glyph} count={0} label={label} countLabel={countLabel} onPress={onPress} testID={testID} hitStyle={hitStyle} />;
}

type ButtonProps = GlyphProps & {
  label: string;
  countLabel: (count: number) => string;
  onPress: () => void;
  testID?: string;
  hitStyle?: StyleProp<ViewStyle>;
};

function CountedCartButton(props: ButtonProps) {
  return <CartButtonFrame {...props} count={useCartUnits()} />;
}

function CartButtonFrame({ label, countLabel, onPress, testID, hitStyle, count, ...glyph }: ButtonProps & { count: number }) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${countLabel(count)}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, hitStyle, pressed ? { opacity: theme.opacity.subtle } : null]}
    >
      <CartGlyph {...glyph} count={count} testID={testID ? `${testID}-glyph` : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
