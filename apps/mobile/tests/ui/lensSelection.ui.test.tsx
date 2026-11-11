import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LensSelectionView } from '@/features/lens/LensSelectionView';
import { LensCardGallery } from '@/features/lens/LensCardGallery';
import { LensPriceBlock } from '@/features/lens/LensPriceBlock';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
function wrap(node: React.ReactNode) {
  return (
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{node}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}
const coat = {
  name: 'Veste',
  category: 'jacket',
  box: { x: 0.1, y: 0.1, w: 0.7, h: 0.7 },
};
const bag = {
  name: 'Sac',
  category: 'bag',
  box: { x: 0.4, y: 0.4, w: 0.2, h: 0.25 },
};
it('selects the actual smallest containing product, asks vision on an unmatched tap, never invents a crop', async () => {
  const onCommit = jest.fn();
  render(
    wrap(
      <LensSelectionView
        uri="file:///photo.jpg"
        width={100}
        height={100}
        imageWidth={100}
        imageHeight={100}
        top={0}
        products={[coat, bag]}
        selection={bag.box}
        selectedIndex={1}
        detecting={false}
        onCommit={onCommit}
      />
    )
  );
  await act(async () => {});
  fireEvent.press(screen.getByTestId('lens-product-target'), {
    nativeEvent: { locationX: 50, locationY: 50 },
  });
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'product', index: 1 });
  fireEvent.press(screen.getByTestId('lens-product-target'), {
    nativeEvent: { locationX: 95, locationY: 95 },
  });
  expect(onCommit).toHaveBeenLastCalledWith({
    kind: 'point',
    point: { x: 0.95, y: 0.95 },
  });
  fireEvent(screen.getByTestId('lens-product-target'), 'accessibilityAction', { nativeEvent: { actionName: 'select-product-0' } });
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'product', index: 0 });
  expect(screen.getByTestId('lens-selected-product')).toBeTruthy();
  expect(screen.queryByTestId('lens-product-dot-0')).toBeNull();
  expect(screen.queryByTestId('lens-selection-frame')).toBeNull();
});
it('uses real gallery offsets for the image count, without confusing fallback URLs with pages', async () => {
  render(
    wrap(
      <LensCardGallery
        images={['/a.jpg', '/b.jpg', '/c.jpg']}
        title="Sac"
        onOpen={jest.fn()}
        testID="gallery"
        accessibilityLabel="Ouvrir"
      />
    )
  );
  await act(async () => {});
  fireEvent(screen.getByTestId('gallery-gallery'), 'layout', {
    nativeEvent: { layout: { width: 160, height: 200 } },
  });
  fireEvent(screen.getByTestId('gallery-pager'), 'layout', { nativeEvent: { layout: { width: 160, height: 200 } } });
  expect(screen.getByLabelText('1/3')).toBeTruthy();
  expect(screen.queryByText('1/3')).toBeNull();
  expect(screen.getByTestId('gallery-dot-0').props.style).toEqual(expect.arrayContaining([expect.objectContaining({width:14})]));
  fireEvent.scroll(screen.getByTestId('gallery-pager'), {
    nativeEvent: {
      contentOffset: { x: 160, y: 0 },
      layoutMeasurement: { width: 160, height: 200 },
      contentSize: { width: 480, height: 200 },
    },
  });
  expect(screen.getByLabelText('2/3')).toBeTruthy();
  expect(screen.getByTestId('gallery-dot-1').props.style).toEqual(expect.arrayContaining([expect.objectContaining({width:14})]));
  expect(screen.getByTestId('gallery-dot-0').props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({width:14})]));
  fireEvent.scroll(screen.getByTestId('gallery-pager'), {
    nativeEvent: {
      contentOffset: { x: 320, y: 0 },
      layoutMeasurement: { width: 160, height: 200 },
      contentSize: { width: 480, height: 200 },
    },
  });
  expect(screen.getByLabelText('3/3')).toBeTruthy();
});
it('does not render an unknown-price placeholder', async () => {
  render(
    wrap(
      <LensPriceBlock
        candidate={
          { price: null, priceTnd: null, currency: '', promo: null } as any
        }
      />
    )
  );
  await act(async () => {});
  expect(screen.queryByTestId('lens-price-block')).toBeNull();
  expect(screen.queryByText('Prix non publié')).toBeNull();
});

it('does not show a pagination indicator for a single image', async () => {
  render(wrap(<LensCardGallery images={['/one.jpg']} title="Produit" onOpen={jest.fn()} testID="single" accessibilityLabel="Ouvrir" />));
  await act(async()=>{});
  expect(screen.queryByTestId('single-pagination')).toBeNull();
});
it('bounds the dot strip and keeps the final active slide correct for long merchant galleries', async () => {
  render(wrap(<LensCardGallery images={Array.from({length:12},(_,i)=>`/${i}.jpg`)} title="Produit" onOpen={jest.fn()} testID="long" accessibilityLabel="Ouvrir" />));
  await act(async()=>{});
  fireEvent(screen.getByTestId('long-gallery'),'layout',{nativeEvent:{layout:{width:160,height:200}}});
  fireEvent(screen.getByTestId('long-pager'),'layout',{nativeEvent:{layout:{width:160,height:200}}});
  fireEvent(screen.getByTestId('long-pager'), 'contentSizeChange', 1920, 200);
  fireEvent.scroll(screen.getByTestId('long-pager'),{nativeEvent:{contentOffset:{x:1760,y:0},layoutMeasurement:{width:160,height:200},contentSize:{width:1920,height:200}}});
  await waitFor(() => expect(screen.getByLabelText('12/12')).toBeTruthy());
  expect(screen.getAllByTestId(/^long-dot-/)).toHaveLength(7);
  expect(screen.getByTestId('long-dot-11').props.style).toEqual(expect.arrayContaining([expect.objectContaining({width:14})]));
});

const flat = (node: any) => Object.assign({}, ...([node.props.style].flat(Infinity).filter(Boolean) as object[]));
it('style Pinterest Lens : photo voilée sans flou, produit net, deux arcs à la taille du produit', async () => {
  const view = (selection: typeof bag.box, index: number) => wrap(
    <LensSelectionView
      uri="file:///photo.jpg"
      width={400}
      height={400}
      imageWidth={100}
      imageHeight={100}
      top={0}
      products={[coat, bag]}
      selection={selection}
      selectedIndex={index}
      detecting={false}
      onCommit={jest.fn()}
    />
  );
  const { rerender } = render(view(coat.box, 0));
  await act(async () => {});
  expect(screen.getByTestId('lens-focus-dim')).toBeTruthy();
  expect(screen.getByTestId('lens-captured-preview').props.blurRadius ?? 0).toBe(0);
  expect(screen.queryByTestId('lens-search-ring')).toBeNull();
  const bigArc = flat(screen.getByTestId('lens-focus-arc-top')).width;
  expect(screen.getByTestId('lens-focus-arc-bottom')).toBeTruthy();
  // Veste : 280 × 280 points → arc de 30 ; sac : 80 × 100 → arc plus petit.
  expect(bigArc).toBe(30);
  rerender(view(bag.box, 1));
  await act(async () => {});
  expect(flat(screen.getByTestId('lens-focus-arc-top')).width).toBeLessThan(bigArc);
  // Rien de sélectionné (photo entière) : ni voile ni arcs.
  rerender(view({ x: 0, y: 0, w: 1, h: 1 }, -1));
  await act(async () => {});
  expect(screen.queryByTestId('lens-focus-dim')).toBeNull();
  expect(screen.queryByTestId('lens-focus-arc-top')).toBeNull();
});
