import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Rect } from 'react-native-svg';
import { useTheme } from '@/design/theme';
import type { GiftDesign, GiftFormat } from '../../../../../shared/giftCardPreview';

// Original impression of printed paper; these inks are local to the illustrations.
const inks = {
  cream: '#F9EFD4', lilac: '#AC8AF4', plum: '#40216C', yellow: '#FFE65A', violet: '#703DD2',
  green: '#126A54', mint: '#9BE4BE', berry: '#CC316B', rose: '#F59AB6', blue: '#343DAB', charcoal: '#211932',
} as const;
const schemes: Record<GiftDesign, readonly [string, string, string]> = {
  sunburst: [inks.lilac, inks.plum, inks.yellow], ribbon: [inks.green, inks.mint, inks.berry],
  bloom: [inks.rose, inks.plum, inks.cream], confetti: [inks.cream, inks.berry, inks.blue],
  orbit: [inks.blue, inks.mint, inks.rose], mosaic: [inks.yellow, inks.violet, inks.charcoal],
};

export function GiftArt({ design, format }: { design: GiftDesign; format: GiftFormat }) {
  const [paper, dark, bright] = schemes[design];
  const physical = format === 'physical';
  return <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 180 225" preserveAspectRatio="xMidYMid slice" accessible={false}>
      {physical ? <>
        <Rect width={180} height={225} fill={inks.cream} />
        <Circle cx={148} cy={33} r={85} fill={paper} opacity={0.25} />
        <Path d="M12 151L126 89l49 82-119 36z" fill={dark} opacity={0.12} />
        <Rect x={26} y={98} width={132} height={84} rx={8} fill={dark} transform="rotate(9 90 140)" />
        <Path d="M26 103l65 46 65-46" fill="none" stroke={paper} strokeWidth={2} transform="rotate(9 90 140)" />
      </> : null}
      <G transform={physical ? 'translate(39 46) rotate(-11 56 65) scale(.63)' : undefined}>
        <Rect width={180} height={225} rx={8} fill={paper} />
        {design === 'sunburst' ? <>
          <Path d="M0 225V169L91 112 0 90V64l92 45L35 0H63l33 106 31-106h25l-53 109 81-60v30l-77 34 77 52v33l-83-80 19 107H89l3-107Z" fill={dark} />
          <Polygon points="92,60 105,94 141,92 113,115 124,151 92,130 61,151 72,115 44,92 80,94" fill={bright} />
        </> : design === 'ribbon' ? <>
          <Path d="M0 185L180 104v121H0z" fill={dark} />
          <Path d="M0 123q92 6 138-70c27-46-57-53-50 48 7 77 46 110 67 124M90 97C91 9 21 20 24 58c3 38 87 56 156 21" fill="none" stroke={bright} strokeWidth={17} strokeLinecap="round" />
        </> : design === 'bloom' ? <>
          <Path d="M0 168L180 66v159H0z" fill={dark} />
          {[0, 72, 144, 216, 288].map(angle => <Circle key={angle} cx={90} cy={61} r={38} fill={bright} transform={`rotate(${angle} 90 111)`} />)}
          <Circle cx={90} cy={111} r={26} fill={paper} />
        </> : design === 'confetti' ? <>
          {[28, 85, 142].map((x, i) => <G key={x} transform={`translate(${x} ${35 + (i % 2) * 25}) rotate(${14 + i * 21})`}>
            <Rect width={24} height={56} rx={6} fill={i % 2 ? bright : dark} /><Circle cx={16} cy={105} r={16} fill={i % 2 ? dark : bright} />
          </G>)}
          <Path d="M0 186l43-26 41 22 42-16 54 34v25H0z" fill={bright} />
        </> : design === 'orbit' ? <>
          <Circle cx={90} cy={104} r={54} fill={dark} /><Circle cx={90} cy={104} r={24} fill={paper} />
          <Path d="M0 148C30 161 167 98 172 68c3-17-34-9-60-1M3 172q39 12 117-32 78-48 60-59" fill="none" stroke={bright} strokeWidth={10} />
          <Circle cx={38} cy={44} r={13} fill={bright} /><Circle cx={134} cy={174} r={18} fill={dark} />
        </> : <>
          <Path d="M0 0h92v83H0zM92 83h88v83H92zM0 166h92v59H0z" fill={dark} />
          <Path d="M0 82l91-82v82zM92 165l88-82v83zM0 225l92-59v59z" fill={bright} />
          <Circle cx={89} cy={111} r={33} fill={paper} /><Circle cx={89} cy={111} r={15} fill={bright} />
        </>}
      </G>
    </Svg>
  </View>;
}

export function GiftWalletArt() {
  const { colors } = useTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={168} height={120} viewBox="0 0 168 120" accessible={false}>
      <Circle cx={84} cy={59} r={48} fill={colors.accentSoft} />
      <G stroke={colors.ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M20 34h12m-6-6v12m106 38h16m-8-8v16m-13-73h10m-5-5v10" />
        <Rect x={46} y={29} width={77} height={57} rx={7} transform="rotate(-12 84 57)" fill={colors.canvas} />
        <Path d="M75 48c-17-13-20 9 9 7 29 2 26-20 9-7l-9 7-9-7Zm9 7v17m-13-6 13-11 13 11" transform="rotate(-12 84 57)" fill="none" />
        <Path d="M36 66h96v32a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6z" fill={colors.canvas} />
        <Path d="M37 67l47 26 47-26" fill="none" />
      </G>
    </Svg>
  </View>;
}

const styles = StyleSheet.create({ art: { width: '100%', aspectRatio: 0.8 } });
