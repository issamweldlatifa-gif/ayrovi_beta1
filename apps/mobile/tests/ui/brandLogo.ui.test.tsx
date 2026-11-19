import { Animated } from "react-native";
import { render } from "@testing-library/react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { ReactTestInstance } from "react-test-renderer";
import {
  BrandLogo,
  BrandMark,
  BrandSymbol,
  LOGO_SIZE,
  brandLogoWidth,
  brandSymbolWidthForRadius,
  brandToneForInk,
} from "../../src/design/BrandMark";
import { BrandLoadingIndicator, RING } from "../../src/design/LoadingScreen";
import { BRAND_LOGO, BRAND_MARK } from "../../src/design/brandSymbol";
import { BRAND } from "../../src/design/tokens.generated";
import { ReelPublisher } from "../../src/features/reels/ReelPublisher";

const mockReduceMotion = jest.fn(() => false);
let mockMode: "light" | "dark" = "light";
jest.mock("../../src/design/motion", () => ({
  useReduceMotion: () => mockReduceMotion(),
}));
jest.mock("../../src/design/theme", () => ({
  useTheme: () => ({
    mode: mockMode,
    colors: { ink: "#0A0A0A", muted: "#666666", line: "#E5E5E5", surface: "#FFFFFF", onMedia: "#FFFFFF" },
    text: () => ({}),
    isRTL: false,
  }),
}));

/** The <Svg> that draws the given contour. */
const svgDrawing = (root: ReturnType<typeof render>, d: string): ReactTestInstance =>
  root.UNSAFE_getAllByType(Svg).find((s) => s.findAll((n) => n.type === Path && n.props.d === d).length > 0)!;
const fills = (root: ReturnType<typeof render>) =>
  root.UNSAFE_getAllByType(Path).map((p) => [p.props.d, p.props.fill]);

afterEach(() => {
  jest.restoreAllMocks();
  mockReduceMotion.mockReturnValue(false);
  mockMode = "light";
});

describe("official « Za. » logo (v9)", () => {
  it("draws the light master on light surfaces: yellow circle with the z cut out, ink a, yellow dot", () => {
    const result = render(<BrandLogo height={32} />);
    expect(fills(result)).toEqual([
      [BRAND_LOGO.ring, BRAND.yellow],
      [BRAND_LOGO.a, BRAND.black],
      [BRAND_LOGO.dot, BRAND.yellow],
    ]);
    expect(BRAND.yellow).toBe("#F2AE00");
  });

  it("draws the dark master (white a) in the dark theme or on demand — circle and dot stay yellow", () => {
    mockMode = "dark";
    const themed = render(<BrandLogo />);
    expect(fills(themed)[1]).toEqual([BRAND_LOGO.a, BRAND.white]);
    mockMode = "light";
    const forced = render(<BrandLogo tone="dark" />);
    expect(fills(forced)).toEqual([
      [BRAND_LOGO.ring, BRAND.yellow],
      [BRAND_LOGO.a, BRAND.white],
      [BRAND_LOGO.dot, BRAND.yellow],
    ]);
  });

  it("never distorts the logo: width always follows the master ratio", () => {
    for (const h of [LOGO_SIZE.min, LOGO_SIZE.header, LOGO_SIZE.home, LOGO_SIZE.auth]) {
      const svg = svgDrawing(render(<BrandLogo height={h} />), BRAND_LOGO.a);
      expect(svg.props.height).toBe(h);
      expect(svg.props.width).toBeCloseTo((h * BRAND_LOGO.width) / BRAND_LOGO.height, 1);
      expect(svg.props.viewBox).toBe(BRAND_LOGO.viewBox);
    }
    expect(brandLogoWidth(1000)).toBeCloseTo(BRAND_LOGO.width, 1);
    expect(LOGO_SIZE.home).toBeGreaterThan(LOGO_SIZE.header);
  });

  it("keeps the z open: one contour whose lower bar crosses the circle's edge (never closed inside it)", () => {
    expect(BRAND_LOGO.ring).toBe(BRAND_MARK.d);
    expect(BRAND_LOGO.ring.match(/M/g)).toHaveLength(1); // single subpath: no second closed z inside the disc
    const [x, y] = BRAND_LOGO.ring.slice(1).split("A")[0].split(" ").map(Number);
    expect(Math.hypot(x - 500, y - 500)).toBeCloseTo(500, 0); // the bar starts ON the circle
  });

  it("picks the rendering from the surface's ink", () => {
    expect(brandToneForInk("#FFFFFF")).toBe("dark");
    expect(brandToneForInk("#fff")).toBe("dark");
    expect(brandToneForInk("#0A0A0A")).toBe("light");
    expect(brandToneForInk("currentColor")).toBe("light");
  });

  it("BrandMark keeps the full logo by default and the symbol alone without the name", () => {
    const result = render(<BrandMark size={30} />);
    expect(result.UNSAFE_getAllByType(Path)).toHaveLength(3);
    result.rerender(<BrandMark size={30} withName={false} />);
    expect(fills(result)).toEqual([[BRAND_MARK.d, BRAND.yellow]]);
  });
});

describe("loading and avatar", () => {
  it("shows the stationary yellow symbol while the arc turns, and stops on unmount", () => {
    const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    const loop = jest.spyOn(Animated, "loop").mockReturnValue(animation);
    const result = render(<BrandLoadingIndicator size={64} />);
    expect(result.UNSAFE_getAllByType(Path).find((p) => p.props.d === BRAND_MARK.d)?.props.fill).toBe(BRAND.yellow);
    expect(loop).toHaveBeenCalledTimes(1);
    expect(animation.start).toHaveBeenCalledTimes(1);
    result.unmount();
    expect(animation.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps the symbol visible without animating under reduced motion", () => {
    mockReduceMotion.mockReturnValue(true);
    const loop = jest.spyOn(Animated, "loop");
    const result = render(<BrandLoadingIndicator size={64} />);
    expect(result.UNSAFE_getAllByType(Path).some((p) => p.props.d === BRAND_MARK.d)).toBe(true);
    expect(loop).not.toHaveBeenCalled();
  });

  it("keeps the symbol's circle clear of the loading arc", () => {
    const result = render(<BrandLoadingIndicator />);
    const width = svgDrawing(result, BRAND_MARK.d).props.width as number;
    expect(width).toBe(brandSymbolWidthForRadius(RING.symbolRadius));
    expect(width / 2).toBeLessThanOrEqual(RING.size / 2 - RING.arc - 6);
    expect(render(<BrandSymbol width={40} />).UNSAFE_getByType(Svg).props.height).toBe(40);
  });

  it("shows the official Reel avatar as the social icon: black DISC, yellow mark + closer yellow dot", () => {
    const result = render(<ReelPublisher />);
    const path = result.UNSAFE_getByType(Path);
    expect(path.props.d).toBe(BRAND_MARK.d);
    expect(path.props.fill).toBe(BRAND.yellow);
    const tile = result.getByTestId("reel-publisher-avatar", { includeHiddenElements: true });
    expect(tile.props.style).toMatchObject({ width: 28, height: 28 });
    const rect = result.UNSAFE_getByType(Rect);
    expect(rect.props).toMatchObject({ width: 28, height: 28, fill: BRAND.black });
    expect(rect.props.rx).toBeCloseTo(14, 5); // 19/11 : disque (rayon = moitié du côté)
    const dot = result.UNSAFE_getByType(Circle);
    expect(dot.props.fill).toBe(BRAND.yellow);
  });
});
