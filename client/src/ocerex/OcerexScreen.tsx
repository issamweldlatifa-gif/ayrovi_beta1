import React, { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../design/AppHeader';
import { Button } from '../design/Button';
import { Camera, Check, Info, Loader2, ScanSearch, Image as UploadIcon } from '../components/QatafoIcons';
import type { AyrovixOrderPayload } from '../ayrovix/types';
import { getSessionId } from '../utils/session';
import './ocerex.css';

type Extraction = {
  type: 'PRODUCT' | 'CART' | 'UNKNOWN'; referencePrice: number | null; currency: string | null;
  confidence: number; priceContext: string | null; productName: string | null; errorCode?: string;
  calculation: { totalTND: number; pricingVersion: number } | null;
};
type ResolvedProduct = { title: string; source: string; sourceUrl: string; price: number | null; currency: string | null; image: string; priceToken?: string | null; priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL'; availability?: string };

const ERROR_COPY: Record<string, { title: string; action: string }> = {
  NO_PRICE_FOUND: { title: 'لم نتمكن من العثور على سعر واضح.', action: 'رفع صورة أخرى' },
  LOW_CONFIDENCE: { title: 'تعذر تحديد السعر المرجعي بدقة.', action: 'رفع صورة أوضح' },
  NO_REFERENCE_PRICE: { title: 'لم يتم العثور على سعر مرجعي واضح.', action: 'متابعة بالرابط' },
  UNSUPPORTED_SCREEN: { title: 'الصورة غير واضحة كمنتج أو سلة.', action: 'رفع صورة أخرى' },
  PROCESSING_ERROR: { title: 'حدث خطأ أثناء تحليل الصورة.', action: 'إعادة المحاولة' },
  INVALID_IMAGE: { title: 'الصورة غير صالحة. استخدم JPG أو PNG أو WebP.', action: 'رفع صورة أخرى' },
};

async function validateImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('INVALID_IMAGE');
  const bitmap = await createImageBitmap(file);
  const valid = bitmap.width >= 120 && bitmap.height >= 120 && bitmap.width * bitmap.height <= 25_000_000;
  bitmap.close();
  if (!valid) throw new Error('INVALID_IMAGE');
}

function track(event: string, meta: Record<string, unknown> = {}) {
  fetch('/api/ayrovix/live-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: event, meta }) }).catch(() => {});
}

function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

export function OcerexScreen({ onClose, onOpenLens, onOrder, onOpenCart }: { onClose: () => void; onOpenLens: () => void; onOrder: (payload: AyrovixOrderPayload) => Promise<void>; onOpenCart: () => void }) {
  const [onboarded, setOnboarded] = useState(() => { try { return localStorage.getItem('ayrovi:ocerex:onboarded') === '1'; } catch { return false; } });
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<Extraction | null>(null);
  const [imageName, setImageName] = useState('');
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [resolved, setResolved] = useState<ResolvedProduct | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const isArabic = true;

  useEffect(() => {
    track('ocerex_opened');
  }, []);

  const completeOnboarding = () => {
    try { localStorage.setItem('ayrovi:ocerex:onboarded', '1'); } catch { /* session still works */ }
    setOnboarded(true);
    track('ocerex_first_use_completed');
  };

  const analyze = async (file?: File, inputMethod: 'upload' | 'camera' = 'upload') => {
    if (!file) return;
    track(inputMethod === 'camera' ? 'ocerex_camera_used' : 'ocerex_image_uploaded', { mimeType: file.type, sizeBucket: file.size > 5_000_000 ? '5-10mb' : file.size > 1_000_000 ? '1-5mb' : 'under-1mb' });
    track('ocerex_ocr_started');
    setErrorCode(null); setResult(null); setResolved(null); setUrl(''); setLinkError(''); setBusy(true); setImageName(file.name);
    try {
      await validateImage(file);
      const body = new FormData(); body.append('image', file, file.name || 'screenshot.jpg');
      const response = await fetch('/api/ocerex/analyze', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.code || 'PROCESSING_ERROR');
      setResult(payload.data as Extraction);
      if (payload.data?.errorCode) setErrorCode(payload.data.errorCode);
      track('ocerex_ocr_success', { type: payload.data?.type, confidence: Math.round((payload.data?.confidence || 0) * 100) });
      if (payload.data?.type === 'PRODUCT') track('ocerex_product_detected');
      if (payload.data?.type === 'CART') track('ocerex_cart_detected');
      if (payload.data?.referencePrice) { track('ocerex_reference_price_detected', { currency: payload.data.currency }); track('ocerex_price_calculated', { pricingVersion: payload.data.calculation?.pricingVersion }); }
      if (payload.data?.errorCode === 'LOW_CONFIDENCE') track('ocerex_low_confidence');
    } catch (error: any) {
      setErrorCode(error?.message === 'INVALID_IMAGE' ? 'INVALID_IMAGE' : 'PROCESSING_ERROR');
      track('ocerex_ocr_failed', { code: error?.message || 'PROCESSING_ERROR' });
    } finally { setBusy(false); }
  };

  const resolveLink = async (event: React.FormEvent) => {
    event.preventDefault(); setLinkError(''); setResolved(null);
    const validUrl = safeHttpUrl(url);
    if (!validUrl) { setLinkError('الرابط غير صالح.'); return; }
    if (result?.type === 'CART') {
      setLinkError('رابط السلة يحتاج إلى مراجعة عبر Ayrovi؛ لا يمكن تحويله تلقائيًا إلى منتج واحد.'); return;
    }
    track('ocerex_link_submitted', { host: new URL(validUrl).hostname });
    setBusy(true);
    try {
      const response = await fetch('/api/ayrovix/analyze-url', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() }, body: JSON.stringify({ url: validUrl, channel: 'url', recordHistory: true }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.code === 'INVALID_URL' ? 'INVALID_URL' : 'RESOLVE_FAILED');
      const product = payload.data?.product as ResolvedProduct | undefined;
      if (!product?.title || !product.price || !product.currency || !product.priceToken) throw new Error('UNVERIFIED_PRODUCT');
      setResolved(product);
    } catch (error: any) {
      setLinkError(error?.message === 'INVALID_URL' ? 'الرابط غير صالح.' : error?.message === 'UNVERIFIED_PRODUCT' ? 'تعذر التحقق من السعر عبر الرابط. أرسل الرابط إلى فريق Ayrovi للمراجعة.' : 'تعذر قراءة المنتج من الرابط. تحقق منه أو جرّب رابطًا مباشرًا.');
    } finally { setBusy(false); }
  };

  const continueToOrder = async () => {
    if (!resolved?.price || !resolved.currency || !resolved.priceToken || !result) return;
    setOrdering(true);
    track('ocerex_order_started', { type: result.type });
    try {
      const rawSource = resolved.source.toLowerCase();
      const store: AyrovixOrderPayload['store'] = rawSource.includes('amazon') ? 'amazon' : rawSource.includes('shein') ? 'shein' : rawSource.includes('temu') ? 'temu' : rawSource.includes('aliexpress') ? 'aliexpress' : 'generic';
      await onOrder({ store, externalId: null, url: resolved.sourceUrl, title: resolved.title, imageUrl: resolved.image || '', sourcePrice: resolved.price, sourceCurrency: resolved.currency, priceVerificationStatus: resolved.priceVerificationStatus || 'PENDING_MANUAL', priceToken: resolved.priceToken, quantity: 1, customerNote: `OCEREX ${result.type} reference ${result.referencePrice} ${result.currency}; OCR confidence ${(result.confidence * 100).toFixed(0)}%; pricing version ${result.calculation?.pricingVersion ?? 'unknown'}.` });
      onOpenCart();
    } catch { setLinkError('تعذر إضافة المنتج إلى السلة. أعد المحاولة.'); }
    finally { setOrdering(false); }
  };

  const reset = () => { setResult(null); setErrorCode(null); setImageName(''); setResolved(null); setUrl(''); setLinkError(''); if (galleryRef.current) galleryRef.current.value = ''; if (cameraRef.current) cameraRef.current.value = ''; };

  return <section className="fixed inset-0 z-20 flex flex-col overflow-y-auto bg-white" role="dialog" aria-modal="false" aria-label="OCEREX" dir={isArabic ? 'rtl' : 'ltr'}>
    <AppHeader title="OCEREX" subtitle="أداة قراءة السعر" onClose={onClose} showLogo={false} actions={<Button variant="ghost" size="icon" aria-label="مساعدة Ocerex" onClick={() => setHelpOpen((value) => !value)}><Info className="h-5 w-5" /></Button>} />
    {helpOpen && <p className="mx-auto mt-4 w-full max-w-xl px-5 text-sm text-muted" role="status">ارفع صورة واضحة يظهر فيها السعر المرجعي، ثم أدخل رابط المنتج لمتابعة الطلب.</p>}
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-28 pt-8 sm:pt-12">
      {!onboarded ? <div className="m-auto w-full max-w-lg text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-surface text-ink"><ScanSearch className="h-8 w-8" /></div>
        <h1 className="mt-5 text-2xl font-black text-ink">OCEREX</h1>
        <p className="mt-3 text-base font-semibold text-ink">حوّل السعر من صورة إلى طلب مع Ayrovi.</p>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm font-bold text-muted"><span>Screenshot</span><span aria-hidden="true">→</span><span>OCR</span><span aria-hidden="true">→</span><span>Calculation</span><span aria-hidden="true">→</span><span className="text-cta">Ayrovi Price</span></div>
        <h2 className="mt-9 text-lg font-extrabold text-ink">كيف تستعمل Ocerex؟</h2>
        <div className="mt-4 grid gap-3 text-right">
          {[['01 — صوّر', 'خذ Screenshot للمنتج أو للسلة التي يظهر فيها السعر.'], ['02 — استخرج', 'Ocerex يقرأ السعر من الصورة ويطبّق حساب Ayrovi.'], ['03 — اطلب', 'أدخل رابط المنتج أو السلة لإكمال طلبك عبر Ayrovi.']].map(([title, desc]) => <article key={title} className="rounded-card border border-line p-4"><h3 className="font-extrabold text-ink">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{desc}</p></article>)}
        </div>
        <Button variant="cta" className="mt-7 w-full" onClick={completeOnboarding}>ابدأ مع Ocerex</Button>
        <p className="mt-3 text-xs text-muted">يجب توفير رابط المنتج أو السلة عند متابعة الطلب.</p>
      </div> : <>
        <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black tracking-tight text-ink">OCEREX</h1><p className="mt-1 text-sm text-muted">ارفع صورة السعر</p></div>{result && <Button variant="ghost" size="icon" aria-label="إعادة البدء" onClick={reset}>×</Button>}</div>
        {!result && !busy && <>
          <button type="button" className="ocerex-upload mt-8 flex min-h-56 w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-line bg-surface px-5 text-center transition hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta" aria-label="رفع صورة" onClick={() => galleryRef.current?.click()}>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-ink shadow-xs"><UploadIcon className="h-7 w-7" /></span>
            <span className="mt-4 text-lg font-extrabold text-ink">+ رفع صورة</span>
            <span className="mt-1 text-sm text-muted">JPG أو PNG أو WebP · حتى 10MB</span>
          </button>
          <Button variant="secondary" className="mt-3 w-full" aria-label="التقاط صورة" onClick={() => cameraRef.current?.click()}><Camera className="h-5 w-5" />أو التقط صورة الآن</Button>
          <p className="mt-5 text-center text-sm leading-6 text-muted">Ocerex يقرأ السعر المرجعي من الصورة ويحسب سعر Ayrovi.</p>
        </>}
        <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="رفع صورة" onChange={(e) => void analyze(e.target.files?.[0], 'upload')} />
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" aria-label="التقاط صورة" onChange={(e) => void analyze(e.target.files?.[0], 'camera')} />
        {busy && <div className="m-auto w-full max-w-md rounded-card border border-line p-7" aria-live="polite"><div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-cta" /><h2 className="font-extrabold text-ink">جاري قراءة الصورة...</h2></div><ol className="mt-6 space-y-3 text-sm text-muted"><li>✓ تحليل الصورة</li><li>✓ قراءة الأسعار</li><li>• تحديد السعر المرجعي</li><li>• حساب سعر Ayrovi</li></ol></div>}
        {errorCode && !busy && <section className="mt-7 rounded-card border border-line bg-surface p-5" role="alert"><p className="font-extrabold text-ink">{ERROR_COPY[errorCode]?.title || ERROR_COPY.PROCESSING_ERROR.title}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button variant="cta" onClick={reset}>{ERROR_COPY[errorCode]?.action || 'إعادة المحاولة'}</Button>{errorCode === 'NO_REFERENCE_PRICE' && <Button variant="secondary" onClick={onOpenLens}>متابعة بالرابط</Button>}</div></section>}
        {result && !errorCode && result.referencePrice && result.calculation && <section className="mt-7">
          <p className="flex items-center gap-2 font-bold text-emerald-700"><Check className="h-5 w-5" />تم استخراج السعر بنجاح</p>
          {result.productName && <p className="mt-4 text-sm text-muted">المنتج: <span className="font-bold text-ink">{result.productName}</span></p>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><article className="rounded-card border border-line p-5"><p className="text-sm font-bold text-muted">السعر المرجعي</p><p className="mt-2 text-2xl font-black text-ink">{result.referencePrice.toLocaleString('en-US', { maximumFractionDigits: 3 })} {result.currency}</p></article><article className="rounded-card border border-cta/30 bg-white p-5"><p className="text-sm font-bold text-muted">سعر Ayrovi</p><p className="mt-2 text-3xl font-black text-cta">{result.calculation.totalTND.toLocaleString('fr-TN', { maximumFractionDigits: 3 })} TND</p></article></div>
          <p className="mt-3 text-xs text-muted">{result.type === 'CART' ? 'سلة — السعر المرجعي على مستوى السلة' : 'منتج'} · الثقة {Math.round(result.confidence * 100)}%</p>
          <form onSubmit={(event) => void resolveLink(event)} className="mt-7"><label htmlFor="ocerex-link" className="mb-2 block text-sm font-extrabold text-ink">أدخل رابط المنتج أو السلة للمتابعة</label><input id="ocerex-link" type="url" value={url} onChange={(event) => { setUrl(event.target.value); setLinkError(''); setResolved(null); }} placeholder="https://..." dir="ltr" className="min-h-12 w-full rounded-control border border-line bg-white px-4 text-left text-sm text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10" autoComplete="url" aria-invalid={Boolean(linkError)} />{linkError && <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{linkError}</p>}<Button variant="cta" type="submit" disabled={busy} aria-label="متابعة الطلب" className="mt-3 w-full">متابعة الطلب <span aria-hidden="true">←</span></Button></form>
          {resolved && <article className="mt-5 rounded-card border border-line p-5"><p className="text-xs font-bold text-muted">ملخص الطلب · السعر من صفحة التاجر سيعاد التحقق منه عند الطلب</p><h3 className="mt-2 font-extrabold text-ink">{resolved.title}</h3><p className="mt-1 text-sm text-muted">{resolved.source} · {resolved.price} {resolved.currency}</p><Button variant="cta" disabled={ordering} className="mt-4 w-full" onClick={() => void continueToOrder()}>{ordering ? 'جارٍ الإضافة...' : 'شراء / متابعة الطلب'}</Button></article>}
          <p className="mt-4 text-xs leading-5 text-muted">تُحلّل الصورة مؤقتًا ولا تُحفظ. السعر النهائي يُعاد احتسابه بواسطة Ayrovi عند إنشاء الطلب.</p>
        </section>}
      </>}
    </main>
  </section>;
}
