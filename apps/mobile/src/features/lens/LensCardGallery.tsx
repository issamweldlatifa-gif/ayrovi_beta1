import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { RADIUS } from '@/design/tokens.mobile';
import { LensResultMedia } from './LensResultMedia';
import { lensMediaChain } from './lensMedia';
import { LENS_COLORS } from './lensPalette';
/** Merchant images are pages. Proxy/reformat fallback URLs are NOT extra photos. */
export function LensCardGallery({
  images,
  title,
  onOpen,
  testID,
  accessibilityLabel,
}: {
  images: string[];
  title: string;
  onOpen: () => void;
  testID: string;
  accessibilityLabel: string;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(0);
  const firstDot = Math.max(0, Math.min(page - 3, images.length - 7));
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 51 }).current;
  const onVisible = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<string>[] }) => {
      const index = viewableItems.find((item) => item.isViewable)?.index;
      if (index != null) setPage(index);
    }
  ).current;
  return (
    <View
      testID={`${testID}-gallery`}
      style={StyleSheet.absoluteFill}
      onLayout={(event) =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
    >
      {width > 0 ? (
        <FlatList
          testID={`${testID}-pager`}
          style={StyleSheet.absoluteFill}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={images}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onVisible}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          scrollEventThrottle={32}
          renderItem={({ item, index }) => (
            <View style={{ width, height }}>
              <LensResultMedia
                sources={lensMediaChain(item, 'card')}
                title={title}
                onOpen={onOpen}
                testID={index === 0 ? testID : `${testID}-image-${index}`}
                accessibilityLabel={accessibilityLabel}
              />
            </View>
          )}
        />
      ) : null}
      {images.length > 1 ? (
        <View
          pointerEvents="none"
          style={styles.counter}
          testID={`${testID}-pagination`}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${page + 1}/${images.length}`}
        >
          {images.slice(firstDot, firstDot + 7).map((_, offset) => {
            const index = firstDot + offset;
            return (
              <View
                key={index}
                testID={`${testID}-dot-${index}`}
                style={[styles.dot, index === page && styles.activeDot]}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  counter: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: LENS_COLORS.resultLine,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: LENS_COLORS.resultMuted,
  },
  activeDot: { width: 14, backgroundColor: LENS_COLORS.black },
});
