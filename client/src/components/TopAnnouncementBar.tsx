import React, { useEffect, useState } from 'react';

interface TopAnnouncementBarProps {
  onLearnMore?: () => void;
}

/** الرسالة الاحتياطية — لا يبقى الشريط فارغاً أبداً (المواصفة #10) */
const FALLBACK_MESSAGE = 'Prix confirmé avant commande';

/** الرسائل الافتراضية قبل تحميل محتوى الـ Admin أو عند فشل الطلب */
const DEFAULT_MESSAGES = [
  'Prix confirmé avant commande',
  'Dédouanement inclus',
  'Acompte sécurisé 20 %',
  'Livraison dans les 24 gouvernorats',
  'Service client 7j/7',
];

const HOLD_MS = 3400; // زمن عرض كل رسالة (3–4 ثوانٍ)
const EXIT_MS = 440;  // زمن خروج الرسالة القديمة قبل دخول الجديدة

export const TopAnnouncementBar: React.FC<TopAnnouncementBarProps> = () => {
  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // الرسائل ديناميكية من الـ Admin — والتصميم ثابت لا يُدار من الـ Admin
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/announcement-messages')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !result?.success || !Array.isArray(result.data)) return;
        const texts = result.data.map((row: any) => String(row.text || '').trim()).filter(Boolean);
        if (texts.length) {
          setMessages(texts);
          setIndex(0);
        }
      })
      .catch(() => {/* الفشل يُبقي الرسائل الافتراضية */ });
    return () => { cancelled = true; };
  }, []);

  // Vertical Ticker: الرسالة الحالية تصعد وتختفي ثم تدخل التالية من الأسفل
  useEffect(() => {
    if (messages.length < 2) return;
    let cancelled = false;
    let cycleTimer = 0;
    let swapTimer = 0;
    const schedule = () => {
      cycleTimer = window.setTimeout(() => {
        if (cancelled) return;
        setLeaving(true);
        swapTimer = window.setTimeout(() => {
          if (cancelled) return;
          setIndex((current) => (current + 1) % messages.length);
          setLeaving(false);
          schedule();
        }, EXIT_MS);
      }, HOLD_MS);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(cycleTimer);
      window.clearTimeout(swapTimer);
    };
  }, [messages]);

  const message = messages.length ? messages[Math.min(index, messages.length - 1)] : FALLBACK_MESSAGE;

  return (
    <div
      className="interface-announcement relative z-10 flex h-[44px] w-full items-center justify-center overflow-hidden px-4 text-center sm:h-[48px]"
      role="status"
      aria-live="polite"
    >
      {/* الرسالة الحالية — Fade + translate عمودي فقط */}
      <span
        className={`block whitespace-nowrap text-[14px] font-bold leading-none tracking-tight text-white sm:text-[15px] ${leaving ? 'announcement-out' : 'announcement-in'}`}
      >
        {message}
      </span>
      {/* خط AYROVI البرتقالي السفلي ثابت + وميض ضوئي شبه محسوس عند كل تبديل */}
      <span key={index} aria-hidden className="announcement-sweep" />
    </div>
  );
};
