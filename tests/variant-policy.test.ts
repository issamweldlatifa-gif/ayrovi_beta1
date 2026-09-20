import { describe, expect, it } from 'vitest';
import { allowsMerchantVariantChoice, isSelectableVariant, reportedVariantStock } from '../shared/variantPolicy';
describe('shared variant policy',()=>{
 it.each([false,undefined,null,'false','true',0,1,{},[]].map(available=>({available})))('does not turn malformed eligibility into a variant quote: %j',value=>expect(isSelectableVariant(value)).toBe(false));
 it('accepts only the explicit eligible boolean',()=>expect(isSelectableVariant({available:true})).toBe(true));
 it('does not conflate manual choice with confirmed inventory',()=>{expect(allowsMerchantVariantChoice({option1:'M'})).toBe(true);expect(reportedVariantStock({option1:'M'})).toBeNull();});
 it('keeps conflicting merchant flags inconclusive but excludes the choice conservatively',()=>{const value={available:true,inStock:false};expect(reportedVariantStock(value)).toBeNull();expect(allowsMerchantVariantChoice(value)).toBe(false);});
 it('recognizes explicit negative merchant evidence',()=>expect(reportedVariantStock({isInStock:false})).toBe(false));
 it.each([null,false,[],1].map(value=>({value})))('does not interpret a non-record as evidence: %j',({value})=>{expect(reportedVariantStock(value)).toBeNull();expect(allowsMerchantVariantChoice(value)).toBe(false);});
});
