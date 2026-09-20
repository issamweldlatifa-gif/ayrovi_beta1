import fs from 'node:fs';
const glyphs=JSON.parse(fs.readFileSync('client/src/design/editorial/glyphs.json','utf8'));
const identity=JSON.parse(fs.readFileSync('client/src/design/editorial/identity.json','utf8'));

/** Inspect real rendered SVG geometry and computed paint, not just a family marker. */
export async function inspectEditorialIcons(page, selector) {
  return page.locator(selector).first().evaluate((root,{glyphs,stroke})=>{
    const names=[],errors=[];
    for(const svg of root.querySelectorAll('svg')){
      if(!svg.hasAttribute('data-editorial-icon') && !svg.hasAttribute('data-brand-icon') && !svg.hasAttribute('data-brand-mark') && !svg.hasAttribute('data-visualization')) errors.push('Unregistered SVG in rendered screen');
    }
    for(const svg of root.querySelectorAll('svg[data-ayrovi-icon],svg[data-editorial-icon]')) {
      const name=svg.getAttribute('data-ayrovi-icon') || svg.getAttribute('data-editorial-icon');
      names.push(name);
      const glyph=glyphs[name];
      if(!glyph || svg.getAttribute('data-editorial-icon')!==name){errors.push(`${name}: legacy or unknown family`);continue;}
      const group=svg.querySelector(':scope > g');
      const shapes=group ? [...group.children] : [];
      if(shapes.length!==glyph.shapes.length)errors.push(`${name}: shape count`);
      glyph.shapes.forEach((shape,i)=>{
        const actual=shapes[i];
        if(!actual || actual.tagName!==shape.tag){errors.push(`${name}/${i}: shape type`);return;}
        const expected=Object.entries(shape.attrs).map(([k,v])=>[k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(v)]);
        if(actual.attributes.length!==expected.length || expected.some(([k,v])=>actual.getAttribute(k)!==v))errors.push(`${name}/${i}: geometry differs from reference`);
      });
      const style=getComputedStyle(svg);
      if(parseFloat(style.strokeWidth)!==stroke || style.strokeLinecap!=='square' || style.strokeLinejoin!=='miter')errors.push(`${name}: computed stroke differs from reference`);
      const rtl=svg.closest('[dir]')?.getAttribute('dir')==='rtl';
      const expectedTransform=rtl && glyph.mirrorRtl ? 'translate(24 0) scale(-1 1)' : null;
      if(group?.getAttribute('transform')!==expectedTransform)errors.push(`${name}: RTL transform`);
    }
    return {count:names.length,names:[...new Set(names)],errors};
  },{glyphs,stroke:identity.geometry.iconStroke});
}
