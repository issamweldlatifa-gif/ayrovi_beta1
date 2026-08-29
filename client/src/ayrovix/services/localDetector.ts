/**
 * AYROVIX LENS — On-device lightweight object detector (V0 category-agnostic).
 *
 * يُحمَّل TensorFlow.js + COCO-SSD وقت التشغيل من CDN (خفيف: lite_mobilenet_v2)
 * فقط عند دخول LIVE وأونلاين. يعطي boxes/classes/scores محليًا بدون سيرفر،
 * فيبقى الـ detection/tracking شغّالًا حتى لو تأجّلت مطابقة الـ cloud.
 *
 * إذا تعذّر التحميل (offline / متصفح غير داعم) → يرجع خطأ ويستعمل الـ runtime
 * مسار الـ fallback (توقيع الإطار + AI Core identification) بدون أي تزييف.
 *
 * ملاحظة: COCO يغطي فئات عامة (person/handbag/backpack/bottle/cell phone…)؛
 * توسيعه لأصناف fashion مخصوصة يحتاج نموذجًا مخصصًا لاحقًا (نقطة ربط جاهزة).
 */

export interface LocalPrediction {
  label: string;
  category: string;
  score: number; // 0..1
  bbox: [number, number, number, number]; // [x,y,w,h] px
}

export interface LocalDetector {
  detect: (source: HTMLCanvasElement | HTMLVideoElement) => Promise<LocalPrediction[]>;
}

const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

const loadScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.async = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(` Impossible de charger ${src}`));
  document.head.appendChild(s);
});

let loader: Promise<LocalDetector> | null = null;

export function loadLocalDetector(): Promise<LocalDetector> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!loader) {
    loader = (async () => {
      const w = window as any;
      if (!w.tf) await loadScript(TF_URL);
      if (!w.cocoSsd) await loadScript(COCO_URL);
      const model = await w.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      return {
        detect: async (source) => {
          const preds = await model.detect(source, 8, 0.35);
          return (preds || []).map((p: any) => ({
            label: String(p.class || 'object'),
            category: String(p.class || 'object'),
            score: Number(p.score) || 0,
            bbox: [Number(p.bbox?.[0] || 0), Number(p.bbox?.[1] || 0), Number(p.bbox?.[2] || 0), Number(p.bbox?.[3] || 0)] as [number, number, number, number],
          }));
        },
      };
    })();
    loader.catch(() => { loader = null; });
  }
  return loader;
}
