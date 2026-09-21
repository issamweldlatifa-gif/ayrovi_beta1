import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect,afterEach,vi } from 'vitest';
import { LensProductCard, lensCardCopy } from '../client/src/ayrovix/components/LensProductCard';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { serpApiVisualSearchUrl } from '../src/ayrovix/services/visualSearch';
import { displayRating } from '../client/src/ayrovix/services/resultPolicy';
import type { AyrovixCandidate } from '../client/src/ayrovix/types';
const candidate: AyrovixCandidate={id:'jacket',kind:'external',title:'K-Way LIL — Veste mi-saison',brand:'K-Way',model:null,colors:[],sizes:[],source:'Example',sourceUrl:'https://shop.example/item',image:'/jacket.jpg',price:179.95,currency:'EUR',priceTnd:650,match:94,rating:4.3,ratingCount:27,ratingKind:'merchant'};
const render=(patch:Partial<AyrovixCandidate>={})=>renderToStaticMarkup(<LocaleProvider><LensProductCard candidate={{...candidate,...patch}} onChoose={()=>{}} saved={false} busy={false} onFavorite={()=>{}}/></LocaleProvider>);
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('reference Lens product card',()=>{
 it('shows brand, description, one unmodified TND price, and no redundant commercial copy',()=>{
  const html=render();expect(html).toContain('K-Way');expect(html).toContain('LIL — Veste mi-saison');expect(html).toContain('650.00 DT');
  for(const text of ['Prix boutique','Prix final estimé','Estimation','douane','transport','Tailles/couleurs','94%','Meilleure note','Nouveau','179.95'])expect(html).not.toContain(text);
 });
 it('does not invent a brand when SerpApi has only a title',()=>{
  expect(lensCardCopy({...candidate,brand:null,model:null,description:null})).toEqual({heading:candidate.title,description:''});
  expect(lensCardCopy({...candidate,brand:null,description:'Description du marchand'}).description).toBe('Description du marchand');
 });
 it('uses real yellow-star geometry with the numerical value and review count',()=>{
  const html=render();expect(html.match(/class="lens-rating-star"/g)).toHaveLength(5);expect(html).toContain('4.3/5');expect(html).toContain('(27)');expect(html).toContain('data-ayrovi-icon="Star"');
 });
 it.each(['match','listing-quality',undefined])('does not convert %s scores into stars',kind=>{
  expect(render({ratingKind:kind as any})).not.toContain('data-merchant-rating');
 });
 it.each([null,0,-1,NaN,Infinity,5.1])('does not display invalid rating %s',rating=>expect(render({rating})).not.toContain('data-merchant-rating'));
 it.each([null,0,-1,NaN,Infinity])('shows confirmation instead of a fabricated price for %s',priceTnd=>{
  const html=render({priceTnd});expect(html).toContain('Prix à confirmer');expect(html).not.toContain('0.00 DT');
 });
 it('does not substitute the uploaded image for a missing merchant product image',()=>{
  const html=render({image:'',images:[]});expect(html).toContain('lens-card-placeholder');expect(html).not.toContain('<img');
 });
 it('keeps favorite and product as separate buttons with accessible names',()=>{
  const html=render();expect(html.match(/<button/g)).toHaveLength(2);expect(html).toContain('Ajouter aux favoris');expect(html).toContain('aria-pressed="false"');expect(html).toContain('aria-describedby=');
 });
 it('preserves SerpApi reviews from both supported rating fields and never uses match as a rating',async()=>{
  vi.stubEnv('SERPAPI_KEY','fixture-key-not-a-secret');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({visual_matches:[
   {title:'K-Way LIL jacket',brand:'K-Way',description:'Merchant description',link:'https://shop.example/a',price:{extracted_value:179.95,currency:'EUR'},rating:4.6,reviews:137},
   {title:'Black jacket',link:'https://shop.example/b',price:{extracted_value:100,currency:'EUR'},product_rating:4.2,reviews_count:26},
   {title:'No rating jacket',link:'https://shop.example/c',price:{extracted_value:90,currency:'EUR'},exact_matches:true},
  ]}),{status:200})));
  const list=await serpApiVisualSearchUrl('https://example.com/card-rating-fixture.jpg');
  expect(list).toHaveLength(3);expect(list[0]).toMatchObject({rating:4.6,ratingCount:137,ratingKind:'merchant',brand:'K-Way',description:'Merchant description'});
  expect(list[1]).toMatchObject({rating:4.2,ratingCount:26,ratingKind:'merchant'});
  expect(displayRating(list[2])).toBeNull();expect(list[2].match).toBe(99);
 });
});
