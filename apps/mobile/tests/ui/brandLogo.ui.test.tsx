import { Animated } from "react-native";
import { render } from "@testing-library/react-native";
import { Path } from "react-native-svg";
import { BrandMark } from "../../src/design/BrandMark";
import { BrandLoadingIndicator } from "../../src/design/LoadingScreen";
import { BRAND_SYMBOL } from "../../src/design/brandSymbol";
import { BRAND_WORDMARK } from "../../src/design/brandWordmark";

const mockReduceMotion = jest.fn(() => false);
jest.mock("../../src/design/motion", () => ({
  useReduceMotion: () => mockReduceMotion(),
}));
jest.mock("../../src/design/theme", () => ({
  useTheme: () => ({
    colors: { ink: "#0A0A0A", muted: "#666666", line: "#E5E5E5" },
  }),
}));

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
});
