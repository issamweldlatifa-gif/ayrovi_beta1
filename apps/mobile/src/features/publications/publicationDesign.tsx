/** Publication-only visual model. Never import from product/cart/payment features. */
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View, type TextStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { AppText, type AppTextProps } from '@/design/ui';
import { NavigationIcon } from '@/design/NavigationIcon';
import { useI18n, useT } from '@/i18n';

import { PUBLICATION_PALETTE, PUBLICATION_TYPE } from './publicationTokens';
export { PUBLICATION_PALETTE, PUBLICATION_TYPE } from './publicationTokens';
export function publicationTextStyle(
  locale: string,
  variant: AppTextProps['variant'] = 'body'
): TextStyle {
  const strong = /Strong|label|h[123]|overline|display/.test(variant || '');
  const caption = /caption|overline/.test(variant || '');
  return {
    fontFamily:
      locale === 'ar'
        ? strong
          ? 'NotoSansArabic-Bold'
          : 'NotoSansArabic-Regular'
        : strong
        ? PUBLICATION_TYPE.semibold
        : PUBLICATION_TYPE.regular,
    fontSize: caption
      ? PUBLICATION_TYPE.captionSize
      : variant === 'display' || variant === 'h1'
      ? PUBLICATION_TYPE.headlineSize
      : variant === 'h3' || variant === 'h2'
      ? PUBLICATION_TYPE.titleSize
      : PUBLICATION_TYPE.bodySize,
    lineHeight: caption
      ? PUBLICATION_TYPE.captionLine
      : variant === 'display' || variant === 'h1'
      ? PUBLICATION_TYPE.headlineLine
      : variant === 'h3' || variant === 'h2'
      ? PUBLICATION_TYPE.titleLine
      : locale === 'ar'
      ? PUBLICATION_TYPE.arabicBodyLine
      : PUBLICATION_TYPE.bodyLine,
  };
}
export function PublicationText({
  variant = 'body',
  color = PUBLICATION_PALETTE.ink,
  style,
  ...props
}: AppTextProps) {
  const { locale } = useI18n();
  return (
    <AppText
      {...props}
      variant={variant}
      color={color}
      style={[publicationTextStyle(locale, variant), style]}
    />
  );
}

/** Original, consistent rounded-line drawings. No Threads assets or fabricated actions. */
const drawings: Record<string, string> = {
  'link-outline':
    'm10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  'eye-outline':
    'M2 12c5-9 15-9 20 0-5 9-15 9-20 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  'eye-off-outline':
    'M3 3l18 18M6 6C4 8 3 10 2 12c5 9 15 9 20 0-2-4-5-6-9-7M9 10c-2 4 3 7 5 4',
  'heart-outline':
    'M12 21S2 15 2 8.5C2 2.5 9 1.5 12 6c3-4.5 10-3.5 10 2.5C22 15 12 21 12 21Z',
  'chatbubble-outline':
    'M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.3-4.7A9 9 0 1 1 21 11.5Z',
  'share-outline': 'm3 3 18 9-18 9 3.5-9L3 3Zm3.5 9H21',
  'send-outline': 'm3 3 18 9-18 9 3.5-9L3 3Zm3.5 9H21',
  'bookmark-outline': 'M6 3h12v18l-6-4-6 4V3Z',
  'thumbs-down-outline': 'M14 4H5L3 14h6v6c4 0 4-6 5-7V4Zm4 0h3v10h-3Z',
  'chevron-down': 'm7 10 5 5 5-5',
  'add-outline': 'M12 5v14M5 12h14',
  'information-circle-outline': 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 11v5.5M12 7.6v.2',
  'checkmark-outline': 'm5 12 4 4L19 6',
  close: 'm5 5 14 14M19 5 5 19',
  'search-outline': 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  'person-outline': 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21c0-9 18-9 18 0H3Z',
  'volume-mute': 'm3 9 4 0 5-5v16l-5-5H3V9Zm13 0 5 6m0-6-5 6',
  'volume-mute-outline': 'm3 9 4 0 5-5v16l-5-5H3V9Zm13 0 5 6m0-6-5 6',
  'volume-high':
    'm3 9 4 0 5-5v16l-5-5H3V9Zm12-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
  'volume-high-outline':
    'm3 9 4 0 5-5v16l-5-5H3V9Zm12-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
  'play-outline': 'm7 4 13 8-13 8V4Z',
  'pause-outline': 'M8 4v16M16 4v16',
  play: 'm7 4 13 8-13 8V4Z',
};
export function PublicationIcon(props: ComponentProps<typeof NavigationIcon>) {
  const {
    name,
    size = PUBLICATION_TYPE.icon,
    color = PUBLICATION_PALETTE.icon,
    style,
  } = props;
  if (/^(arrow|chevron)-(back|forward)/.test(String(name)))
    return <NavigationIcon {...props} />;
  const key =
    name === 'heart'
      ? 'heart-outline'
      : name === 'bookmark'
      ? 'bookmark-outline'
      : String(name);
  const hidden =
    Platform.OS === 'web'
      ? { 'aria-hidden': true as const }
      : {
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants' as const,
        };
  if (key === 'ellipsis-horizontal-outline')
    return (
      <Svg
        testID="publication-icon-options"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={style as any}
        {...hidden}
      >
        {[5, 12, 19].map((cx) => (
          <Circle key={cx} cx={cx} cy={12} r={1.5} fill={color} />
        ))}
      </Svg>
    );
  // Fail visibly during development instead of silently mixing icon families.
  const path = drawings[key];
  if (!path) throw new Error(`Unknown Publication glyph: ${name}`);
  return (
    <Svg
      testID={`publication-icon-${key}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style as any}
      {...hidden}
    >
      <Path
        d={path}
        fill={name === 'heart' || name === 'bookmark' ? color : 'none'}
        stroke={color}
        strokeWidth={PUBLICATION_TYPE.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * « Sponsorisé ⓘ » des blocs (planches Zalando) : la mention, puis le petit
 * « i » cerclé, sur une ligne, dans l'encre secondaire du fond.
 */
export function PublicationSponsored({ color, testID }: { color: string; testID?: string }) {
  const t = useT();
  return (
    <View testID={testID} style={sponsoredStyles.row}>
      <PublicationText variant="caption" color={color} numberOfLines={1}>{t('publication.sponsored')}</PublicationText>
      <PublicationIcon name="information-circle-outline" size={PUBLICATION_TYPE.infoIcon} color={color} />
    </View>
  );
}

const sponsoredStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
