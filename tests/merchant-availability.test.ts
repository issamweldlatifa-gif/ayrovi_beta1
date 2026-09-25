import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
function parse(flags:unknown[],statuses?:string|string[]) {
  const product={title:'Stock fixture',options:['Size','Color'],variants:flags.map((flag,i)=>({id:i,option1:'M',option2:'Color '+i,price:20,...(flag as any)}))};
  const offers=statuses==null?undefined:(Array.isArray(statuses)?statuses:[statuses]).map(availability=>({price:20,priceCurrency:'EUR',availability}));
  const html=`<html><head><script type="application/json">${JSON.stringify(product)}</script><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:product.title,offers})}</script></head></html>`;
  return parseProductPageHtml(html,'https://example.org/product','generic');
}
describe('merchant stock evidence is independent from selectable variants',()=>{
  it.each([{}, {available:null}, {available:'false'}, {available:'true'}, {available:0}, {available:1}, {available:[]}, {available:{}}])('does not infer stock from an option with %j',flag=>{
    const product=parse([flag]);expect(product.availability).toBe('unknown');
    expect(product.variants.details).toHaveLength(1); // Preserve a manual choice, not a stock assertion.
  });
  it.each([{available:true},{inStock:true},{isInStock:true}])('recognizes explicit positive evidence %j',flag=>expect(parse([flag]).availability).toBe('in_stock'));
  it('keeps known-negative options excluded from selection',()=>{expect(parse([{available:false}]).variants.details).toHaveLength(0);});
  it.each([
    [{},'https://schema.org/OutOfStock','out_of_stock'],
    [{},'https://schema.org/LimitedAvailability','limited'],
    [{available:true},'https://schema.org/OutOfStock','unknown'],
    [{available:false},'https://schema.org/InStock','unknown'],
    [{available:true},'https://schema.org/LimitedAvailability','limited'],
    [{available:false},'https://schema.org/LimitedAvailability','unknown'],
    [{available:true},['https://schema.org/InStock','https://schema.org/OutOfStock'],'unknown'],
    [{},'https://evil.example/NotInStock','unknown'],
  ])('reconciles variant %j with schema %j as %s',(flag,status,expected)=>expect(parse([flag],status as any).availability).toBe(expected));
  it('recognizes a fully negative explicit variant list without a positive assertion',()=>expect(parse([{available:false},{inStock:false}]).availability).toBe('out_of_stock'));
  it('does not generalize negative evidence over unreported variants',()=>expect(parse([{available:false},{}]).availability).toBe('unknown'));
  it('does not claim no stock from a truncated prefix of a large list',()=>expect(parse([...Array.from({length:300},()=>({available:false})),{available:true}]).availability).toBe('unknown'));
});

it.each(['https://schema.org/OutOfStock','https://schema.org/InStock'])('does not generalize %s over unreported offers',status=>expect(parse([], [status,'unreported'])).toMatchObject({availability:'unknown'}));
