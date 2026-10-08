/**
 * جلسة AYWEBs على الجهاز: توليد مرّة، تخزين دائم، واسترجاع.
 *
 * علاش مخزّنة: السلّة تتبنى داخل جلسة AYWEBs على الخادم. بلا تخزين، كل فتح
 * للتطبيق يبدا جلسة جديدة والسلّة تبدو «ضاعت». التخزين يحلّها بلا أي تسجيل.
 *
 * علاش هنا موش في `src/api`: هذي واجهة الجهاز (AsyncStorage + crypto)، و`src/api`
 * يبقى نقي وقابل للاختبار في Node. نفس القاعدة اللي خرّجت `features/auth/browser`.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { formatAyWebsSessionId, isValidAyWebsSessionId } from './sessionId';

export const AYWEBS_SESSION_KEY = 'ayrovi.aywebs.session';

/** المعرّف الجاري في هذي العملية — يتفادى قراءة التخزين في كل شاشة. */
let cached: string | null = null;

/**
 * يرجّع معرّف الجلسة، ويولّدو أول مرّة.
 *
 * إذا التخزين فشل (مثلاً جهاز مقفول)، نرجّع معرّفاً في الذاكرة: الخادم يقبلو،
 * والجلسة تخدم — غير ما تدومش بعد إغلاق التطبيق. ما نكذبوش على المستعمل
 * بحالة «محفوظة»؛ السلّة تخدم في الزوز الحالات.
 */
export async function getAyWebsSessionId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(AYWEBS_SESSION_KEY);
    if (isValidAyWebsSessionId(stored)) {
      cached = stored.trim();
      return cached;
    }
  } catch {
    cached = formatAyWebsSessionId(Crypto.randomUUID());
    return cached;
  }
  const created = formatAyWebsSessionId(Crypto.randomUUID());
  try {
    await AsyncStorage.setItem(AYWEBS_SESSION_KEY, created);
  } catch {
    // التخزين ما خدمش: الجلسة تبقى صالحة في الذاكرة.
  }
  cached = created;
  return created;
}

/**
 * الـ hook متاع الشاشات: `''` معناها «مازال ما تحضّراتش».
 * الشاشة تستعملها باش تمنع الأزرار قبل ما يولي المعرّف حاضر — زر ما ينجمش
 * ينجح خير من زر يفشل.
 */
export function useAyWebsSessionId(): string {
  const [sessionId, setSessionId] = useState(cached ?? '');
  useEffect(() => {
    let alive = true;
    getAyWebsSessionId()
      .then((value) => { if (alive) setSessionId(value); })
      .catch(() => { if (alive) setSessionId(''); });
    return () => { alive = false; };
  }, []);
  return sessionId;
}
