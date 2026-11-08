import { CLEAN, CleanSpeakerIcon } from './CleanVisuals';
import { MerchantRating } from '../../ayrovix/components/MerchantRating';
import React, { useEffect, useRef } from 'react';
import { AssistantMessageActions } from './AssistantMessageActions';
import { useMessageReader } from './useMessageReader';
import { cleanAssistantText } from './composerPolicy';
import { Mic, ArrowUpRight, MessageSquare, PackageCheck, ShoppingBag, LensBox } from '../QatafoIcons';
import { AyroviMotionState } from '../AyroviMotion';
import type { AyrovixOrderSelection } from '../../shop';
import { ShopProductScreen } from '../../shop';
import type { AyrovixCandidate, AyrovixProduct } from '../../ayrovix/types';
import { AssistantMessage, FeedbackValue } from './types';
import { isDisplayableCandidate } from '../../ayrovix/services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantMessagesProps {
  messages: AssistantMessage[];
  historyNotice?: React.ReactNode;
  isGenerating: boolean;
  motionState: AyroviMotionState;
  isDark: boolean;
  copiedId: string | null;
  feedbackPending?: Record<string, boolean>;
  feedback: Record<string, FeedbackValue | undefined>;
  selectedProduct: { messageId: string; product: AyrovixProduct; priceVerified: boolean } | null;
  productBusyId: string;
  isOrdering: boolean;
  onPrompt: (prompt: string) => void;
  onCopy: (message: AssistantMessage) => void;
  onRegenerate: (messageId: string) => void;
  onFeedback: (message: AssistantMessage, value: FeedbackValue) => void;
  onOpenComment: (message: AssistantMessage) => void;
  onOpenLens: () => void;
  onSelectProduct: (messageId: string, candidate: AyrovixCandidate) => void;
  onProductOrder: (selection: AyrovixOrderSelection) => Promise<void>;
  onOpenCart: () => void;
  onProductBack: () => void;
  customerFirstName?: string;
  analyzingImage?: boolean;
  assistantReady?: boolean | null;
}

const primaryActions = [
  { title: ['Analyser une image', 'تحليل صورة'], subtitle: ['Produit ou capture d’écran', 'منتج أو لقطة شاشة'], prompt: ['Explique-moi AYROVIX Lens et propose-moi de l’ouvrir.', 'اشرح لي عدسة AYROVIX واقترح فتحها.'] },
  { title: ['Calculer un prix', 'حساب سعر'], subtitle: ['Estimez votre prix', 'تقدير السعر'], prompt: ['Je veux calculer le prix final d’un produit.', 'أريد حساب السعر النهائي لمنتج.'] },
  { title: ['Rechercher un produit', 'البحث عن منتج'], subtitle: ['Trouvez et vérifiez', 'ابحث وتحقّق'], prompt: ['Aide-moi à rechercher un produit à acheter.', 'ساعدني في البحث عن منتج لشرائه.'] },
  { title: ['Suivre une commande', 'تتبع طلب'], subtitle: ['Voir votre commande', 'عرض طلبك'], prompt: ['Je veux suivre ma commande.', 'أريد تتبع طلبي.'] },
] as const;

const CandidateImage = ({ product }: { product: AyrovixCandidate }) => {
  const images = [...new Set([product.image, ...(product.images || [])].filter(Boolean))] as string[];
  const [index, setIndex] = React.useState(0);
  if (!images[index]) return <div className="grid h-full place-items-center text-muted"><ShoppingBag size={35}/></div>;
  return <img src={images[index]} alt="" referrerPolicy="no-referrer" onError={() => setIndex((value) => value + 1)} className="ayrovix-product-media-contain" loading="lazy" decoding="async" draggable={false}/>;
};

