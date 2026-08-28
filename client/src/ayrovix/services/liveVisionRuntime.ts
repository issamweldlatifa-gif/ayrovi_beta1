import { analyzeImage } from './lensApi';
import { frameSignature, signatureDistance, liveObjectId } from './liveScanner';
import { loadLocalDetector, type LocalDetector } from './localDetector';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';

/**
 * AYROVIX LENS — LiveVisionRuntime (REAL LIVE MODE, V0 category-agnostic).
 *
 * Pipeline: Camera → Frame Sampler → Product Detection → Tracking(DETECT→TRACK→
 * PREDICT→UPDATE) → Confidence(EMA) → Temporal Update → Live Overlay.
 *
 * - Adaptive inference FPS منفصل عن preview FPS (لا يُحجب الـ rendering).
 * - Offline: الكاميرا والـ tracking المحلي يستمران، والـ cloud matching يتأجل حتى العودة.
 * - Analytics: أحداث مجهولة عبر onEvent (لا صورة/لا IP/لا بيانات شخصية).
 * - Graceful degradation: فشل الـ AI لا يُسقط الـ Live.
 */

export interface LiveBox { x: number; y: number; w: number; h: number; }

export interface LiveDetection {
  trackingId: string;
  label: string;
  category: string;
  confidence: number;
  rawConfidence: number;
  box: LiveBox | null;
  status: 'tracking' | 'locked' | 'lost';
  timestamp: number;
  misses: number;
  vx: number; vy: number;
  color: string[];
  pattern: string | null;
  material: string | null;
  candidates: AyrovixCandidate[];
  detectedPrice?: AyrovixDetectedPrice | null;
  image?: string;
}

export type LiveStatus = 'idle' | 'live' | 'ai-unavailable' | 'low-confidence' | 'tracking-lost' | 'offline';
export type LiveEventType = 'live_opened' | 'object_detected' | 'object_locked' | 'tracking_lost' | 'ai_unavailable' | 'match_requested' | 'match_returned';

export const LOCK_THRESHOLD = 60;
export const REDETECT_THRESHOLD = 35;
export const MAX_MISSES = 3;
export const PREDICT_FRAMES = 2;

/** يحسب مستطيل القصّ بالبكسل لصندوق مُطبَّع، مقيّدًا داخل أبعاد الـ canvas. */
export const computeCropRect = (canvasW: number, canvasH: number, box: LiveBox) => {
  const w = Math.min(canvasW, Math.max(32, Math.round(box.w * canvasW)));
  const h = Math.min(canvasH, Math.max(32, Math.round(box.h * canvasH)));
  const x = Math.min(Math.max(0, Math.round(box.x * canvasW)), canvasW - w);
  const y = Math.min(Math.max(0, Math.round(box.y * canvasH)), canvasH - h);
  return { x, y, w, h };
};

export const iou = (a: LiveBox, b: LiveBox): number => {
  const x1 = Math.max(a.x, b.x); const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w); const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
};

/** Adaptive inference interval: يبطئ عند inference بطيء ويسرع عند القدرة. */
export const adaptiveNextInterval = (current: number, latencyMs: number): number => {
  const factor = latencyMs > 1500 ? 1.4 : latencyMs < 400 ? 0.85 : 1;
  return Math.round(Math.min(4000, Math.max(1200, current * factor)));
};

interface RawDetection { label: string; category: string; confidence: number; box: LiveBox | null; color: string[]; pattern: string | null; material: string | null; candidates: AyrovixCandidate[]; detectedPrice?: AyrovixDetectedPrice | null; image?: string; }

/** DETECT→TRACK→PREDICT→UPDATE: مطابقة IoU/label + تنبؤ بالحركة عند الغياب + recovery. */
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
      // UPDATE: velocity من فرق الـ box (لتنبؤ لاحق)
      if (det.box && t.box) { t.vx = det.box.x - t.box.x; t.vy = det.box.y - t.box.y; }
      t.confidence = Math.round(t.confidence * 0.6 + det.confidence * 0.4);
      t.rawConfidence = det.confidence;
      t.box = det.box ?? t.box;
      t.label = det.label; t.category = det.category;
      t.candidates = det.candidates.length ? det.candidates : t.candidates;
      t.detectedPrice = det.detectedPrice ?? t.detectedPrice;
      t.image = det.image ?? t.image;
      t.color = det.color.length ? det.color : t.color;
      t.pattern = det.pattern ?? t.pattern;
      t.material = det.material ?? t.material;
      t.misses = 0; t.timestamp = now;
      t.status = t.confidence >= LOCK_THRESHOLD ? 'locked' : (t.confidence < REDETECT_THRESHOLD ? 'tracking' : t.status === 'locked' ? 'locked' : 'tracking');
      out.push(t);
    } else {
      out.push({
        trackingId: liveObjectId(det.label), label: det.label, category: det.category,
        confidence: det.confidence, rawConfidence: det.confidence, box: det.box,
        status: det.confidence >= LOCK_THRESHOLD ? 'locked' : 'tracking',
        timestamp: now, misses: 0, vx: 0, vy: 0,
        color: det.color, pattern: det.pattern, material: det.material,
        candidates: det.candidates, detectedPrice: det.detectedPrice, image: det.image,
      });
    }
  }

  // PREDICT/UPDATE للـ tracks غير المطابقة: تنبؤ بالحركة ثم recovery ثم lost
  tracks.forEach((t) => {
    if (out.some((o) => o.trackingId === t.trackingId)) return;
    const misses = t.misses + 1;
    if (misses <= PREDICT_FRAMES && t.box) {
      const predicted = { x: Math.min(1, Math.max(0, t.box.x + t.vx)), y: Math.min(1, Math.max(0, t.box.y + t.vy)), w: t.box.w, h: t.box.h };
      out.push({ ...t, box: predicted, misses, status: 'tracking', confidence: Math.max(REDETECT_THRESHOLD, Math.round(t.confidence * 0.9)), timestamp: now });
      return;
    }
    if (misses > MAX_MISSES) return; // إزالة بعد محاولات الاسترداد
    out.push({ ...t, misses, status: 'lost', timestamp: now });
  });

  return out;
}

