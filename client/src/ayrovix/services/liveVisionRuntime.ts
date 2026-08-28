import { analyzeImage } from './lensApi';
import { frameSignature, signatureDistance, liveObjectId } from './liveScanner';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';

/**
 * AYROVIX LENS — LiveVisionRuntime (REAL LIVE MODE).
 *
 * Pipeline: Camera → Frame Sampler → Product Detection → Tracking →
 * Confidence → Temporal Update → Live Overlay.
 *
 * - لا يرسل كل frame: إ sampling adaptif + تخطي المشهد غير المتغيّر.
 * - Tracking زمني (IoU / label) مع recovery عند الفقد، ولا إعادة اكتشاف من الصفر.
 * - Confidence manager: لا تُعرض نتيجة غير موثوقة كمؤكدة (lock بعد استقرار).
 * - Graceful degradation: إذا فشل الـ AI/الشبكة تبقى الكاميرا والـ tracking شغّالين
 *   مع status خفيف، ولا ينهار الـ Live.
 * - LIVE ≠ تسجيل فيديو: لا حفظ/رفع video؛ فقط تحليل الـ stream.
 */

export interface LiveBox { x: number; y: number; w: number; h: number; }

export interface LiveDetection {
  trackingId: string;
  label: string;
  category: string;
  confidence: number; // 0..100 (EMA مُنعّمة)
  rawConfidence: number;
  box: LiveBox | null;
  status: 'tracking' | 'locked' | 'lost';
  timestamp: number;
  misses: number;
  candidates: AyrovixCandidate[];
  detectedPrice?: AyrovixDetectedPrice | null;
  image?: string;
}

export type LiveStatus = 'idle' | 'live' | 'ai-unavailable' | 'low-confidence' | 'tracking-lost';

export const LOCK_THRESHOLD = 60;     // >= → قفل نتيجة
export const REDETECT_THRESHOLD = 35; // <  → إعادة اكتشاف
export const MAX_MISSES = 3;          // فقدان متتالي → lost/recovery

export const iou = (a: LiveBox, b: LiveBox): number => {
  const x1 = Math.max(a.x, b.x); const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w); const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
};

interface RawDetection { label: string; category: string; confidence: number; box: LiveBox | null; candidates: AyrovixCandidate[]; detectedPrice?: AyrovixDetectedPrice | null; image?: string; }

