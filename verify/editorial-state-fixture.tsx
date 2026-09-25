/* Test-only component states. Not imported or served by the production application. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider, useLocale } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { AssistantVoiceModeScreen } from '../client/src/components/assistant/AssistantVoiceModeScreen';
import { AssistantMessages } from '../client/src/components/assistant/AssistantMessages';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import * as Icons from '../client/src/components/QatafoIcons';
import { CommentSheet } from '../client/src/social/components/CommentSheet';
import { CartDrawer } from '../client/src/components/CartDrawer';
import { CheckoutModal } from '../client/src/components/CheckoutModal';
import { NavigationHistoryProvider, useNavigationHistory } from '../client/src/navigation/NavigationHistory';
import type { CartItem, CustomerSession } from '../client/src/types';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
const events:unknown[]=[];
const session:CustomerSession={csrfToken:'test-only',account:{id:'fixture',displayName:'Test Fixture',email:'fixture@example.test',phone:'98123456',avatarUrl:'',emailVerified:true,phoneVerified:false,status:'ACTIVE',locale:'fr-TN',marketingOptIn:false}};
const cartItem:CartItem={id:'fixture-item',sessionId:'fixture',store:'TEST FIXTURE',externalId:null,sourceUrl:'javascript:alert(1)',title:'Produit de test / منتج اختباري',imageUrl:'',sourcePrice:100,sourceCurrency:'TND',priceTND:100,variant:null,requestedSize:'',requestedColor:'',customerNote:'Données de test uniquement / بيانات اختبار فقط',referenceUrl:'',priceVerificationStatus:'PENDING_MANUAL',quantity:1,createdAt:'',updatedAt:''};
function Fixture(){
 const {tr}=useLocale();
 const navigation=useNavigationHistory();
 const [state,setState]=useState<any>({kind:'voice',voice:'listening',dark:false,muted:false,speakerMuted:false});
 (window as any).setEditorialFixture=(next:any)=>{setState((current:any)=>({...current,...next}));if(next.kind==='checkout')navigation.navigate([{id:'checkout'},{id:'checkout:payment'}],{replace:true});};
 (window as any).editorialFixtureEvents=events;
 const product:AyrovixProduct={title:tr('Produit de test — titre volontairement long pour vérifier le téléphone','منتج اختباري بعنوان طويل للتحقق من القراءة والتفاف النص على الهاتف'),description:tr('Données fictives, exclusivement pour vérifier le composant.','بيانات اختبار فقط، ليست عرضًا للبيع.'),brand:null,model:null,image:'',images:[],source:'TEST FIXTURE',sourceUrl:'https://example.com/test-product',price:20,currency:'TND',priceTnd:30,exchangeRate:1,colors:[],sizes:[],availability:'unknown',...state.product};
 return <div data-fixture={state.kind} style={{position:'relative',height:'100dvh',overflow:'auto',padding:state.kind==='voice'?0:16}}>
  {state.kind==='voice'?<AssistantVoiceModeScreen state={state.voice} volumeLevel={.4} isDark={state.dark} isMuted={state.muted} isSpeakerMuted={state.speakerMuted}
   onToggleMute={()=>setState((s:any)=>({...s,muted:!s.muted}))} onToggleSpeaker={()=>setState((s:any)=>({...s,speakerMuted:!s.speakerMuted}))}
   onExit={()=>events.push({action:'exit'})} onTapOrb={()=>events.push({action:'tap'})} onOpenAttachments={()=>events.push({action:'attachment'})} onOpenLens={()=>events.push({action:'lens'})}
   onSelectSuggestion={text=>events.push({action:'suggestion',text})} onVoiceSettingsChange={settings=>events.push({action:'settings',settings})}/>
  :state.kind==='product'?<ProductResult product={product} priceVerified={false} ordering={Boolean(state.ordering)} onOrder={selection=>events.push({action:'order',selection})}/>
  :state.kind==='messages'?<div style={{height:'100%',display:'flex',flexDirection:'column'}}><AssistantMessages
   messages={[{id:'long-fixture',role:'assistant',text:tr('Premier paragraphe complet.\n\nDeuxième paragraphe complet.\n','فقرة أولى كاملة.\n\nفقرة ثانية كاملة.\n')+'https://example.test/'+ 'longtoken'.repeat(35),
    products:[{id:'candidate-fixture',title:tr('Produit avec un titre très long qui doit rester lisible sans suppression de mots — taille, couleur, matière et variante finale','منتج بعنوان طويل يجب أن يبقى كاملًا دون حذف كلمات — المقاس واللون والخامة والمواصفة الأخيرة'),source:tr('Marchand au nom long publié dans les données','اسم متجر طويل كما ورد في البيانات'),sourceUrl:'https://example.test/item',price:10,priceTnd:35,currency:'EUR',image:'',images:[],colors:[],sizes:[],match:80,kind:'external'} as any],
    lensSummary:{confidence:.82,verified:false,warnings:['WARNING_FIRST / تحذير أول','WARNING_SECOND / تحذير ثان','WARNING_LAST / تحذير أخير']},
    orderStatuses:[{orderId:'fixture-order',status:'TEST',statusLabel:'Test only / بيانات اختبار',paymentStatus:'UNPAID',depositStatus:'PENDING',trackingCode:'',carrier:'',expectedAt:null,updatedAt:'2026-09-20',history:Array.from({length:6},(_,i)=>({status:'test-'+i,label:'History / سجل '+i,at:'2026-09-20T10:00:00Z'}))}]}]}
   isGenerating={false} motionState="idle" isDark={false} copiedId={null} feedback={{}} selectedProduct={null} productBusyId="" isOrdering={false}
   onPrompt={()=>{}} onCopy={()=>{}} onRegenerate={()=>{}} onFeedback={()=>{}} onOpenComment={()=>{}} onOpenLens={()=>{}} onSelectProduct={()=>{}} onProductOrder={async()=>{}} onOpenCart={()=>{}} onProductBack={()=>{}}/></div>
  :state.kind==='comments'?<CommentSheet postId="fixture-post" isAuthenticated={true} onRequireAuth={()=>events.push({action:'auth'})} onClose={()=>events.push({action:'comments-close'})}/>
  :state.kind==='cart'?<CartDrawer isOpen items={[cartItem]} totalTND={100} onClose={()=>events.push({action:'cart-close'})} onUpdateQuantity={()=>{}} onRemoveItem={()=>{}} onProceedToCheckout={()=>events.push({action:'checkout'})} onCalculateAnotherProduct={()=>{}}/>
  :state.kind==='checkout'?<CheckoutModal isOpen customerSession={session} totalTND={100} itemCount={1} breakdown={{subtotal:100,customs:0,shipping:0,service:0,express:0,discount:0}} onClose={()=>{}} onRequireAuthentication={()=>events.push({action:'auth'})} onOrderSuccess={()=>events.push({action:'order-success'})}/>
  :<div data-icon-gallery style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(72px,1fr))',gap:8}}>{Object.entries(Icons).map(([name,Icon])=><div key={name} style={{padding:8,border:'1px solid #ddd',textAlign:'center'}}><Icon size={24}/><small style={{display:'block',fontSize:9}}>{name}</small></div>)}</div>}
 </div>;
}
createRoot(document.getElementById('state-root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><Fixture/></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
