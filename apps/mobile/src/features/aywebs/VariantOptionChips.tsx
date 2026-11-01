/**
 * Contrôles de variante d'une fiche boutique — couleur (pastilles) et taille
 * (pilules).
 *
 * ── Ce qui a été corrigé le 27/10/2026 ─────────────────────────────────────
 * 1. **La pastille montrait un cadre cassé.** Quand le marchand publie une image
 *    par couleur, on l'affiche ; si elle échoue, on ne laisse pas l'icône
 *    « image indisponible » : la pastille prend la couleur NOMMÉE de l'article
 *    (`optionColour.ts`). Une couleur inconnue garde une pastille neutre avec
 *    l'initiale — jamais une couleur inventée.
 * 2. **Le libellé se décalait quand la valeur était choisie.** La coche était
 *    posée DANS la ligne du texte : « Black ✓ » poussait le mot, et les
 *    libellés des colonnes voisines ne s'alignaient plus. La coche est
 *    maintenant un badge posé sur la pastille, et chaque libellé garde une
 *    largeur fixe, centré, sur deux lignes — jamais tronqué.
 * 3. **La coche jaune sur anneau jaune** se lisait mal : elle est encre sur une
 *    pastille blanche (en sombre : blanche sur encre), avec un filet.
 *
 * Aucune valeur de couleur ou d'espace n'est écrite ici : tout vient du thème,
 * sauf la teinte de l'article, qui est une donnée.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { COMMERCE, RADIUS } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import type { ChoiceOption } from '@/features/aywebs/ChoiceField';
import { colourForOption, needsOutline } from '@/features/aywebs/optionColour';

const RING = 56;
const SWATCH = 48;

export function VariantOptionChips({
  kind, label, value, options, onSelect,
}: {
  kind: 'color' | 'size';
  label: string;
  value: string;
  options: ChoiceOption[];
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="label" weight="bold">{label}</AppText>
      <ScrollView horizontal={kind === 'color'} showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.options, kind === 'color' && styles.colorOptions, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} testID="aywebs-variant-options-scroll">
        {options.map((option, index) => (
          <Option
            key={option.value}
            kind={kind}
            label={label}
            option={option}
            index={index}
            active={option.value === value}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Option({ kind, label, option, index, active, onSelect }: {
  kind: 'color' | 'size';
  label: string;
  option: ChoiceOption;
  index: number;
  active: boolean;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  const disabled = option.unavailable === true;
  const [imageFailed, setImageFailed] = useState(false);
  const spoken = `${label}: ${option.value}${option.price ? `, ${option.price}` : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => onSelect(option.value)}
      style={kind === 'color' ? styles.colorOption : styles.sizeOptionWrap}
      testID={`aywebs-variant-${kind}-${index}`}
    >
      {kind === 'color' ? (
        <>
          <View style={styles.ringWrap}>
            <View
              style={[
                styles.imageRing,
                { borderColor: active ? COMMERCE.action : theme.colors.line, opacity: disabled ? theme.opacity.disabled : 1 },
              ]}
            >
              <Swatch
                option={option}
                index={index}
                failed={imageFailed}
                onFailed={() => setImageFailed(true)}
              />
            </View>
            {active ? <SelectedBadge index={index} /> : null}
          </View>
          <AppText
            variant="caption"
            align="center"
            numberOfLines={2}
            color={disabled ? theme.colors.muted : theme.colors.ink}
            style={styles.colorLabel}
          >
            {option.value}
          </AppText>
        </>
      ) : (
        <View
          style={[
            styles.sizePill,
            {
              borderColor: active ? COMMERCE.action : theme.colors.line,
              backgroundColor: active ? theme.status.warning.soft : theme.colors.surface,
              opacity: disabled ? theme.opacity.disabled : 1,
            },
          ]}
        >
          <AppText variant="label" weight={active ? 'bold' : 'regular'}>{option.value}</AppText>
          {active ? (
            <Ionicons
              testID={`aywebs-variant-selected-${index}`}
              name="checkmark"
              size={theme.iconSize.xs}
              color={theme.colors.ink}
            />
          ) : null}
          {disabled ? <AppText variant="caption" color={theme.colors.muted}>×</AppText> : null}
        </View>
      )}

      {option.price ? (
        <AppText variant="caption" color={theme.colors.muted} align="center">{option.price}</AppText>
      ) : null}
    </Pressable>
  );
}

/** Pastille : photo du produit dans cette couleur, sinon la couleur nommée. */
function Swatch({ option, index, failed, onFailed }: {
  option: ChoiceOption;
  index: number;
  failed: boolean;
  onFailed: () => void;
}) {
  const theme = useTheme();
  const colour = colourForOption(option.value);

  if (option.image && !failed) {
    return (
      <AppImage
        uri={mediaUrl(option.image)}
        contentFit="cover"
        decorative
        testID={`aywebs-color-image-${index}`}
        style={styles.swatch}
        onError={onFailed}
      />
    );
  }

  if (colour) {
    return (
      <View
        testID={`aywebs-color-swatch-${index}`}
        style={[
          styles.swatch,
          {
            backgroundColor: colour,
            borderWidth: needsOutline(option.value) ? StyleSheet.hairlineWidth : 0,
            borderColor: theme.colors.line,
          },
        ]}
      />
    );
  }

  return (
    <View
      testID={`aywebs-color-swatch-${index}`}
      style={[styles.swatch, styles.neutralSwatch, { backgroundColor: theme.colors.shimmer }]}
    >
      <AppText variant="caption" weight="bold" color={theme.colors.muted}>
        {option.value.trim().slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
}

/** Coche du choix courant : posée SUR la pastille, jamais dans le libellé. */
function SelectedBadge({ index }: { index: number }) {
  const theme = useTheme();
  return (
    <View
      testID={`aywebs-variant-selected-${index}`}
      style={[styles.selectedBadge, { backgroundColor: theme.colors.canvas, borderColor: theme.colors.line }]}
    >
      <Ionicons name="checkmark" size={theme.iconSize.xs} color={theme.colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  options: { flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12, rowGap: 12 },
  colorOptions: { flexWrap: 'nowrap', paddingBottom: 4 },
  // Largeur fixe = largeur de l'anneau : les libellés restent alignés en colonnes.
  colorOption: { width: RING + 16, alignItems: 'center', gap: 6 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  imageRing: {
    width: RING,
    height: RING,
    borderWidth: 2,
    borderRadius: RING / 2,
    padding: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 },
  neutralSwatch: { alignItems: 'center', justifyContent: 'center' },
  selectedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorLabel: { width: RING + 16 },
  sizeOptionWrap: { alignItems: 'center', gap: 4 },
  sizePill: {
    minWidth: 52,
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
});