export interface LiveVisionState { objects: LiveDetection[]; status: LiveStatus; }

export interface LiveVisionRuntimeOptions {
  getVideo: () => HTMLVideoElement | null;
  onState: (state: LiveVisionState) => void;
  onEvent?: (type: LiveEventType, meta?: Record<string, number | string>) => void;
  baseInterval?: number;
}

export class LiveVisionRuntime {
  private opts: LiveVisionRuntimeOptions;
  private timer: number | null = null;
  private interval: number;
  private objects: LiveDetection[] = [];
  private lastSig = '';
  private lastCanvas: HTMLCanvasElement | null = null;
  private matchingIds = new Set<string>();
  private detector: LocalDetector | null = null;
  private inflight = false;
  private abort: AbortController | null = null;
  private aiFailures = 0;
  private online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  private stopped = true;
  private onOnline = () => { this.online = true; this.aiFailures = 0; this.emit(); };
  private onOffline = () => { this.online = false; this.emit(); };

  constructor(opts: LiveVisionRuntimeOptions) { this.opts = opts; this.interval = opts.baseInterval ?? 2200; }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.objects = []; this.aiFailures = 0; this.lastSig = '';
    if (typeof window !== 'undefined') { window.addEventListener('online', this.onOnline); window.addEventListener('offline', this.onOffline); }
    // كشف محلي خفيف (اختياري): إن تعذّر تحميله يبقى مسار الـ fallback شغّالًا
    loadLocalDetector().then((d) => { if (!this.stopped) this.detector = d; }).catch(() => { this.detector = null; });
    this.opts.onEvent?.('live_opened');
    this.emit();
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) { window.clearTimeout(this.timer); this.timer = null; }
    if (typeof window !== 'undefined') { window.removeEventListener('online', this.onOnline); window.removeEventListener('offline', this.onOffline); }
    this.abort?.abort(); this.abort = null; this.inflight = false;
    this.detector = null;
    this.objects = [];
    this.opts.onState({ objects: [], status: 'idle' });
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = window.setTimeout(() => { void this.tick(); }, this.interval);
  }

  private emit(): void {
    const visible = this.objects.filter((o) => o.status !== 'lost');
    const hasLocked = visible.some((o) => o.status === 'locked');
    const status: LiveStatus = !this.online ? 'offline'
      : this.aiFailures >= 2 ? 'ai-unavailable'
        : hasLocked ? 'live'
          : visible.length ? 'low-confidence' : 'live';
    this.opts.onState({ objects: visible, status });
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
    const str = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const colors = (v: unknown) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim().slice(0, 30)).slice(0, 3) : []);
    if (withBox.length) {
      return withBox.slice(0, 6).map((p: any) => ({
        label: String(p.name || '').slice(0, 80) || 'Produit',
        category: String(p.category || 'product'),
        confidence: conf,
        box: { x: p.box[0], y: p.box[1], w: p.box[2], h: p.box[3] },
        color: colors(p.color), pattern: str(p.pattern), material: str(p.material),
        candidates: [] as AyrovixCandidate[], detectedPrice: result.detectedPrice || null, image: thumb,
      }));
    }
    const desc = String(id.description || result.query || '');
    if ((Number(id.confidence) || 0) <= 0 || desc === 'PRODUIT_NON_IDENTIFIE') return [];
    return [{
      label: (result.candidates?.[0]?.title || desc).slice(0, 80),
      category: String(id.category || 'product'), confidence: conf, box: null,
      color: colors(id.color), pattern: str(id.pattern), material: str(id.material),
      candidates: result.candidates || [], detectedPrice: result.detectedPrice || null, image: thumb,
    }];
  }

  /** مطابقة مستقلة لكل منتج: قصّ صندوقه وإرساله للـ Claude (بحد تزامن + بدون تكرار). */
  private matchPending(canvas: HTMLCanvasElement): void {
    for (const obj of this.objects) {
      if (!obj.box || obj.candidates.length || this.matchingIds.has(obj.trackingId) || this.matchingIds.size >= 3) continue;
      this.matchingIds.add(obj.trackingId);
      const rect = computeCropRect(canvas.width, canvas.height, obj.box);
      const crop = document.createElement('canvas');
      crop.width = rect.w; crop.height = rect.h;
      const cctx = crop.getContext('2d');
      if (!cctx) { this.matchingIds.delete(obj.trackingId); continue; }
      cctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      crop.toBlob(async (blob) => {
        if (this.stopped || !blob) { this.matchingIds.delete(obj.trackingId); return; }
        try {
          const res = await analyzeImage(new File([blob], 'ayrovix-crop.jpg', { type: 'image/jpeg' }));
          const cands = res.candidates || [];
          this.objects = this.objects.map((o) => (o.trackingId === obj.trackingId
            ? { ...o, candidates: cands, confidence: cands[0]?.match != null ? Math.max(o.confidence, cands[0].match) : o.confidence }
            : o));
          if (cands.length) this.opts.onEvent?.('match_returned', { candidates: cands.length });
          this.emit();
        } catch { /* فشل مطابقة عنصر واحد غير حرج */ }
        finally { this.matchingIds.delete(obj.trackingId); }
      }, 'image/jpeg', 0.85);
    }
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const canvas = this.drawSample();
    if (canvas) this.lastCanvas = canvas;
    if (canvas) {
      const sig = frameSignature(canvas);
      const unchanged = sig && this.lastSig && signatureDistance(sig, this.lastSig) < 0.06;
      this.lastSig = sig;
      if (unchanged) {
        // مشهد ثابت: tracking/تنبؤ + مطابقة معلّقة بدون inference كامل جديد
        this.objects = trackObjects(this.objects, [], Date.now());
        this.objects.filter((o) => o.status === 'lost').forEach(() => this.opts.onEvent?.('tracking_lost'));
        this.matchPending(canvas);
        this.emit(); this.schedule(); return;
      }
      // كشف محلي خفيف (on-device) عند توفّره: boxes/classes محليًا + Claude انتقائيًا للمطابقة
      if (!this.inflight && this.detector) {
        this.inflight = true;
        try {
          const preds = await this.detector.detect(canvas);
          const raw = preds.map((p) => ({
            label: p.label, category: p.category, confidence: Math.round(p.score * 100),
            box: { x: p.bbox[0] / canvas.width, y: p.bbox[1] / canvas.height, w: p.bbox[2] / canvas.width, h: p.bbox[3] / canvas.height },
            color: [] as string[], pattern: null, material: null, candidates: [] as AyrovixCandidate[],
          }));
          this.objects = trackObjects(this.objects, raw, Date.now());
          this.objects.filter((o) => o.status === 'locked').forEach((o) => this.opts.onEvent?.('object_locked', { confidence: o.confidence }));
          if (this.objects.length) this.opts.onEvent?.('object_detected', { count: this.objects.length });
          this.matchPending(canvas);
          this.emit();
        } catch { this.detector = null; }
        finally { this.inflight = false; this.schedule(); }
        return;
      }
      if (!this.inflight && this.online) {
        this.inflight = true;
        this.opts.onEvent?.('match_requested');
        const started = Date.now();
        canvas.toBlob(async (blob) => {
          if (this.stopped || !blob) { this.inflight = false; this.schedule(); return; }
          this.abort?.abort();
          const ctrl = new AbortController(); this.abort = ctrl;
          try {
            const result = await analyzeImage(new File([blob], 'ayrovix-live.jpg', { type: 'image/jpeg' }), ctrl.signal);
            this.interval = adaptiveNextInterval(this.interval, Date.now() - started);
            this.aiFailures = 0;
            this.opts.onEvent?.('match_returned', { candidates: (result.candidates || []).length });
            const thumb = canvas.toDataURL('image/jpeg', 0.6);
            const raw = this.toRawDetections(result, thumb);
            const before = this.objects.length;
            this.objects = trackObjects(this.objects, raw, Date.now());
            this.objects.filter((o) => o.status === 'locked').forEach((o) => this.opts.onEvent?.('object_locked', { confidence: o.confidence }));
            if (this.objects.length > before) this.opts.onEvent?.('object_detected', { count: this.objects.length });
            this.matchPending(canvas);
            this.emit();
          } catch {
            this.aiFailures += 1;
            if (this.aiFailures === 2) this.opts.onEvent?.('ai_unavailable');
            this.objects = trackObjects(this.objects, [], Date.now());
            this.emit();
          } finally {
            this.inflight = false;
            this.schedule();
          }
        }, 'image/jpeg', 0.8);
        return;
      }
      // offline أو inflight: استمر بالـ tracking المحلي فقط
      this.objects = trackObjects(this.objects, [], Date.now());
      this.emit();
    }
    this.schedule();
  }
}
