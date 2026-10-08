/**
 * قسم LENS التعريفي (Q4، 08/10/2026).
 *
 * المرجع **خاصية**: الموقع يعرض قسماً يشرح LENS بعنوان ووصف ووسائط وCTA،
 * ومعو **محاكاة تلفون** تعرض نتيجة بحث. الشكل **أصلي React Native**.
 *
 * قاعدتان من الخادم نحترمهما زي ما يحبّ:
 *  • **الترتيب قرار إداري** (`elementOrder`) — نفس فكرة `home-blocks`: ما
 *    نثبّتوش نحنا في الكود.
 *  • القسم ينجم ما يبانش أبداً (`enabled: false` أو `null`)، وهذا **موّش
 *    خطأ** — ما نعرضش رسالة على حاجة الإدارة عطّلتها بقصد.
 *
 * والوسائط: فيديو ⇒ `expo-video` (صامت، يدور، يبدا لوحدو كما بعثها الخادم)؛
 * صورة ⇒ `Image`. والأنيميشن `Animated` مدمج (الترقية الكبرى في Q8).
 */
import { useCallback, useMemo } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { mediaUrl } from '@/api/client';
import { useLensHero } from '@/api/hooks';
import { lensHeroRatio, type LensHeroContent } from '@/api/lens';

type ElementId = 'eyebrow' | 'title' | 'description' | 'cta' | 'proof';

export interface LensHeroProps {
  /** يُنادى كان ما فمّاش `ctaUrl`: نفتح LENS موش رابط خارجي. */
  onOpenLens?: () => void;
}

export function LensHero({ onOpenLens }: LensHeroProps) {
  const theme = useTheme();
  const hero = useLensHero();
  const content = hero.data ?? null;

  const order = useMemo<ElementId[]>(() => {
    if (!content) return [];
    const declared = content.elementOrder.split(',').map((value) => value.trim()) as ElementId[];
    const known: ElementId[] = ['eyebrow', 'title', 'description', 'cta', 'proof'];
    // المُعلَن أوّلاً (بترتيب الإدارة)، ثم الناقص في الآخر — نفس قاعدة
    // `home-blocks`: السقوط من القائمة نقص بيانات، موش إرادة إخفاء.
    return [...declared.filter((value) => known.includes(value)), ...known.filter((value) => !declared.includes(value))];
  }, [content]);

  const openCta = useCallback(() => {
    if (!content) return;
    if (content.ctaUrl) {
      Linking.openURL(content.ctaUrl).catch(() => null);
      return;
    }
    if (onOpenLens) onOpenLens();
    else router.push('/(tabs)/lens');
  }, [content, onOpenLens]);

  // الإدارة عطّلاتو، أو ما تتضبطش ⇒ **والو يبان** (موّش خطأ).
  if (!content || !content.enabled) return null;

  const source = content.media.videoPath || content.media.videoUrl;
  const showVideo = content.media.type === 'VIDEO' && Boolean(source);
  const showImage = content.media.type === 'IMAGE' && Boolean(content.media.poster);

  const element = (id: ElementId) => {
    switch (id) {
      case 'eyebrow':
        return content.eyebrow ? (
          <AppText key={id} variant="caption" weight="bold" color={content.accentColor}>{content.eyebrow}</AppText>
        ) : null;
      case 'title':
        return content.title ? (
          <AppText key={id} variant="display" weight="bold">{content.title}</AppText>
        ) : null;
      case 'description':
        return content.description ? (
          <AppText key={id} variant="body" color={theme.colors.muted}>{content.description}</AppText>
        ) : null;
      case 'proof':
        return content.proofLine ? (
          <AppText key={id} variant="caption" color={theme.colors.muted}>{content.proofLine}</AppText>
        ) : null;
      case 'cta':
        return content.ctaLabel ? (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={content.ctaLabel}
            onPress={openCta}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: content.accentColor, borderRadius: theme.radius.cta, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <AppText variant="label" weight="bold" color="#000000">{content.ctaLabel}</AppText>
          </Pressable>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: content.bgColor || theme.colors.surface, borderRadius: theme.radius.card }]}>
      {content.bgImage ? (
        <Image source={{ uri: mediaUrl(content.bgImage) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      {showVideo ? <HeroVideo uri={source} muted={content.media.muted} loop={content.media.loop} ratio={content.media.ratio} /> : null}
      {showImage ? (
        <Image source={{ uri: mediaUrl(content.media.poster) }} style={[styles.image, { aspectRatio: lensHeroRatio(content.media.ratio) }]} resizeMode="cover" />
      ) : null}

      <View style={styles.body}>
        {order.map((id) => element(id))}
        {content.phoneEnabled ? <PhoneMockup content={content} /> : null}
      </View>
    </View>
  );
}

/**
 * مشغّل الفيديو — **مكوّن منفصل** لأنّ `useVideoPlayer` قاعدة من الـhooks:
 * استدعاؤه داخل `.map` أو شرط متغيّر يكسر ترتيب النداءات. هكذا المشغّل
 * يتبنى لوحدو ويتفكّك لوحدو.
 */
function HeroVideo({ uri, muted, loop, ratio }: { uri: string; muted: boolean; loop: boolean; ratio: string }) {
  const player = useVideoPlayer({ uri: mediaUrl(uri) }, (instance) => {
    instance.muted = muted;
    instance.loop = loop;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={[styles.image, { aspectRatio: lensHeroRatio(ratio) }]}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/**
 * محاكاة التلفون: النتيجة **كما بعثها الخادم**.
 *
 * لماذا: القسم يعرض «شنوة يطلع من LENS» — وأي رقم نخترعو هنا يولّي وعداً
 * كاذب. كل رقعة (السعر، الحالة، التوفّر) هي نصّ إداري، أو لا يبان.
 */
function PhoneMockup({ content }: { content: LensHeroContent }) {
  const theme = useTheme();
  const phone = content.phone;
  return (
    <View style={[styles.phone, { borderColor: theme.colors.line, backgroundColor: theme.colors.canvas }]}>
      {phone.image ? <Image source={{ uri: mediaUrl(phone.image) }} style={styles.phoneImage} resizeMode="cover" /> : null}
      {phone.statusLabel ? (
        <AppText variant="caption" color={content.accentColor}>{phone.statusLabel}</AppText>
      ) : null}
      {phone.resultLabel ? <AppText variant="caption" weight="bold">{phone.resultLabel}</AppText> : null}
      {phone.productName ? <AppText variant="label" weight="bold" numberOfLines={2}>{phone.productName}</AppText> : null}
      <View style={styles.chips}>
        {[phone.priceChip, phone.metaChip, phone.stockChip].filter(Boolean).map((chip) => (
          <View key={chip} style={[styles.chip, { borderColor: theme.colors.line }]}>
            <AppText variant="caption" color={theme.colors.muted}>{chip}</AppText>
          </View>
        ))}
      </View>
      {phone.ctaLabel ? (
        <AppText variant="caption" weight="bold" color={content.accentColor}>{phone.ctaLabel}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', marginTop: 12 },
  image: { width: '100%' },
  body: { padding: 16, gap: 8 },
  cta: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  phone: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 4, marginTop: 8, width: 190 },
  phoneImage: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
