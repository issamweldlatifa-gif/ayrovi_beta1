import { PUBLICATION_PALETTE as P } from './publicationDesign';
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { PublicationText as AppText } from './publicationDesign';
import { publicationTextStyle, PUBLICATION_TYPE } from './publicationDesign';

import { useI18n } from '@/i18n';

/** Keep combining marks/emoji intact when the platform supplies grapheme segmentation. */
export function publicationDescriptionGraphemes(text: string): string[] {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (locale: string, options: { granularity: string }) => {
        segment: (text: string) => Iterable<{ segment: string }>;
      };
    }
  ).Segmenter;
  if (Segmenter)
    return Array.from(
      new Segmenter('und', { granularity: 'grapheme' }).segment(text),
      (part) => part.segment
    );
  return Array.from(text).reduce<string[]>((parts, char) => {
    if (
      parts.length &&
      (/\p{Mark}|\uFE0F|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]/u.test(
        char
      ) ||
        (char === '\n' && parts[parts.length - 1] === '\r') ||
        (/[\u{1F1E6}-\u{1F1FF}]/u.test(char) &&
          /^[\u{1F1E6}-\u{1F1FF}]$/u.test(parts[parts.length - 1])) ||
        char === '\u200D' ||
        parts[parts.length - 1].endsWith('\u200D'))
    )
      parts[parts.length - 1] += char;
    else parts.push(char);
    return parts;
  }, []);
}
type Fit = {
  key: string;
  lo: number;
  hi: number;
  mid: number;
  done: boolean;
  overflow: boolean;
};
/** Measure the real paragraph AND inline suffix at the current width/font scale. */
export function PublicationDescription({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  const { locale } = useI18n();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const parts = useMemo(() => publicationDescriptionGraphemes(text), [text]);
  const key = JSON.stringify([
    text,
    width,
    fontScale,
    locale,
    publicationTextStyle(locale),
  ]);
  const search = fit?.key === key ? fit : null;
  const token = `${key}:${search?.mid ?? 'full'}:${search?.done ?? false}`;
  const latest = useRef(token);
  latest.current = token;
  const expanded = expandedText === text;
  const more = locale === 'ar' ? 'عرض المزيد' : 'Voir plus';
  const less = locale === 'ar' ? 'عرض أقل' : 'Voir moins';
  const prefix = (length: number) => parts.slice(0, length).join('').trimEnd();
  const suffix = (label: string) => (
    <Text
      style={{
        color: P.muted,
        fontFamily:
          locale === 'ar' ? 'NotoSansArabic-Regular' : PUBLICATION_TYPE.regular,
      }}
    >
      {label}
    </Text>
  );
  const measured = (height: number) => {
    if (latest.current !== token || !width) return;
    const fits = height <= (publicationTextStyle(locale).lineHeight || PUBLICATION_TYPE.bodyLine) * fontScale * 3 + 1;
    if (!search) {
      setFit(
        fits
          ? {
              key,
              lo: parts.length,
              hi: parts.length,
              mid: parts.length,
              done: true,
              overflow: false,
            }
          : {
              key,
              lo: 0,
              hi: parts.length,
              mid: Math.ceil(parts.length / 2),
              done: false,
              overflow: true,
            }
      );
      return;
    }
    if (search.done) return;
    const lo = fits ? search.mid : search.lo;
    const hi = fits ? search.hi : search.mid - 1;
    setFit({
      ...search,
      lo,
      hi,
      mid: lo >= hi ? lo : Math.ceil((lo + hi) / 2),
      done: lo >= hi,
    });
  };
  const ready = !!search?.done;
  const overflow = !!search?.overflow;
  return (
    <View
      testID="publication-description"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ position: 'relative' }}
    >
      <Pressable
        disabled={!ready || !overflow}
        accessible={ready && overflow}
        accessibilityRole={ready && overflow ? 'button' : undefined}
        accessibilityState={ready && overflow ? { expanded } : undefined}
        onPress={() => setExpandedText(expanded ? null : text)}
        style={overflow ? { minHeight: 44 } : undefined}
      >
        <AppText
          testID="publication-description-visible"
          color={color}
          numberOfLines={expanded || ready ? undefined : 3}
        >
          {expanded ? text : ready && overflow ? prefix(search!.lo) : text}
          {ready && overflow ? (
            <>
              {' '}
              {suffix(
                expanded ? less : `…\u00A0${more.replace(/ /g, '\u00A0')}`
              )}
            </>
          ) : null}
        </AppText>
      </Pressable>
      {width > 0 && !ready ? (
        <View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
        >
          <AppText
            key={`${key}-${search?.mid ?? 'full'}`}
            testID="publication-description-measure"
            color={color}
            onLayout={(e) => measured(e.nativeEvent.layout.height)}
          >
            {search ? prefix(search.mid) : text}
            {search ? (
              <> {suffix(`…\u00A0${more.replace(/ /g, '\u00A0')}`)}</>
            ) : null}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
