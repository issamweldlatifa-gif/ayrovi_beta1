/**
 * Hero de l'accueil : visuel + copie éditoriale, exactement les mêmes données
 * que la vitrine (`/api/public/hero/active` et `/hero-content`).
 *
 * Ce qui est volontairement identique au site :
 *  • l'ordre des éléments vient de `elementOrder` (piloté depuis l'Admin) ;
 *  • `highlight` met en avant un fragment du titre ;
 *  • un CTA sans destination valide n'est jamais rendu — pas de bouton mort.
 *
 * Ce qui diffère : pas de `srcset` (React Native choisit une seule source), et
 * le visuel est posé au-dessus de la copie plutôt qu'en fond, pour rester
 * lisible dans les deux thèmes sans dépendre d'un dégradé.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n } from '@/i18n';
import { mediaUrl } from '@/api/client';
import type { HeroContent, HeroVisual } from '@/api/public';

const safeHref = (value: string): string => (value.startsWith('/') || /^https?:\/\//i.test(value) ? value : '');

const FALLBACK_ORDER = 'eyebrow,title,description,cta';

export function HighlightedTitle({ title, highlight }: { title: string; highlight: string }) {
  const theme = useTheme();
  const lines = title.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  return (
    <AppText variant="display" weight="bold">
      {lines.map((line, index) => {
        const at = highlight ? line.indexOf(highlight) : -1;
        return (
          <AppText key={`${index}-${line}`} variant="display" weight="bold">
            {index > 0 ? '\n' : ''}
            {at < 0 ? line : (
              <>
                {line.slice(0, at)}
                <AppText variant="display" weight="bold" color={theme.colors.accentText}>{highlight}</AppText>
                {line.slice(at + highlight.length)}
              </>
            )}
          </AppText>
        );
      })}
    </AppText>
  );
}

export function HeroSection({
  content, visual, onCta,
}: { content: HeroContent | null; visual: HeroVisual | null; onCta: (href: string) => void }) {
  const theme = useTheme();
  const { locale } = useI18n();

  // Rien de publié côté Admin : on le dit, on n'invente pas un slogan.
  if (!content || !content.enabled) {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
        <AppText variant="title" weight="bold">AYROVI</AppText>
        <AppText variant="body" color={theme.colors.secondary}>
          {locale === 'ar'
            ? 'المحتوى غير متوفّر توّا (ما ثمّاش محتوى منشور في لوحة التحكّم).'
            : 'Contenu momentanément indisponible (rien de publié depuis l’Admin).'}
        </AppText>
      </View>
    );
  }

  const order = (content.elementOrder || FALLBACK_ORDER)
    .split(',').map((key) => key.trim()).filter(Boolean);
  const href = safeHref(content.ctaUrl);
  const image = visual ? mediaUrl(visual.mobileImageUrl || visual.imageUrl) : '';
  const ratio = visual && visual.imageWidth && visual.imageHeight
    ? visual.imageWidth / visual.imageHeight
    : 16 / 9;

  const blocks: Record<string, ReactNode> = {
    eyebrow: content.eyebrow ? (
      <AppText key="eyebrow" variant="caption" weight="bold" color={theme.colors.accentText}>
        {content.eyebrow.toUpperCase()}
      </AppText>
    ) : null,
    title: content.title
      ? <HighlightedTitle key="title" title={content.title} highlight={content.highlight} />
      : null,
    description: content.description ? (
      <AppText key="description" variant="body" color={theme.colors.secondary}>{content.description}</AppText>
    ) : null,
    cta: content.ctaLabel && href ? (
      <Pressable
        key="cta"
        accessibilityRole="link"
        onPress={() => onCta(href)}
        style={({ pressed }) => [
          styles.cta,
          {
            minHeight: theme.geometry.minTarget,
            borderRadius: theme.radius.cta,
            backgroundColor: pressed ? theme.colors.actionHover : theme.colors.action,
            paddingHorizontal: theme.space[4],
          },
        ]}
      >
        <AppText variant="label" weight="bold" color={theme.colors.onAction}>{content.ctaLabel}</AppText>
      </Pressable>
    ) : null,
  };

  return (
    <View style={styles.wrap}>
      {image ? (
        <AppImage
          uri={image}
          accessibilityLabel={visual?.altText || undefined}
          decorative={!visual?.altText}
          contentFit="cover"
          style={[
            styles.image,
            { aspectRatio: ratio, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface },
          ]}
        />
      ) : null}
      <View style={styles.copy}>
        {order.map((key) => blocks[key] ?? null)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { gap: 8, padding: 16 },
  image: { width: '100%' },
  copy: { gap: 8, alignItems: 'flex-start' },
  cta: { alignItems: 'center', justifyContent: 'center' },
});
