import { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { REACTION_COLORS } from '@/design/tokens.mobile';
import { HEART_PATH } from '@/features/reels/ReelIcons';

/** Solid, slightly tilted white thumb and detached cuff, drawn on a 24×24 grid. */
const THUMB = 'M8.3 10.7 C10.5 9.5 11.3 7.7 11.3 5.7 V4.5 C11.3 3.3 12.6 2.9 13.5 3.6 C14.9 4.7 15.2 7.2 14.5 9.5 H18.5 C20.2 9.5 21.1 10.7 20.8 12.3 L19.5 17.7 C19.1 19.2 18.1 20.2 16.4 20.2 H11 Q9.4 20.2 8.3 19.2 Z';

export function ReactionMark({ reaction, size, color }: { reaction: 'like' | 'love'; size: number; color?: string }) {
  const id = `reaction-${useId().replace(/[^a-z0-9-]/gi, '')}`;
  const disc = color === undefined;
  const stops = reaction === 'like' ? REACTION_COLORS.likeDisc : REACTION_COLORS.loveDisc;
  const ink = color ?? REACTION_COLORS.onDisc;
  return (
    <Svg testID={`reaction-mark-${reaction}-${disc ? 'disc' : 'solid'}`} width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {disc ? (
        <>
          <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={stops[0]} /><Stop offset="1" stopColor={stops[1]} />
          </LinearGradient></Defs>
          <Circle cx={12} cy={12} r={12} fill={`url(#${id})`} />
        </>
      ) : null}
      <G fill={ink} transform={disc ? 'translate(12 12) scale(0.75) translate(-12 -12)' : undefined}>
        {reaction === 'like' ? (
          <G transform="rotate(-10 12 12)">
            <Rect x={3.4} y={10.9} width={3.6} height={9.3} rx={1.15} />
            <Path d={THUMB} />
          </G>
        ) : <Path d={HEART_PATH} />}
      </G>
    </Svg>
  );
}
