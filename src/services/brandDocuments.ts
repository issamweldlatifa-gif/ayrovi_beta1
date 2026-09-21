/** Brand styles for generated HTML, never interpolated from customer/CMS text. */
import fs from 'node:fs';
import { BRAND, FONT_STACK } from '../../shared/brand.generated';
export { FONT_STACK, BRAND };
let embedded: string | undefined;
export function documentIdentityCss(): string {
  if (embedded) return embedded;
  let css = fs.readFileSync('client/public/identity.css', 'utf8');
  for (const font of BRAND.fonts) css = css.replace(font.file, `data:font/woff2;base64,${fs.readFileSync('client/public' + font.file).toString('base64')}`);
  embedded = css;
  return css;
}
/** Mail clients can disable webfonts. No unapproved named font is requested;
 * the unavoidable generic fallback is a delivery-client limitation, not a third brand font. */
export function mailIdentityStyle(): string {
  let origin = '';
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '');
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin;
  } catch { /* leave webfont loading off if the canonical origin is not configured */ }
  const faces = origin ? BRAND.fonts.map(f => `@font-face{font-family:'${f.family}';src:url('${origin}${f.file}') format('woff2');font-style:normal;font-weight:${f.weight};font-display:swap;}`).join('') : '';
  return `<style>${faces}body,table,td,p,a,h1,h2,h3{font-family:${FONT_STACK};}</style>`;
}
