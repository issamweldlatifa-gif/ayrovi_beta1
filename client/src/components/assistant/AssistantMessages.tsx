import React, { useEffect, useRef } from 'react';
import { ArrowUpRight, Calculator, Camera, Check, Copy, Info, MessageCircle, MessageSquare, Package, PackageCheck, RefreshCw, Search, Share2, ShoppingBag, Sparkles, Star, ThumbsDown, ThumbsUp, Volume2 } from '../QatafoIcons';
import { AyroviMotion, AyroviMotionState } from '../AyroviMotion';
import { AssistantBrandMark } from './AssistantBrandMark';
import { ProductResult, type AyrovixOrderSelection } from '../../ayrovix/components/ProductResult';
import type { AyrovixCandidate, AyrovixProduct } from '../../ayrovix/types';
import { AssistantMessage, FeedbackValue } from './types';
import { displayRating, isDisplayableCandidate } from '../../ayrovix/services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

interface AssistantMessagesProps {
  messages: AssistantMessage[];
  isGenerating: boolean;
  motionState: AyroviMotionState;
  isDark: boolean;
  copiedId: string | null;
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
  onProductOrder: (selection: AyrovixOrderSelection) => void;
  customerFirstName?: string;
  analyzingImage?: boolean;
}

const primaryActions = [
  { icon: Camera, title: ['Analyser une image', 'تحليل صورة'], subtitle: ['Produit ou capture d’écran', 'منتج أو لقطة شاشة'], prompt: ['Explique-moi AYROVIX Lens et propose-moi de l’ouvrir.', 'اشرح لي عدسة AYROVIX واقترح فتحها.'] },
  { icon: Calculator, title: ['Calculer un prix', 'حساب سعر'], subtitle: ['Estimez votre prix', 'تقدير السعر'], prompt: ['Je veux calculer le prix final d’un produit.', 'أريد حساب السعر النهائي لمنتج.'] },
  { icon: Search, title: ['Rechercher un produit', 'البحث عن منتج'], subtitle: ['Trouvez et vérifiez', 'ابحث وتحقّق'], prompt: ['Aide-moi à rechercher un produit à acheter.', 'ساعدني في البحث عن منتج لشرائه.'] },
  { icon: Package, title: ['Suivre une commande', 'تتبع طلب'], subtitle: ['Voir votre commande', 'عرض طلبك'], prompt: ['Je veux suivre ma commande.', 'أريد تتبع طلبي.'] },
] as const;

const secondaryActions = [
  { icon: Info, text: ['Découvrir AYROVI', 'اكتشف AYROVI'], prompt: ['Présente-moi les services AYROVI.', 'عرّفني بخدمات AYROVI.'] },
  { icon: MessageCircle, text: ['Contacter le support', 'التواصل مع الدعم'], prompt: ['J’ai besoin d’aide du support AYROVI.', 'أحتاج إلى مساعدة دعم AYROVI.'] },
] as const;

const cleanAssistantText = (text: string) => text
  .replaceAll('[[OPEN_LENS]]', '')
  .replace(/\p{Extended_Pictographic}/gu, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

const CandidateImage = ({ product }: { product: AyrovixCandidate }) => {
  const images = [...new Set([product.image, ...(product.images || [])].filter(Boolean))] as string[];
  const [index, setIndex] = React.useState(0);
  if (!images[index]) return <div className="grid h-full place-items-center text-white/80"><ShoppingBag size={32}/></div>;
  return <img src={images[index]} alt="" referrerPolicy="no-referrer" onError={() => setIndex((value) => value + 1)} className="h-full w-full object-contain" loading="lazy"/>;
};

const ShareAction = ({ message, isDark }: { message: AssistantMessage; isDark: boolean }) => {
  const { tr } = useLocale();
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'AYROVI', text: cleanAssistantText(message.text) });
      else await navigator.clipboard.writeText(cleanAssistantText(message.text));
    } catch { /* cancelled */ }
  };
  return <button type="button" onClick={() => void share()} aria-label={tr('Partager', 'مشاركة')} className={`rounded-lg p-1.5 transition ${isDark ? 'text-muted hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink'}`}><Share2 size={15} /></button>;
};

