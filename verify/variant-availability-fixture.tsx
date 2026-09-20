/* Verification-only entry: real shared product UI and history decoder, no production import. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import { readAssistantHistory } from '../client/src/components/assistant/conversationHistory';
const orders:unknown[]=[];
(window as any).variantTestOrders=orders;
function Fixture(){
 const [value,setValue]=React.useState<any>(null);
 React.useEffect(()=>{(window as any).setVariantFixture=(product:any,history=false)=>{
  orders.length=0;
  if(history){const snapshot={id:'variant-history',title:'Stored question / سؤال محفوظ',messages:[{id:'message',role:'assistant',text:'PRESERVED_TEXT / نص محفوظ بالكامل'}],selectedProduct:{messageId:'message',product,priceVerified:false},createdAt:'2026-09-20T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z'};localStorage.setItem('ayrovi_assistant_conversations_v1_guest',JSON.stringify([snapshot]));const result=readAssistantHistory();(window as any).variantTestHistory=result;setValue(result.conversations[0]?.selectedProduct?.product);}
  else setValue(product);
 };},[]);
 return <main style={{padding:16}}>{value?<ProductResult key={value.title} product={value} ordering={false} priceVerified={false} onOrder={selection=>orders.push(selection)}/>:<p>Verification ready</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><Fixture/></CustomerIdentity></LocaleProvider>);
