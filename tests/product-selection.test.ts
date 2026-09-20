import { describe, expect, it } from 'vitest';
import { resolveProductSelection, completeProductOffer } from '../client/src/ayrovix/services/productSelection';
import { createAyrovixPriceToken, verifyAyrovixPriceToken } from '../src/ayrovix/priceQuote';
import type { AyrovixProduct, AyrovixVariantOption } from '../client/src/ayrovix/types';
const claims={price:20,currency:'EUR',title:'Product',referenceUrl:'https://example.org/product',status:'VERIFIED' as const};
const token=(price:number,currency='EUR')=>createAyrovixPriceToken({...claims,price,currency})!;
const option=(id:string,size:string,color:string,price:number):AyrovixVariantOption=>({id,label:`${size} · ${color}`,size,color,price,currency:'EUR',priceTnd:price*4,priceToken:token(price),available:true});
const blue=option('blue','M','Bleu',27),red=option('red','M','Rouge',35),large=option('large','L','Bleu',40);
const base:AyrovixProduct={title:claims.title,sourceUrl:claims.referenceUrl,brand:null,model:null,description:'',source:'Fixture',image:'',images:[],price:20,currency:'EUR',priceTnd:80,priceToken:token(20),exchangeRate:4,sizes:['M','L'],colors:['Bleu','Rouge'],availability:'unknown',priceVerificationStatus:'VERIFIED',variantOptions:[blue,red]};
const resolve=(options:AyrovixVariantOption[],size='M',color='')=>resolveProductSelection({...base,variantOptions:options},size,color);
describe('selection is deterministic and does not manufacture a specific variant',()=>{
 it('uses the general offer when no preference is given',()=>expect(resolve([blue,red],'','')).toMatchObject({kind:'general',option:null,offer:{price:20}}));
 it('accepts the one exact match with all its own quote fields',()=>expect(resolve([blue,red],'M','Bleu')).toMatchObject({kind:'matched',option:blue,offer:{price:27,currency:'EUR',priceTnd:108,priceToken:blue.priceToken,fromVariant:true}}));
 it.each([[blue,red],[red,blue]])('does not select a color by input order %j',(a,b)=>expect(resolve([a,b])).toMatchObject({kind:'ambiguous',option:null,offer:{price:20,priceToken:base.priceToken},generalEstimate:true}));
 it('does not select an unrequested size from several matches',()=>expect(resolve([blue,large],'','Bleu')).toMatchObject({kind:'ambiguous',option:null}));
 it('does not hide duplicate size/color quotes behind the first row',()=>expect(resolve([blue,{...blue,id:'different',price:32}],'M','Bleu')).toMatchObject({kind:'ambiguous',option:null}));
 it('keeps a custom manual request without inventing a variant ID',()=>expect(resolve([blue,red],'XXL','Vert')).toMatchObject({kind:'manual',option:null,generalEstimate:true,offer:{price:20}}));
 it('matches case and surrounding whitespace without changing the merchant object',()=>{const before=JSON.stringify(blue);expect(resolve([blue],' m ',' BLEU ').option).toBe(blue);expect(JSON.stringify(blue)).toBe(before);});
 it('excludes explicitly disabled and malformed eligibility',()=>expect(resolve([{...blue,available:false},{...red,available:'true' as any}])).toMatchObject({kind:'manual',option:null}));
 it('allows a single remaining eligible option, and does not copy it',()=>expect(resolve([blue,{...red,available:false}]).option).toBe(blue));
});
describe('one monetary source, no independent fallback mixing',()=>{
 it('uses the whole general offer for a completely unpriced option',()=>expect(resolve([{...blue,price:null,currency:null,priceTnd:null,priceToken:null}])).toMatchObject({offer:{price:20,currency:'EUR',priceTnd:80,priceToken:base.priceToken,fromVariant:false},generalEstimate:true}));
 it.each(['price','currency','priceToken'] as const)('never borrows a missing %s from the base quote',field=>{
  const selected=resolve([{...blue,[field]:null}]);expect(selected.offer[field]).toBeNull();expect(completeProductOffer(selected.offer)).toBe(false);
 });
 it('does not pair the variant price with the general TND estimate',()=>{const selected=resolve([{...blue,priceTnd:null}]);expect(selected.offer.price).toBe(27);expect(selected.offer.priceTnd).toBeNull();expect(completeProductOffer(selected.offer)).toBe(true);});
 it.each([0,-1,NaN,Infinity,'27'])('does not fall back from an invalid variant price %j',price=>{const s=resolve([{...blue,price:price as any}]);expect(s.offer.price).toBeNull();expect(completeProductOffer(s.offer)).toBe(false);});
 it.each(['',' eur ','EURO',null])('does not replace an invalid variant currency %j',currency=>{const s=resolve([{...blue,currency}]);expect(s.offer.currency).toBeNull();expect(completeProductOffer(s.offer)).toBe(false);});
 it.each(['','   ',null,undefined])('does not borrow a base token when the variant token is %j',priceToken=>expect(completeProductOffer(resolve([{...blue,priceToken}]).offer)).toBe(false));
 it('preserves a complete non-EUR variant quote without inheriting base currency',()=>{const usd={...blue,currency:'USD',priceToken:token(27,'USD')};expect(resolve([usd]).offer).toMatchObject({currency:'USD',priceToken:usd.priceToken});});
 it('preserves detected-price products through their populated product offer',()=>expect(resolveProductSelection({...base,sourceUrl:'',variantOptions:[]},'','').offer).toMatchObject({price:20,currency:'EUR',priceToken:base.priceToken}));
 it('produces a quote the actual server verifier accepts, for both general and variant offers',()=>{
  for(const selected of [resolve([blue,red]),resolve([blue,red],'M','Bleu')]){
   expect(completeProductOffer(selected.offer)).toBe(true);
   expect(verifyAyrovixPriceToken(selected.offer.priceToken,{...claims,price:selected.offer.price!,currency:selected.offer.currency!})).toBe(true);
  }
 });
 it('the server rejects the former mixed base token / variant price',()=>expect(verifyAyrovixPriceToken(base.priceToken,{...claims,price:27})).toBe(false));
});