const ToolPresentations = ({ message, isDark, selectedProduct, productBusyId, isOrdering, onSelectProduct, onProductOrder }: Pick<AssistantMessagesProps, 'selectedProduct' | 'productBusyId' | 'isOrdering' | 'onSelectProduct' | 'onProductOrder'> & { message: AssistantMessage; isDark: boolean }) => {
  const { locale, tr } = useLocale();
  return <div className="mt-3 space-y-3">
    {message.orderStatuses?.map((order) => (
      <article key={order.orderId} className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-brand/15 bg-brand/5'}`}>
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white"><PackageCheck size={20}/></span><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-brand">{tr('Commande', 'طلب')} {order.orderId}</p><h3 className="mt-0.5 text-sm font-extrabold">{order.statusLabel}</h3><p className={`mt-1 text-xs ${isDark ? 'text-muted' : 'text-muted'}`}>{order.carrier && `${order.carrier} · `}{order.trackingCode || tr('Suivi en préparation', 'التتبع قيد الإعداد')}</p></div></div>
        {order.history?.length > 0 && <div className={`mt-3 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-muted' : 'border-brand/15 text-muted'}`}>{order.history.slice(-3).reverse().map((item) => <div key={`${item.status}-${item.at}`} className="flex justify-between gap-3 py-1"><span>{item.label}</span><time>{new Date(item.at).toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-TN')}</time></div>)}</div>}
      </article>
    ))}
    {message.priceBreakdown && <article className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-success/15 bg-success/5'}`}>
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-success text-lg text-white">د.ت</span><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-success">{tr('Estimation AYROVI', 'تقدير AYROVI')}</p><strong className="text-xl">{message.priceBreakdown.totalTND.toFixed(2)} TND</strong></div></div>
      <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-muted' : 'border-success/15 text-muted'}`}><dt>{tr('Produit converti', 'سعر المنتج المحوّل')}</dt><dd className="text-end">{message.priceBreakdown.convertedPriceTND.toFixed(2)} TND</dd><dt>{tr('Douane', 'الديوانة')}</dt><dd className="text-end">{message.priceBreakdown.customsFeeTND.toFixed(2)} TND</dd><dt>{tr('Livraison', 'التسليم')}</dt><dd className="text-end">{message.priceBreakdown.shippingFeeTND.toFixed(2)} TND</dd><dt>{tr('Service', 'الخدمة')}</dt><dd className="text-end">{message.priceBreakdown.serviceFeeTND.toFixed(2)} TND</dd>{message.priceBreakdown.expressFeeTND > 0 && <><dt>{tr('Express', 'السريع')}</dt><dd className="text-end">{message.priceBreakdown.expressFeeTND.toFixed(2)} TND</dd></>}</dl>
    </article>}
    {message.products?.some(isDisplayableCandidate) ? <div className="grid gap-3 sm:grid-cols-2">
      {message.products.filter(isDisplayableCandidate).map((product) => <article key={product.id} className={`overflow-hidden rounded-2xl border ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-line bg-white'}`}>
        <div className={`relative aspect-[4/3] ${isDark ? 'bg-white/5' : 'bg-surface'}`}><CandidateImage product={product}/><span className="absolute start-2 top-2 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-bold text-white">{product.source}</span></div>
        <div className="p-3">
          <h3 className="line-clamp-2 min-h-9 text-xs font-extrabold leading-snug">{product.title}</h3>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-brand">{Number(product.price).toFixed(Number(product.price) % 1 ? 2 : 0)} {product.currency}</p>{product.priceTnd != null && <p className={`text-[10px] ${isDark ? 'text-muted' : 'text-muted'}`}>≈ {product.priceTnd.toFixed(2)} TND</p>}<p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${isDark ? 'text-white/80' : 'text-ink'}`}><Star size={12} fill="currentColor" />{displayRating(product).toFixed(1)}/5 <span className={isDark ? 'text-muted' : 'text-muted'}>{product.ratingKind === 'merchant' ? tr('marchand', 'المتجر') : tr('pertinence', 'التطابق')}</span></p></div></div>
          <div className="mt-3 flex gap-2"><a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-[11px] font-extrabold ${isDark ? 'border-white/15 text-white/90' : 'border-line text-ink'}`}>{tr('Lien', 'الرابط')}<ArrowUpRight size={14} /></a><button type="button" disabled={Boolean(productBusyId)} onClick={() => onSelectProduct(message.id, product)} className="ay-btn-secondary min-h-10 flex-1 px-3 text-[11px]">{productBusyId === product.id ? tr('Vérification…', 'جارٍ التحقق…') : tr('Choisir', 'اختيار')}</button></div>
        </div>
      </article>)}
    </div> : null}
    {selectedProduct?.messageId === message.id && <div className={`overflow-hidden rounded-2xl border p-2 ${isDark ? 'border-white/10 bg-white' : 'border-brand/20 bg-white'}`}><ProductResult product={selectedProduct.product} priceVerified={selectedProduct.priceVerified} ordering={isOrdering} onOrder={onProductOrder}/></div>}
    {message.supportTicket && <article className={`flex items-start gap-3 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-accent/20 bg-accent/10'}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-ink"><MessageSquare size={20}/></span><div><p className={`text-[11px] font-bold uppercase tracking-[.12em] ${isDark ? 'text-white/80' : 'text-ink'}`}>{tr('Support AYROVI', 'دعم AYROVI')}</p><h3 className="mt-0.5 text-sm font-extrabold">{tr('Ticket enregistré', 'تم تسجيل التذكرة')}</h3><p className="mt-1 break-all text-[11px] text-muted">{tr('Référence', 'المرجع')} : {message.supportTicket.id}</p></div></article>}
  </div>;
};

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages, isGenerating, motionState, isDark, copiedId, feedback, selectedProduct, productBusyId, isOrdering,
  onPrompt, onCopy, onRegenerate, onFeedback, onOpenComment, onOpenLens, onSelectProduct, onProductOrder,
  customerFirstName,
}) => {
  const { locale, direction, isArabic, tr } = useLocale();
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  const lastMessage = messages.at(-1);
  const lastAssistantHasContent = Boolean(lastMessage?.role === 'assistant' && (
    cleanAssistantText(lastMessage.text) || lastMessage.products?.length || lastMessage.priceBreakdown
    || lastMessage.orderStatuses?.length || lastMessage.supportTicket
  ));
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, isGenerating, motionState, selectedProduct]);

  return (
    <main dir={direction} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${isDark ? 'bg-ink text-white' : 'bg-surface text-ink'}`}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-10 pt-8 sm:px-7 sm:pb-12 sm:pt-10">
        {!hasMessages ? (
          <div className="assistant-welcome flex flex-1 flex-col">
            {/* Identité AI + accueil personnalisé */}
            <div className="flex flex-col items-center text-center">
              <span className="text-brand"><AyroviMotion state="idle" size={92} /></span>
              <p className={`mt-4 text-[10px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-brand-light' : 'text-brand'}`}>AYROVI AI</p>
              <h2 className={`mt-2 text-[26px] font-black leading-tight tracking-tight sm:text-3xl ${isDark ? 'text-white' : 'text-ink'}`}>
                {tr('Bonjour', 'مرحبًا')}{customerFirstName ? ` ${customerFirstName}` : ''}
              </h2>
              <p className={`mt-1.5 text-sm font-bold ${isDark ? 'text-white/80' : 'text-ink'}`}>{tr('Que souhaitez-vous faire aujourd’hui ?', 'ماذا تريد أن تفعل اليوم؟')}</p>
              <p className={`mt-3 max-w-sm text-[13px] leading-6 ${isDark ? 'text-muted' : 'text-muted'}`}>
                {tr('Je peux analyser vos produits, vérifier les prix, rechercher des articles et vous accompagner dans vos commandes.', 'يمكنني تحليل منتجاتك والتحقق من الأسعار والبحث عن المنتجات ومساعدتك في طلباتك.')}
              </p>
            </div>

            {/* Actions primaires — 2×2, même famille d’icônes */}
            <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
              {primaryActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title[0]}
                    type="button"
                    onClick={() => onPrompt(item.prompt[isArabic ? 1 : 0])}
                    className="assistant-quick-card min-h-[104px] rounded-2xl p-3.5 text-start text-ink transition active:scale-[0.98]"
                  >
                    <span className="assistant-quick-card__icon mb-2.5"><Icon size={18}/></span>
                    <span className="relative z-[1] block text-xs font-extrabold leading-5">{item.title[isArabic ? 1 : 0]}</span>
                    <span className="relative z-[1] mt-0.5 block text-[10px] font-semibold leading-4 text-muted">{item.subtitle[isArabic ? 1 : 0]}</span>
                  </button>
                );
              })}
            </div>

            {/* Actions secondaires — poids visuel léger */}
            <div className="mt-4 flex items-center justify-center gap-1">
              {secondaryActions.map((item, index) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.text[0]}>
                    {index > 0 && <span className={`mx-1.5 h-3.5 w-px ${isDark ? 'bg-white/10' : 'bg-line'}`} aria-hidden="true" />}
                    <button
                      type="button"
                      onClick={() => onPrompt(item.prompt[isArabic ? 1 : 0])}
                      className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[11px] font-bold transition ${isDark ? 'text-muted hover:bg-white/5 hover:text-white/90' : 'text-muted hover:bg-surface hover:text-ink'}`}
                    >
                      <Icon size={13} />{item.text[isArabic ? 1 : 0]}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((message, index) => {
              const assistantText = cleanAssistantText(message.text);
              const hasPresentation = Boolean(message.products?.length || message.priceBreakdown || message.orderStatuses?.length || message.supportTicket || selectedProduct?.messageId === message.id);
              if (message.role === 'assistant' && !assistantText && !hasPresentation) return null;
              const isLastAssistantStreaming = isGenerating && index === messages.length - 1 && message.role === 'assistant';
              return <div key={message.id} className={`flex items-start ${message.role === 'user' ? 'justify-end' : 'justify-start gap-2.5'}`}>
                {message.role === 'assistant' && (
                  <AssistantBrandMark
                    state={isLastAssistantStreaming ? motionState : 'idle'}
                    size={40}
                    className="mt-1"
                    label={isLastAssistantStreaming ? tr('AYROVI prépare la réponse', 'AYROVI تحضّر الرد') : 'AYROVI'}
                  />
                )}
                <div className={message.role === 'user' ? 'max-w-[82%]' : hasPresentation ? 'min-w-0 flex-1 max-w-[92%]' : 'min-w-0 max-w-[82%]'}>
                  <div className={`rounded-[22px] px-4 py-3 text-[14px] leading-6 ${message.role === 'user' ? 'rounded-br-md bg-brand text-white shadow-card' : isDark ? 'rounded-bl-md border border-white/10 bg-white/[0.055] text-white' : 'rounded-bl-md border border-line bg-white text-ink shadow-card'}`}>
                    {assistantText && <p className="whitespace-pre-wrap">{assistantText}</p>}
                    {message.attachments?.length ? <div className="mt-2 space-y-2">{message.attachments.map((attachment) => <div key={attachment.id} className="overflow-hidden rounded-xl border border-white/15 bg-ink/10">{attachment.preview ? <img src={attachment.preview} alt={attachment.name} className="max-h-48 w-full object-cover"/> : <p className="px-3 py-2 text-xs">{attachment.name}</p>}</div>)}</div> : null}
                    {message.role === 'assistant' && <ToolPresentations message={message} isDark={isDark} selectedProduct={selectedProduct} productBusyId={productBusyId} isOrdering={isOrdering} onSelectProduct={onSelectProduct} onProductOrder={onProductOrder}/>}
                    {message.role === 'assistant' && message.lensSummary && <p className={`mt-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-muted' : 'text-muted'}`}>{tr('Lecture image : confiance', 'قراءة الصورة: الثقة')} {Math.round(message.lensSummary.confidence * 100)}%{message.lensSummary.verified ? tr(' · vérifiée', ' · مؤكدة') : ''}{message.lensSummary.warnings.length ? ` · ${message.lensSummary.warnings[0]}` : ''}</p>}
                    {message.role === 'assistant' && !isGenerating && Boolean(message.suggestedActions?.length) && <div className="mt-2.5 flex flex-wrap gap-2">{(message.suggestedActions || []).map((action) => <button key={action.label} type="button" onClick={() => onPrompt(action.prompt)} className={`min-h-9 rounded-full border px-3.5 text-[11px] font-bold transition active:scale-95 ${isDark ? 'border-white/15 bg-white/5 text-white/90 hover:bg-white/10' : 'border-brand/25 bg-white text-brand-dark hover:bg-brand/5'}`}>{action.label}</button>)}</div>}
                    {message.role === 'assistant' && message.text.includes('[[OPEN_LENS]]') && <button type="button" onClick={onOpenLens} className="ay-btn-primary mt-3 w-full text-xs"><Sparkles size={16}/>{tr('Ouvrir AYROVIX Lens', 'فتح عدسة AYROVIX')}</button>}
                  </div>
                  {message.role === 'assistant' && !isLastAssistantStreaming && <div className="mt-1.5 flex items-center gap-0.5 px-1"><button type="button" onClick={() => onCopy(message)} aria-label={tr('Copier', 'نسخ')} className={`rounded-lg p-1.5 transition ${isDark ? 'text-muted hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink'}`}>{copiedId === message.id ? <Check size={15}/> : <Copy size={15}/>}</button><button type="button" onClick={() => onRegenerate(message.id)} aria-label={tr('Régénérer', 'إعادة التوليد')} className={`rounded-lg p-1.5 transition ${isDark ? 'text-muted hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink'}`}><RefreshCw size={15}/></button><button type="button" aria-label={tr('Lire', 'استماع')} className={`rounded-lg p-1.5 transition ${isDark ? 'text-muted hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink'}`} onClick={() => window.speechSynthesis?.speak(new SpeechSynthesisUtterance(assistantText))}><Volume2 size={15}/></button><ShareAction message={message} isDark={isDark}/><span className={`mx-1 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-line'}`}/><button type="button" onClick={() => onFeedback(message, 'up')} aria-label={tr('Utile', 'مفيد')} className={`rounded-lg p-1.5 ${feedback[message.id] === 'up' ? 'bg-success/10 text-success' : isDark ? 'text-muted hover:bg-white/5' : 'text-muted hover:bg-surface'}`}><ThumbsUp size={15}/></button><button type="button" onClick={() => onFeedback(message, 'down')} aria-label={tr('Pas utile', 'غير مفيد')} className={`rounded-lg p-1.5 ${feedback[message.id] === 'down' ? 'bg-danger/10 text-danger' : isDark ? 'text-muted hover:bg-white/5' : 'text-muted hover:bg-surface'}`}><ThumbsDown size={15}/></button><button type="button" onClick={() => onOpenComment(message)} className={`ms-1 rounded-lg px-2 py-1 text-[10px] font-bold ${isDark ? 'text-muted hover:bg-white/5' : 'text-muted hover:bg-surface'}`}>{tr('Commenter', 'تعليق')}</button></div>}
                </div>
              </div>;
            })}
            {isGenerating && !lastAssistantHasContent && <div className="flex items-center gap-3 px-1 py-1"><AssistantBrandMark state={motionState} size={40} label={tr('AYROVI prépare la réponse', 'AYROVI تحضّر الرد')}/><div><p className={`text-xs font-bold ${isDark ? 'text-white/80' : 'text-ink'}`}>{motionState === 'thinking' ? tr('Recherche en cours…', 'جارٍ البحث…') : motionState === 'analyzing' ? tr('Vérification du produit…', 'جارٍ التحقق من المنتج…') : motionState === 'reasoning' ? tr('Récupération du prix…', 'جارٍ جلب السعر…') : tr('Création de la réponse…', 'جارٍ إنشاء الرد…')}</p><span className={`text-[10px] ${isDark ? 'text-muted' : 'text-muted'}`}>{tr('Les données de commande et de prix ne sont jamais inventées.', 'لا تُختلق أبدًا بيانات الطلبات والأسعار.')}</span></div></div>}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
    </main>
  );
};
