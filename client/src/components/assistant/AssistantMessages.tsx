import React, { useEffect, useRef } from 'react';
import { Calculator, Camera, Check, Copy, MessageSquare, Package, PackageCheck, RefreshCw, Search, Share2, ShoppingBag, Sparkles, ThumbsDown, ThumbsUp, Volume2 } from '../QatafoIcons';
import { AyroviMotion, AyroviMotionState } from '../AyroviMotion';
import { AssistantBrandMark } from './AssistantBrandMark';
import { ProductResult, type AyrovixOrderSelection } from '../../ayrovix/components/ProductResult';
import type { AyrovixCandidate, AyrovixProduct } from '../../ayrovix/types';
import { AssistantMessage, FeedbackValue } from './types';

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
}

const quickPrompts = [
  { icon: Sparkles, text: 'Découvrir AYROVI', prompt: 'Présente-moi les services AYROVI.' },
  { icon: Package, text: 'Suivre une commande', prompt: 'Je veux suivre ma commande.' },
  { icon: Calculator, text: 'Calculer un prix', prompt: 'Je veux calculer le prix final d’un produit.' },
  { icon: Camera, text: 'Utiliser Lens', prompt: 'Explique-moi AYROVIX Lens et propose-moi de l’ouvrir.' },
  { icon: MessageSquare, text: 'Contacter le support', prompt: 'J’ai besoin d’aide du support AYROVI.' },
  { icon: Search, text: 'Rechercher un produit', prompt: 'Aide-moi à rechercher un produit à acheter.' },
];

const cleanAssistantText = (text: string) => text.replaceAll('[[OPEN_LENS]]', '').trim();

const CandidateImage = ({ product }: { product: AyrovixCandidate }) => {
  const images = [...new Set([product.image, ...(product.images || [])].filter(Boolean))] as string[];
  const [index, setIndex] = React.useState(0);
  if (!images[index]) return <div className="grid h-full place-items-center text-zinc-300"><ShoppingBag size={32}/></div>;
  return <img src={images[index]} alt="" referrerPolicy="no-referrer" onError={() => setIndex((value) => value + 1)} className="h-full w-full object-contain" loading="lazy"/>;
};

const ShareAction = ({ message, isDark }: { message: AssistantMessage; isDark: boolean }) => {
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'AYROVI', text: cleanAssistantText(message.text) });
      else await navigator.clipboard.writeText(cleanAssistantText(message.text));
    } catch { /* cancelled */ }
  };
  return <button type="button" onClick={() => void share()} aria-label="Partager" className={`rounded-lg p-1.5 transition ${isDark ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'}`}><Share2 size={15} /></button>;
};

