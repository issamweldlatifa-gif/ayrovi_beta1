import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
/** Measure the actual unconstrained text, including font scaling and viewport changes. */
export function PublicationDescription({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [shortHeight, setShortHeight] = useState(0);
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [text]);
  useEffect(() => {
    if (fullHeight && shortHeight) setOverflow(fullHeight > shortHeight + 1);
  }, [fullHeight, shortHeight]);
  return (
    <View style={{ position: 'relative' }}>
      <AppText
        onLayout={(e) => {
          if (!expanded) setShortHeight(e.nativeEvent.layout.height);
        }}
        color={color}
        numberOfLines={expanded ? undefined : 3}
      >
        {text}
      </AppText>
      <View
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
      >
        <AppText
          onLayout={(e) => setFullHeight(e.nativeEvent.layout.height)}
          color={color}
          onTextLayout={(e) => setOverflow(e.nativeEvent.lines.length > 3)}
        >
          {text}
        </AppText>
      </View>
      {overflow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <AppText variant="captionStrong">
            {expanded
              ? locale === 'ar'
                ? 'عرض أقل'
                : 'Voir moins'
              : locale === 'ar'
              ? 'عرض المزيد'
              : 'Voir plus'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
