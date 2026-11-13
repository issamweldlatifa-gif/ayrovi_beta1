/**
 * جلسة الزائر على الجهاز: توليد مرّة، تخزين دائم، واسترجاع.
 *
 * علاش مخزّنة: السلّة تتبنى داخل جلسة الزائر على الخادم. بلا تخزين، كل فتح
 * للتطبيق يبدا جلسة جديدة والسلّة تبدو «ضاعت». التخزين يحلّها بلا أي تسجيل.
 *
 * علاش هنا موش في `src/api`: هذي واجهة الجهاز (AsyncStorage + crypto)، و`src/api`
 * يبقى نقي وقابل للاختبار في Node. نفس القاعدة اللي خرّجت `features/auth/browser`.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { formatSessionId, isValidSessionId } from './sessionId';

export const SESSION_KEY = 'ayrovi.session';

/** المعرّف الجاري في هذي العملية — يتفادى قراءة التخزين في كل شاشة. */
let cached: string | null = null;
/**
 * القراءة/التوليد اللي مازال يدور. أوّل فتحة للتطبيق، برشا شاشات تطلب المعرّف في
 * نفس اللحظة : بلا هذا، كل نداء يلقى التخزين فارغ ويولّد معرّف مختلف — السلّة
 * تتبنى على جلسة والشاشة الأخرى تقرا جلسة أخرى. نداء واحد يخدم، والبقية يستنّاوه.
 */
let pending: Promise<string> | null = null;

/**
 * يرجّع معرّف الجلسة، ويولّدو أول مرّة.
 *
 * إذا التخزين فشل (مثلاً جهاز مقفول)، نرجّع معرّفاً في الذاكرة: الخادم يقبلو،
 * والجلسة تخدم — غير ما تدومش بعد إغلاق التطبيق. ما نكذبوش على المستعمل
 * بحالة «محفوظة»؛ السلّة تخدم في الزوز الحالات.
 */
export function getSessionId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (!pending) pending = loadSessionId().finally(() => { pending = null; });
  return pending;
}

async function loadSessionId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (isValidSessionId(stored)) {
      cached = stored.trim();
      return cached;
    }
  } catch {
    cached = formatSessionId(Crypto.randomUUID());
    return cached;
  }
  const created = formatSessionId(Crypto.randomUUID());
  try {
    await AsyncStorage.setItem(SESSION_KEY, created);
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
export function useSessionId(): string {
  const [sessionId, setSessionId] = useState(cached ?? '');
  useEffect(() => {
    let alive = true;
    getSessionId()
      .then((value) => { if (alive) setSessionId(value); })
      .catch(() => { if (alive) setSessionId(''); });
    return () => { alive = false; };
  }, []);
  return sessionId;
}