const ToolPresentations = ({ message, isDark, selectedProduct, productBusyId, isOrdering, onSelectProduct, onProductOrder }: Pick<AssistantMessagesProps, 'selectedProduct' | 'productBusyId' | 'isOrdering' | 'onSelectProduct' | 'onProductOrder'> & { message: AssistantMessage; isDark: boolean }) => (
  <div className="mt-3 space-y-3">
    {message.orderStatuses?.map((order) => (
      <article key={order.orderId} className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-violet-100 bg-violet-50/50'}`}>
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><PackageCheck size={20}/></span><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-violet-500">Commande {order.orderId}</p><h3 className="mt-0.5 text-sm font-extrabold">{order.statusLabel}</h3><p className={`mt-1 text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{order.carrier && `${order.carrier} · `}{order.trackingCode || 'Suivi en préparation'}</p></div></div>
        {order.history?.length > 0 && <div className={`mt-3 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-zinc-400' : 'border-violet-100 text-zinc-500'}`}>{order.history.slice(-3).reverse().map((item) => <div key={`${item.status}-${item.at}`} className="flex justify-between gap-3 py-1"><span>{item.label}</span><time>{new Date(item.at).toLocaleDateString('fr-TN')}</time></div>)}</div>}
      </article>
    ))}
    {message.priceBreakdown && <article className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-emerald-100 bg-emerald-50/50'}`}>
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-lg text-white">د.ت</span><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-emerald-600">Estimation AYROVI</p><strong className="text-xl">{message.priceBreakdown.totalTND.toFixed(2)} TND</strong></div></div>
      <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs ${isDark ? 'border-white/10 text-zinc-400' : 'border-emerald-100 text-zinc-600'}`}><dt>Produit converti</dt><dd className="text-right">{message.priceBreakdown.convertedPriceTND.toFixed(2)} TND</dd><dt>Douane</dt><dd className="text-right">{message.priceBreakdown.customsFeeTND.toFixed(2)} TND</dd><dt>Livraison</dt><dd className="text-right">{message.priceBreakdown.shippingFeeTND.toFixed(2)} TND</dd><dt>Service</dt><dd className="text-right">{message.priceBreakdown.serviceFeeTND.toFixed(2)} TND</dd>{message.priceBreakdown.expressFeeTND > 0 && <><dt>Express</dt><dd className="text-right">{message.priceBreakdown.expressFeeTND.toFixed(2)} TND</dd></>}</dl>
    </article>}
    {message.products?.length ? <div className="grid gap-3 sm:grid-cols-2">
      {message.products.map((product) => <article key={product.id} className={`overflow-hidden rounded-2xl border ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-zinc-200 bg-white'}`}>
        <div className={`relative aspect-[4/3] ${isDark ? 'bg-white/5' : 'bg-zinc-50'}`}><CandidateImage product={product}/><span className="absolute left-2 top-2 rounded-full bg-zinc-950/80 px-2 py-1 text-[9px] font-bold text-white">{product.source}</span></div>
        <div className="p-3"><h3 className="line-clamp-2 min-h-9 text-xs font-extrabold leading-snug">{product.title}</h3><div className="mt-2 flex items-end justify-between gap-2"><div>{product.price != null && <p className="text-sm font-black text-violet-600">{product.price} {product.currency}</p>}{product.priceTnd != null && <p className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>≈ {product.priceTnd.toFixed(2)} TND</p>}</div><button type="button" disabled={Boolean(productBusyId)} onClick={() => onSelectProduct(message.id, product)} className="min-h-9 rounded-xl bg-violet-600 px-3 text-[11px] font-extrabold text-white disabled:opacity-50">{productBusyId === product.id ? 'Vérification…' : 'Choisir'}</button></div></div>
      </article>)}
    </div> : null}
    {selectedProduct?.messageId === message.id && <div className={`overflow-hidden rounded-2xl border p-2 ${isDark ? 'border-white/10 bg-white' : 'border-violet-200 bg-white'}`}><ProductResult product={selectedProduct.product} priceVerified={selectedProduct.priceVerified} ordering={isOrdering} onOrder={onProductOrder}/></div>}
    {message.supportTicket && <article className={`flex items-start gap-3 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.04]' : 'border-amber-100 bg-amber-50'}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><MessageSquare size={20}/></span><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-amber-600">Support AYROVI</p><h3 className="mt-0.5 text-sm font-extrabold">Ticket enregistré</h3><p className={`mt-1 break-all text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Référence : {message.supportTicket.id}</p></div></article>}
  </div>
);

