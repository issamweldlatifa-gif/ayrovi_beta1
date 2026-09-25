import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MerchantRating } from '../client/src/ayrovix/components/MerchantRating';
import { ProductResult } from '../client/src/ayrovix/components/ProductResult';
import { displayRating } from '../client/src/ayrovix/services/resultPolicy';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
const product:AyrovixProduct={title:'Test product',brand:null,model:null,description:'',image:'',images:[],source:'Test',sourceUrl:'https://example.com/item',price:20,currency:'TND',priceTnd:30,exchangeRate:1,colors:[],sizes:[],availability:'unknown'};
describe('product presentation does not invent trust signals or commercial terms',()=>{
 it.each([undefined,null,0,-1,5.1,NaN,Infinity])('does not invent missing or invalid merchant reviews: %s',rating=>expect(displayRating({rating,ratingKind:'merchant'})).toBeNull());
 it.each(['match','listing-quality',undefined])('never converts %s into merchant review stars',ratingKind=>{
  expect(displayRating({rating:4.9,ratingKind})).toBeNull();
  expect(renderToStaticMarkup(<LocaleProvider><MerchantRating value={{rating:4.9,ratingKind}}/></LocaleProvider>)).toBe('');
 });
 it('renders a real attributed merchant review with its actual count',()=>{
  const html=renderToStaticMarkup(<LocaleProvider><MerchantRating value={{rating:4.3,ratingKind:'merchant',ratingCount:27}}/></LocaleProvider>);
  expect(html).toContain('4.3/5');expect(html).toContain('marchand');expect(html).toContain('(27)');
 });
 it.each(['javascript:alert(1)','data:text/html,unsafe','https://user:password@example.com/x','http://127.0.0.1/private'])('never exposes an unsafe secondary merchant link: %s',sourceUrl=>{
  const html=renderToStaticMarkup(<LocaleProvider><ProductResult product={{...product,sourceUrl}} priceVerified={false} ordering={false} onOrder={()=>{}}/></LocaleProvider>);
  expect(html).not.toContain('href=');expect(html).not.toContain('4.5/5');expect(html).not.toContain('5.0/5');
 });
 it('waits for server-provided payment conditions instead of silently inventing 20%',()=>{
  const html=renderToStaticMarkup(<LocaleProvider><ProductResult product={product} priceVerified={false} ordering={false} onOrder={()=>{}}/></LocaleProvider>);
  expect(html).not.toContain('20%');expect(html).not.toContain('null%');expect(html).toContain('Conditions de paiement en cours de chargement');expect(html).toContain('disabled=');expect(html).toContain('Prix AYROVI par article');
 });
});
