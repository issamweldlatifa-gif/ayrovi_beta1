import { Animated } from "react-native";
import { render } from "@testing-library/react-native";
import Svg, { Path } from "react-native-svg";
import type { ReactTestInstance } from "react-test-renderer";
import {
  BrandMark,
  BrandSymbol,
  BRAND_SYMBOL_SOLID_BELOW,
  brandSymbolWidthForRadius,
} from "../../src/design/BrandMark";
import { BrandLoadingIndicator, RING } from "../../src/design/LoadingScreen";
import {
  BRAND_SYMBOL,
  BRAND_SYMBOL_MAX_RADIUS,
  BRAND_SYMBOL_SOLID,
} from "../../src/design/brandSymbol";
import { ReelPublisher } from "../../src/features/reels/ReelPublisher";
import { BRAND_WORDMARK } from "../../src/design/brandWordmark";

const mockReduceMotion = jest.fn(() => false);
jest.mock("../../src/design/motion", () => ({
  useReduceMotion: () => mockReduceMotion(),
}));
jest.mock("../../src/design/theme", () => ({
  useTheme: () => ({
    colors: { ink: "#0A0A0A", muted: "#666666", line: "#E5E5E5", surface: "#FFFFFF", onMedia: "#FFFFFF" },
    text: () => ({}),
    isRTL: false,
  }),
}));

/** The <Svg> that draws the given contour (its width is the rendered symbol width). */
const svgDrawing = (root: ReturnType<typeof render>, d: string): ReactTestInstance =>
  root.UNSAFE_getAllByType(Svg).find((s) => s.findAll((n) => n.type === Path && n.props.d === d).length > 0)!;

afterEach(() => {
  jest.restoreAllMocks();
  mockReduceMotion.mockReturnValue(false);
});

describe("new zayrovi identity and grey loading", () => {
  it("renders the new symbol and lowercase outline, and supports a symbol-only avatar", () => {
    const result = render(<BrandMark size={30} />);
    expect(result.UNSAFE_getAllByType(Path).map((p) => p.props.d)).toEqual([
      BRAND_SYMBOL.d,
      BRAND_WORDMARK.d,
    ]);
    result.rerender(<BrandMark size={30} withName={false} />);
    expect(result.UNSAFE_getAllByType(Path).map((p) => p.props.d)).toEqual([
      BRAND_SYMBOL.d,
    ]);
  });

  it("uses a stationary grey new symbol while its arc animates, and stops on unmount", () => {
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    const loop = jest.spyOn(Animated, "loop").mockReturnValue(animation);
    const result = render(<BrandLoadingIndicator size={64} />);
    const symbol = result
      .UNSAFE_getAllByType(Path)
      .find((p) => p.props.d === BRAND_SYMBOL.d);
    expect(symbol?.props.fill).toBe("#666666");
    expect(loop).toHaveBeenCalledTimes(1);
    expect(animation.start).toHaveBeenCalledTimes(1);
    result.unmount();
    expect(animation.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps the grey identity visible without starting an animation under reduced motion", () => {
    mockReduceMotion.mockReturnValue(true);
    const loop = jest.spyOn(Animated, "loop");
    const result = render(<BrandLoadingIndicator size={64} />);
    expect(
      result.UNSAFE_getAllByType(Path).find((p) => p.props.d === BRAND_SYMBOL.d)
        ?.props.fill
    ).toBe("#666666");
    expect(loop).not.toHaveBeenCalled();
  });

  it("draws the striped Z from 24 dp and the solid Z below, where stripes would blur", () => {
    const at = (width: number) =>
      render(<BrandSymbol width={width} color="#0A0A0A" />).UNSAFE_getByType(Path).props.d;
    expect(at(BRAND_SYMBOL_SOLID_BELOW)).toBe(BRAND_SYMBOL.d);
    expect(at(BRAND_SYMBOL_SOLID_BELOW - 1)).toBe(BRAND_SYMBOL_SOLID.d);
    expect(
      render(<BrandSymbol width={16} color="#0A0A0A" variant="striped" />).UNSAFE_getByType(Path).props.d
    ).toBe(BRAND_SYMBOL.d);
  });

  it("fits the Z inside the loading ring by its farthest point, not by its width", () => {
    const result = render(<BrandLoadingIndicator />);
    const svg = svgDrawing(result, BRAND_SYMBOL.d);
    const width = brandSymbolWidthForRadius(RING.symbolRadius);
    expect(svg.props.width).toBe(width);
    const farthest = (width / BRAND_SYMBOL.width) * BRAND_SYMBOL_MAX_RADIUS;
    // Ring centre line is at 65 with a 6 dp arc: keep at least 8 dp between the Z and the arc's inner edge.
    expect(farthest).toBeLessThanOrEqual(RING.size / 2 - RING.arc - 8 + 0.1);
  });

  it("shows the official Reel avatar as the ink Z inside its circle (solid at 28 dp), never a blue symbol", () => {
    const result = render(<ReelPublisher />);
    const path = result.UNSAFE_getByType(Path);
    expect(path.props.d).toBe(BRAND_SYMBOL_SOLID.d);
    expect(path.props.fill).toBe("#0A0A0A");
    const width = svgDrawing(result, BRAND_SYMBOL_SOLID.d).props.width as number;
    expect((width / BRAND_SYMBOL.width) * BRAND_SYMBOL_MAX_RADIUS).toBeLessThanOrEqual(11.05);
  });
});