export const AssistantMessages: React.FC<AssistantMessagesProps> = ({
  messages, isGenerating, motionState, isDark, copiedId, feedback, selectedProduct, productBusyId, isOrdering,
  onPrompt, onCopy, onRegenerate, onFeedback, onOpenComment, onOpenLens, onSelectProduct, onProductOrder,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  const lastMessage = messages.at(-1);
  const lastAssistantHasContent = Boolean(lastMessage?.role === 'assistant' && (
    cleanAssistantText(lastMessage.text) || lastMessage.products?.length || lastMessage.priceBreakdown
    || lastMessage.orderStatuses?.length || lastMessage.supportTicket
  ));
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, isGenerating, motionState, selectedProduct]);

  return (
    <main className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${isDark ? 'bg-ink text-zinc-100' : 'bg-surface text-zinc-900'}`}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-5 pt-5 sm:px-7">
        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <AyroviMotion state="idle" size={112} color="#673de6" />
            <p className={`mt-5 max-w-md text-[15px] leading-7 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Posez votre question à AYROVI pour suivre une commande, calculer un prix, rechercher un produit ou contacter notre équipe.</p>
            <div className="mt-7 grid w-full max-w-xl grid-cols-2 gap-2.5 sm:grid-cols-3">
              {quickPrompts.map((item) => {
                const Icon = item.icon;
                return <button key={item.text} type="button" onClick={() => onPrompt(item.prompt)} className={`assistant-quick-card min-h-[88px] rounded-2xl p-3 text-left text-xs font-extrabold leading-5 transition active:scale-[0.98] ${isDark ? 'assistant-quick-card--dark text-zinc-100' : 'text-zinc-800'}`}>
                  <span className="assistant-quick-card__icon mb-2"><Icon size={18}/></span>
                  <span className="relative z-[1]">{item.text}</span>
                </button>;
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
                    label={isLastAssistantStreaming ? 'AYROVI prépare la réponse' : 'AYROVI'}
                  />
                )}
                <div className={message.role === 'user' ? 'max-w-[82%]' : hasPresentation ? 'min-w-0 flex-1 max-w-[92%]' : 'min-w-0 max-w-[82%]'}>
                  <div className={`rounded-[22px] px-4 py-3 text-[14px] leading-6 ${message.role === 'user' ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md' : isDark ? 'rounded-bl-md border border-white/10 bg-white/[0.055] text-zinc-100' : 'rounded-bl-md border border-zinc-200 bg-white text-zinc-800 shadow-sm'}`}>
                    {assistantText && <p className="whitespace-pre-wrap">{assistantText}</p>}
                    {message.attachments?.length ? <div className="mt-2 space-y-2">{message.attachments.map((attachment) => <div key={attachment.id} className="overflow-hidden rounded-xl border border-white/15 bg-black/10">{attachment.preview ? <img src={attachment.preview} alt={attachment.name} className="max-h-48 w-full object-cover"/> : <p className="px-3 py-2 text-xs">{attachment.name}</p>}</div>)}</div> : null}
                    {message.role === 'assistant' && <ToolPresentations message={message} isDark={isDark} selectedProduct={selectedProduct} productBusyId={productBusyId} isOrdering={isOrdering} onSelectProduct={onSelectProduct} onProductOrder={onProductOrder}/>}
                    {message.role === 'assistant' && message.text.includes('[[OPEN_LENS]]') && <button type="button" onClick={onOpenLens} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-xs font-extrabold text-white"><Sparkles size={16}/> Ouvrir AYROVIX Lens</button>}
                  </div>
                  {message.role === 'assistant' && !isLastAssistantStreaming && <div className="mt-1.5 flex items-center gap-0.5 px-1"><button type="button" onClick={() => onCopy(message)} aria-label="Copier" className={`rounded-lg p-1.5 transition ${isDark ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'}`}>{copiedId === message.id ? <Check size={15}/> : <Copy size={15}/>}</button><button type="button" onClick={() => onRegenerate(message.id)} aria-label="Régénérer" className={`rounded-lg p-1.5 transition ${isDark ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'}`}><RefreshCw size={15}/></button><button type="button" aria-label="Lire" className={`rounded-lg p-1.5 transition ${isDark ? 'text-zinc-400 hover:bg-white/5 hover:text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'}`} onClick={() => window.speechSynthesis?.speak(new SpeechSynthesisUtterance(assistantText))}><Volume2 size={15}/></button><ShareAction message={message} isDark={isDark}/><span className={`mx-1 h-4 w-px ${isDark ? 'bg-white/10' : 'bg-zinc-200'}`}/><button type="button" onClick={() => onFeedback(message, 'up')} aria-label="Utile" className={`rounded-lg p-1.5 ${feedback[message.id] === 'up' ? 'bg-emerald-100 text-emerald-700' : isDark ? 'text-zinc-400 hover:bg-white/5' : 'text-zinc-400 hover:bg-zinc-100'}`}><ThumbsUp size={15}/></button><button type="button" onClick={() => onFeedback(message, 'down')} aria-label="Pas utile" className={`rounded-lg p-1.5 ${feedback[message.id] === 'down' ? 'bg-rose-100 text-rose-700' : isDark ? 'text-zinc-400 hover:bg-white/5' : 'text-zinc-400 hover:bg-zinc-100'}`}><ThumbsDown size={15}/></button><button type="button" onClick={() => onOpenComment(message)} className={`ml-1 rounded-lg px-2 py-1 text-[10px] font-bold ${isDark ? 'text-zinc-500 hover:bg-white/5' : 'text-zinc-400 hover:bg-zinc-100'}`}>Commenter</button></div>}
                </div>
              </div>;
            })}
            {isGenerating && !lastAssistantHasContent && <div className="flex items-center gap-3 px-1 py-1"><AssistantBrandMark state={motionState} size={40} label="AYROVI prépare la réponse"/><div><p className={`text-xs font-bold ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>{motionState === 'thinking' ? 'AYROVI réfléchit…' : motionState === 'analyzing' ? 'Analyse des informations…' : motionState === 'reasoning' ? 'Vérification des données…' : 'Création de la réponse…'}</p><span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Les données de commande et de prix ne sont jamais inventées.</span></div></div>}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
    </main>
  );
};
