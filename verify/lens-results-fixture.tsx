/** Browser-only fixture: actual results/sheet, generated scene, controlled provider state. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import type { AyrovixCandidate } from '../client/src/ayrovix/types';
const image = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#eceeed"/><path d="M160 80l80-40 80 40 65 200-60 20-20-95v225H175V205l-20 95-60-20z" fill="#212627"/><path d="M211 52l29 38 29-38M240 90v340" stroke="#d5d6ce" stroke-width="5" fill="none"/><path d="M480 310q50 35 100-10l30 50 110 28q20 10 0 35H450q-8-26 30-103" fill="#fff" stroke="#c5c9c7" stroke-width="4"/><path d="M565 335l48 12m-53 2l53 12m-61 2l54 12" stroke="#bfc4c2" stroke-width="5"/></svg>`);
const products = [{ name: 'Veste', category: 'clothing', box: [.115, .075, .375, .80] as [number,number,number,number] }, { name: 'Chaussure', category: 'shoes', box: [.55,.59,.39,.27] as [number,number,number,number] }];
const list: AyrovixCandidate[] = Array.from({length:9},(_,i)=>({id:'item-'+i,kind:'external',title:i%2?'Veste légère à capuche':'Veste noire — coupe droite',brand:'Atelier',model:null,colors:[],sizes:[],source:'Boutique test',sourceUrl:'https://example.com/p/'+i,image,price:84,currency:'EUR',priceTnd:598,match:94-i,priceVerificationStatus:'PENDING_MANUAL'}));
function Fixture(){
 const [loading,setLoading]=useState(true),[hasImage,setHasImage]=useState(true),[items,setItems]=useState(list),[detected,setDetected]=useState(products);
 const [preview,setPreview]=useState(image);
 const state = ((window as any).lensResultsTest ||= { searches:[],choices:[],resets:0 });
 Object.assign(state,{setLoading,setHasImage,setItems,setDetected,setPreview,image});
 return <div style={{position:'fixed',inset:0}}><InteractiveLensResults shell previewUrl={hasImage?preview:null} fallbackImage={null}
  view={{queryLabel:'Veste noire',list:items,eventId:'fixture'}} detectedProducts={detected} isLoading={loading}
  onRoiSearch={roi=>state.searches.push(roi)} onChoose={c=>state.choices.push(c.id)} onReset={()=>{state.resets++;}}/></div>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><Fixture/></CustomerIdentity></LocaleProvider>);
