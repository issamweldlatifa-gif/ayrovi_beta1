/**
 * يشترك في مقياس التسارع ما دام `enabled`، ويستدعي `onStill` مرة عند كل سكون كافٍ.
 * المستمع لا يُعاد إنشاؤه عند تغيّر `onStill`، فيبقى العدّ متصلاً بين الرسومات.
 */
import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';

import { INITIAL_STILLNESS, nextStillness, type StillnessState } from '@/features/lens/stillness';

/** فاصل القراءة (ملّي ثانية): كافٍ لاكتشاف السكون دون استهلاك للبطارية. */
const SAMPLE_MS = 100;

export function useStillness(enabled: boolean, onStill: () => void): void {
  const callback = useRef(onStill);
  callback.current = onStill;

  useEffect(() => {
    if (!enabled) return;
    let state: StillnessState = INITIAL_STILLNESS;
    Accelerometer.setUpdateInterval(SAMPLE_MS);
    const subscription = Accelerometer.addListener((sample) => {
      const next = nextStillness(state, sample, Date.now());
      state = next.state;
      if (next.fire) callback.current();
    });
    return () => subscription.remove();
  }, [enabled]);
}