const ToolPresentations = ({ message, isDark, selectedProduct, productBusyId, isOrdering, onSelectProduct, onProductOrder, onOpenCart, onProductBack }: Pick<AssistantMessagesProps, 'selectedProduct' | 'productBusyId' | 'isOrdering' | 'onSelectProduct' | 'onProductOrder' | 'onOpenCart' | 'onProductBack'> & { message: AssistantMessage; isDark: boolean }) => {
  const { locale, tr } = useLocale();
  return <div className="ay-readable-label mt-3 space-y-3">
    {message.orderStatuses?.map((order) => (
      <article key={order.orderId} className={`rounded-card border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-line/15 bg-surface'}`}>
        <div className="flex flex-wrap items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-ink text-white"><PackageCheck size={30}/></span><div className="min-w-0 flex-1 basis-32"><p className="text-xs font-bold uppercase tracking-[.12em] text-ink">{tr('Commande', 'طلب')} {order.orderId}</p><h3 className="mt-0.5 text-sm font-extrabold">{order.statusLabel}</h3><p className={`mt-1 text-xs ${isDark ? 'text-muted' : 'text-muted'}`}>{order.carrier && `${order.carrier} · `}{order.trackingCode || tr('Suivi en préparation', 'التتبع قيد الإعداد')}</p></div></div>
        {order.history?.length > 0 && <div className={`mt-3 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-muted' : 'border-line/15 text-muted'}`}>{[...order.history].reverse().map((item) => <div key={`${item.status}-${item.at}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-1"><span className="ay-readable">{item.label}</span><time className="shrink-0">{new Date(item.at).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-TN')}</time></div>)}</div>}
      </article>
    ))}
    {message.priceBreakdown && <article className={`rounded-card border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-success/15 bg-success/5'}`}>
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-card bg-success text-lg text-white">د.ت</span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-success">{tr('Estimation ZAYROVI', 'تقدير ZAYROVI')}</p><strong className="text-xl">{message.priceBreakdown.totalTND.toFixed(2)} TND</strong></div></div>
      <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-muted' : 'border-success/15 text-muted'}`}><dt>{tr('Produit converti', 'سعر المنتج المحوّل')}</dt><dd className="text-end">{message.priceBreakdown.convertedPriceTND.toFixed(2)} TND</dd><dt>{tr('Douane', 'الديوانة')}</dt><dd className="text-end">{message.priceBreakdown.customsFeeTND.toFixed(2)} TND</dd><dt>{tr('Livraison', 'التسليم')}</dt><dd className="text-end">{message.priceBreakdown.shippingFeeTND.toFixed(2)} TND</dd><dt>{tr('Service', 'الخدمة')}</dt><dd className="text-end">{message.priceBreakdown.serviceFeeTND.toFixed(2)} TND</dd>{message.priceBreakdown.expressFeeTND > 0 && <><dt>{tr('Express', 'السريع')}</dt><dd className="text-end">{message.priceBreakdown.expressFeeTND.toFixed(2)} TND</dd></>}</dl>
    </article>}
    {message.products?.some(isDisplayableCandidate) ? <div className="grid gap-3 sm:grid-cols-2">
      {message.products.filter(isDisplayableCandidate).map((product) => <article key={product.id} className={`overflow-hidden rounded-card border ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-white'}`}>
        <div className={`aspect-[4/3] p-2 ${isDark ? 'bg-white/5' : 'bg-surface'}`}><CandidateImage product={product}/></div><p className="ay-readable-label border-b border-line px-3 py-2 text-xs font-bold">{product.source}</p>
        <div className="p-3">
          <h3 className="ay-readable min-h-9 text-sm font-extrabold leading-snug">{product.title}</h3>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div><p className={`text-base font-black ${isDark ? 'text-white' : 'text-ink'}`}>{product.priceTnd != null ? `${product.priceTnd.toFixed(2)} DT` : '—'}</p><p className={`text-xs font-semibold ${isDark ? 'text-muted' : 'text-muted'}`}>{Number(product.price).toFixed(Number(product.price) % 1 ? 2 : 0)} {product.currency}</p><MerchantRating value={product}/></div></div>
          <div className="mt-3 flex flex-wrap gap-2"><a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-10 items-center gap-1 rounded-card border px-3 text-xs font-extrabold ${isDark ? 'border-white/15 text-white/90' : 'border-line text-ink'}`}>{tr('Lien', 'الرابط')}<ArrowUpRight size={17} /></a><button type="button" disabled={Boolean(productBusyId)} onClick={() => onSelectProduct(message.id, product)} className="ay-btn-primary min-h-10 flex-1 px-3 text-xs">{productBusyId === product.id ? tr('Vérification…', 'جارٍ التحقق…') : tr('Choisir', 'اختيار')}</button></div>
        </div>
      </article>)}
    </div> : message.products?.length ? <p role="status" className="ay-readable border border-line p-3 text-sm text-muted">{tr('Aucun produit avec un prix et un lien exploitables dans cette réponse. Relancez la recherche.', 'لم يصل منتج بسعر ورابط صالحين في هذا الرد. أعد البحث.')}</p> : null}
    {selectedProduct?.messageId === message.id && <div className={`overflow-hidden rounded-card border p-2 ${isDark ? 'border-white/10 bg-white' : 'border-line bg-white'}`}><ShopProductScreen product={selectedProduct.product} priceVerified={selectedProduct.priceVerified} ordering={isOrdering} onOrder={onProductOrder} onOpenCart={onOpenCart} onBack={onProductBack} onCalculateAnother={onProductBack}/></div>}
    {message.supportTicket && <article className={`flex items-start gap-3 rounded-card border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-surface'}`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-surface text-ink"><MessageSquare size={30}/></span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{tr('Support ZAYROVI', 'دعم ZAYROVI')}</p><h3 className="mt-0.5 text-sm font-extrabold">{tr('Ticket enregistré', 'تم تسجيل التذكرة')}</h3><p className="mt-1 break-all text-xs text-muted">{tr('Référence', 'المرجع')} : {message.supportTicket.id}</p></div></article>}
  </div>;
};

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages, historyNotice, isGenerating, motionState, isDark, copiedId, feedbackPending = {}, feedback, selectedProduct, productBusyId, isOrdering,
  onPrompt, onCopy, onRegenerate, onFeedback, onOpenComment, onOpenLens, onSelectProduct, onProductOrder, onOpenCart, onProductBack,
  customerFirstName: _customerFirstName, assistantReady,
}) => {
  const { locale, direction, isArabic, tr } = useLocale();
  const reader = useMessageReader(messages, locale);
  const scrollRef = useRef<HTMLElement>(null);
  const followRef = useRef(true);
  const lastUserRef = useRef('');
  const hasMessages = messages.length > 0;
  const lastMessage = messages.at(-1);
  const lastAssistantHasContent = Boolean(lastMessage?.role === 'assistant' && (
    cleanAssistantText(lastMessage.text) || lastMessage.products?.length || lastMessage.priceBreakdown
    || lastMessage.orderStatuses?.length || lastMessage.supportTicket || lastMessage.attachments?.length || lastMessage.suggestedActions?.length || lastMessage.lensSummary
  ));
  useEffect(() => {
    const view = scrollRef.current;
    const newUserMessage = lastMessage?.role === 'user' && lastMessage.id !== lastUserRef.current;
    if (view && (followRef.current || newUserMessage)) view.scrollTop = view.scrollHeight;
    if (lastMessage?.role === 'user') lastUserRef.current = lastMessage.id;
  }, [messages, isGenerating, selectedProduct, lastMessage]);

  return (
    <main ref={scrollRef} data-assistant-messages onScroll={event => {
      const view = event.currentTarget;
      followRef.current = view.scrollHeight - view.scrollTop - view.clientHeight < 64;
    }} dir={direction} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${isDark ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-10 pt-8 sm:px-7 sm:pb-12">
        {historyNotice}
        {!hasMessages ? (
          <div className="assistant-welcome flex flex-1 flex-col">
            <div className="clean-welcome" style={{ backgroundColor: CLEAN.bubble, color: CLEAN.ink }}>
              <strong>{tr('Bonjour, je suis Clean !', 'مرحبًا، أنا Clean!')}</strong>
              <p>{tr('Posez-moi vos questions sur vos achats. Mes réponses sont générées par IA et peuvent contenir des erreurs.', 'اسألني عن مشترياتك. إجاباتي مولّدة بالذكاء الاصطناعي وقد تحتوي على أخطاء.')}</p>
            </div>
            {assistantReady === false && <p role="status" className="text-sm">{tr('Clean est momentanément indisponible.', 'Clean غير متاح حاليًا.')}</p>}
            {/* Actions primaires — 2×2, même famille d’icônes */}
            <div className="mt-5 flex flex-col items-start gap-3">
              {[primaryActions[0], primaryActions[2], primaryActions[1]].map((item) => (
                <button
                  key={item.title[0]}
                  type="button"
                  onClick={() => onPrompt(item.prompt[isArabic ? 1 : 0])}
                  className="clean-suggestion" style={{ backgroundColor: CLEAN.bubble, color: CLEAN.ink }}
                >
                  <span className="text-sm font-normal leading-5">{item.title[isArabic ? 1 : 0]}</span>
                </button>
              ))}
            </div>


          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message, index) => {
              const assistantText = cleanAssistantText(message.text);
              const hasPresentation = Boolean(message.products?.length || message.priceBreakdown || message.orderStatuses?.length || message.supportTicket || message.attachments?.length || message.suggestedActions?.length || message.lensSummary || selectedProduct?.messageId === message.id || (message.incomplete && !(isGenerating && index === messages.length - 1)));
              if (message.role === 'assistant' && !assistantText && !hasPresentation) return null;
              const isLastAssistantStreaming = isGenerating && index === messages.length - 1 && message.role === 'assistant';
              return <div key={message.id} className={`flex flex-wrap gap-y-2 items-start ${message.role === 'user' ? 'justify-end' : 'justify-start gap-2.5'}`}>
                {message.role === 'assistant' && <CleanSpeakerIcon role="assistant" />}
                <div className={message.role === 'user' ? 'min-w-0 max-w-[80%]' : hasPresentation ? 'min-w-0 flex-1 basis-[min(100%,20rem)]' : 'min-w-0 max-w-[82%]'}>
                  <div className={`rounded-card px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'clean-user-envelope' : 'clean-assistant-envelope'}`} >
                    {message.role === 'user' && message.fromVoice && (
                      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-normal text-black">
                        <Mic size={14} />
                        <span>{tr('Vocal', 'صوتي')}</span>
                      </span>
                    )}
                    {message.role === 'assistant' && message.incomplete && !isLastAssistantStreaming && <p data-incomplete-response role="status" className="ay-readable mb-2 text-xs text-muted">{tr('Réponse interrompue avant sa fin. Vous pouvez la régénérer.', 'توقف الرد قبل اكتماله. يمكنك إعادة توليده.')}</p>}
                    {assistantText && <p className="ay-readable whitespace-pre-wrap clean-message-text" style={message.role === 'user' ? { backgroundColor: CLEAN.bubble, color: CLEAN.text, borderRadius: 24, borderEndEndRadius: 4, padding: '10px 16px' } : { color: CLEAN.ink }}>{assistantText}</p>}
                    {message.attachments?.length ? <div className="mt-2 space-y-2">{message.attachments.map((attachment) => <div key={attachment.id} className="overflow-hidden rounded-card border border-white/15 bg-ink/10">{attachment.preview ? <img src={attachment.preview} alt={attachment.name} className="max-h-48 w-full object-cover"/> : <p className="ay-readable px-3 py-2 text-xs">{attachment.name}</p>}</div>)}</div> : null}
                    {message.role === 'assistant' && <ToolPresentations message={message} isDark={isDark} selectedProduct={selectedProduct} productBusyId={productBusyId} isOrdering={isOrdering} onSelectProduct={onSelectProduct} onProductOrder={onProductOrder} onOpenCart={onOpenCart} onProductBack={onProductBack}/>}
                    {message.role === 'assistant' && message.lensSummary && <div className="mt-2 ay-readable text-xs text-muted">
                      {Number.isFinite(message.lensSummary.confidence) && <p>{tr('Confiance estimée de lecture', 'الثقة التقديرية في القراءة')}: {Math.round(Math.max(0, Math.min(1, message.lensSummary.confidence)) * 100)}%</p>}
                      {message.lensSummary.verified && <p>{tr('Lecture vérifiée', 'قراءة متحقّق منها')}</p>}
                      {message.lensSummary.warnings.length > 0 && <ul className="mt-1 list-inside list-disc space-y-1">{message.lensSummary.warnings.map((warning, warningIndex) => <li key={warningIndex}>{warning}</li>)}</ul>}
                    </div>}
                    {message.role === 'assistant' && !isGenerating && Boolean(message.suggestedActions?.length) && <div className="mt-2.5 flex flex-wrap gap-2">{(message.suggestedActions || []).map((action) => <button key={action.label} type="button" onClick={() => onPrompt(action.prompt)} className={`min-h-11 rounded-control border px-3.5 text-xs font-bold transition active:scale-95 ${isDark ? 'border-white/15 bg-white/5 text-white/90 hover:bg-white/10' : 'border-line bg-white text-ink hover:bg-surface'}`}>{action.label}</button>)}</div>}
                    {message.role === 'assistant' && message.text.includes('[[OPEN_LENS]]') && <button type="button" onClick={onOpenLens} className="ay-btn-primary mt-3 w-full text-xs"><LensBox size={19}/>{tr('Ouvrir AYROVIX Lens', 'فتح عدسة AYROVIX')}</button>}
                  </div>
                  {message.role === 'assistant' && !isLastAssistantStreaming && <AssistantMessageActions message={message} isDark={isDark} copied={copiedId === message.id} generating={isGenerating} feedback={feedback[message.id]} feedbackPending={feedbackPending[message.id]} reader={reader} onCopy={onCopy} onRegenerate={onRegenerate} onFeedback={onFeedback} onOpenComment={onOpenComment}/>}
                </div>
                {message.role === 'user' && <CleanSpeakerIcon role="user" />}
              </div>;
            })}
            {isGenerating && !lastAssistantHasContent && <div className="flex items-center gap-3 px-1 py-1"><CleanSpeakerIcon role="assistant" /><div><p className={`text-xs font-bold ${isDark ? 'text-white/80' : 'text-ink'}`}>{motionState === 'thinking' ? tr('Recherche en cours…', 'جارٍ البحث…') : motionState === 'analyzing' ? tr('Vérification du produit…', 'جارٍ التحقق من المنتج…') : motionState === 'reasoning' ? tr('Récupération du prix…', 'جارٍ جلب السعر…') : tr('Création de la réponse…', 'جارٍ إنشاء الرد…')}</p><span className={`text-xs ${isDark ? 'text-muted' : 'text-muted'}`}>{tr('Les données de commande et de prix ne sont jamais inventées.', 'لا تُختلق أبدًا بيانات الطلبات والأسعار.')}</span></div></div>}
          </div>
        )}
        <div aria-hidden="true" />
      </div>
    </main>
  );
};