/** يطابق detections الجديدة مع tracks موجودة (IoU إن وجدت boxes، وإلا بالـ label). */
export function trackObjects(prev: LiveDetection[], next: RawDetection[], now: number): LiveDetection[] {
  const tracks = prev.map((t) => ({ ...t }));
  const used = new Set<number>();
  const out: LiveDetection[] = [];

  for (const det of next) {
    let bestIdx = -1; let bestScore = 0;
    tracks.forEach((t, i) => {
      if (used.has(i)) return;
      const score = det.box && t.box ? iou(det.box, t.box) : (t.label === det.label ? 0.5 : 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    if (bestIdx >= 0 && bestScore >= 0.3) {
      const t = tracks[bestIdx]; used.add(bestIdx);
      const raw = det.confidence;
      t.confidence = Math.round(t.confidence * 0.6 + raw * 0.4); // EMA/temporal smoothing
      t.rawConfidence = raw;
      t.box = det.box ?? t.box;
      t.label = det.label;
      t.candidates = det.candidates.length ? det.candidates : t.candidates;
      t.detectedPrice = det.detectedPrice ?? t.detectedPrice;
      t.image = det.image ?? t.image;
      t.misses = 0;
      t.timestamp = now;
      t.status = t.confidence >= LOCK_THRESHOLD ? 'locked' : 'tracking';
      out.push(t);
    } else {
      out.push({
        trackingId: liveObjectId(det.label),
        label: det.label, category: det.category,
        confidence: det.confidence, rawConfidence: det.confidence,
        box: det.box, status: det.confidence >= LOCK_THRESHOLD ? 'locked' : 'tracking',
        timestamp: now, misses: 0, candidates: det.candidates, detectedPrice: det.detectedPrice, image: det.image,
      });
    }
  }

  // tracks غير المطابقة: increment misses → recovery/lost
  tracks.forEach((t, i) => {
    if (used.has(i)) return;
    const misses = t.misses + 1;
    if (misses > MAX_MISSES) return; // أزل بعد محاولات الاسترداد
    out.push({ ...t, misses, status: 'lost', timestamp: now });
  });

  return out;
}

export interface LiveVisionState { objects: LiveDetection[]; status: LiveStatus; }

export interface LiveVisionRuntimeOptions {
  getVideo: () => HTMLVideoElement | null;
  onState: (state: LiveVisionState) => void;
  sampleInterval?: number;
}

export class LiveVisionRuntime {
  private opts: LiveVisionRuntimeOptions;
  private timer: number | null = null;
  private objects: LiveDetection[] = [];
  private lastSig = '';
  private inflight = false;
  private abort: AbortController | null = null;
  private aiFailures = 0;
  private stopped = true;

  constructor(opts: LiveVisionRuntimeOptions) { this.opts = opts; }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.objects = [];
    this.aiFailures = 0;
    this.emit('live');
    this.timer = window.setInterval(() => void this.tick(), this.opts.sampleInterval ?? 2200);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.abort?.abort(); this.abort = null;
    this.inflight = false;
    this.objects = [];
    this.emit('idle');
  }

  private emit(status: LiveStatus): void {
    this.opts.onState({ objects: this.objects.filter((o) => o.status !== 'lost' || o.misses <= MAX_MISSES), status });
  }

  private drawSample(): HTMLCanvasElement | null {
    const video = this.opts.getVideo();
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, 512 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  private toRawDetections(result: any, thumb: string): RawDetection[] {
    const id = result.identification || {};
    const conf = Math.round((Number(id.confidence) || 0) * 100);
    const products = Array.isArray(id.products) ? id.products : [];
    const withBox = products.filter((p: any) => Array.isArray(p?.box) && p.box.length === 4);
    if (withBox.length) {
      return withBox.slice(0, 6).map((p: any) => ({
        label: String(p.name || '').slice(0, 80) || 'Produit',
        category: String(p.category || 'product'),
        confidence: conf,
        box: { x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3] },
        candidates: result.candidates || [],
        detectedPrice: result.detectedPrice || null,
        image: thumb,
      }));
    }
    const desc = String(id.description || result.query || '');
    if ((Number(id.confidence) || 0) <= 0 || desc === 'PRODUIT_NON_IDENTIFIE') return [];
    return [{
      label: (result.candidates?.[0]?.title || desc).slice(0, 80),
      category: String(id.category || 'product'),
      confidence: conf,
      box: null,
      candidates: result.candidates || [],
      detectedPrice: result.detectedPrice || null,
      image: thumb,
    }];
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inflight) return;
    const canvas = this.drawSample();
    if (!canvas) return;
    const sig = frameSignature(canvas);
    if (sig && this.lastSig && signatureDistance(sig, this.lastSig) < 0.06) {
      // مشهد ثابت: استمر بالـ tracking بدون inference ثقيل
      this.objects = trackObjects(this.objects, [], Date.now());
      this.emit(this.objects.some((o) => o.status === 'locked') ? 'live' : 'low-confidence');
      return;
    }
    this.lastSig = sig;
    this.inflight = true;
    canvas.toBlob(async (blob) => {
      if (this.stopped || !blob) { this.inflight = false; return; }
      this.abort?.abort();
      const ctrl = new AbortController(); this.abort = ctrl;
      try {
        const result = await analyzeImage(new File([blob], 'ayrovix-live.jpg', { type: 'image/jpeg' }), ctrl.signal);
        this.aiFailures = 0;
        const thumb = canvas.toDataURL('image/jpeg', 0.6);
        const raw = this.toRawDetections(result, thumb);
        this.objects = trackObjects(this.objects, raw, Date.now());
        const hasLocked = this.objects.some((o) => o.status === 'locked');
        const anyTracking = this.objects.length > 0;
        this.emit(hasLocked ? 'live' : anyTracking ? 'low-confidence' : 'low-confidence');
      } catch {
        // Graceful degradation: الكاميرا والـ tracking يستمران، status خفيف
        this.aiFailures += 1;
        this.objects = trackObjects(this.objects, [], Date.now());
        this.emit(this.aiFailures >= 2 ? 'ai-unavailable' : 'live');
      } finally {
        this.inflight = false;
      }
    }, 'image/jpeg', 0.8);
  }
}
