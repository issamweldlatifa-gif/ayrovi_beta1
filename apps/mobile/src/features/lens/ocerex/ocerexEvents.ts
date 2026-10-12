/** أحداث التحليل لكل نتيجة — نفس منطق الموقع (`ocerex_*`)، بلا بيانات شخصية. */
export function eventsForExtraction(input: {
  type: string;
  referencePrice: number | null;
  confidenceLevel: string;
}): string[] {
  const events: string[] = [];
  const isCart = input.type.toUpperCase() === 'CART';
  events.push(isCart ? 'ocerex_cart_detected' : 'ocerex_product_detected');
  if (input.referencePrice != null) events.push('ocerex_reference_price_detected');
  if (input.confidenceLevel.toUpperCase() === 'LOW') events.push('ocerex_low_confidence');
  return events;
}
