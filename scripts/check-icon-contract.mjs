import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const policy=JSON.parse(fs.readFileSync(new URL('../client/src/design/editorial/icon-exceptions.json',import.meta.url),'utf8'));
const vectorTags=new Set(['svg','path','rect','circle','ellipse','line','polyline','polygon','use','symbol']);
const symbolIcon=/[✓✔✕✖✗☰⋮◉◎↻▶◼]|\p{Extended_Pictographic}/u;

/** AST-based checks: comments and customer/server content are not interpreted as UI icons. */
export function inspectIconSource(file,text) {
  const issues=[],svg=[];const exception=policy.rawSvg[file];
  const src=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const issue=(node,reason)=>issues.push({file,line:src.getLineAndCharacterOfPosition(node.getStart(src)).line+1,reason});
  const attr=(node,name)=>node.attributes?.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(src)===name)?.initializer;
  function visit(node){
    if(ts.isImportDeclaration(node)){
      const module=node.moduleSpecifier.text;
      if(!module.startsWith('.') && /(?:icons?|lucide|heroicons|fortawesome|phosphor)/i.test(module)){
        if(file!==policy.brandModule)issue(node,'Icon packages may only be imported by the brand registry. Use QatafoIcons or EditorialIcon.');
        else if(module==='react-icons' && node.importClause?.isTypeOnly){} // Type definitions only.
        else {
          const bindings=node.importClause?.namedBindings;
          if(!policy.brandImports[module] || !bindings || !ts.isNamedImports(bindings) || bindings.elements.some(e=>!policy.brandImports[module].includes((e.propertyName||e.name).text)))issue(node,'Only the explicitly approved original brand marks may bypass the UI family.');
        }
      }
    }
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const tag=node.tagName.getText(src);
      if(vectorTags.has(tag) && !exception)issue(node,'Inline vector geometry outside the central renderer or documented non-icon visualization.');
      if(tag==='svg'){
        svg.push(node);
        if(exception?.attribute && attr(node,exception.attribute)?.text!==exception.value)issue(node,'Raw SVG must identify its reviewed brand/data purpose.');
      }
      if(attr(node,'family')?.text==='legacy')issue(node,'Legacy icon families are forbidden throughout the app.');
      if(!exception && ['strokeWidth','strokeLinecap','strokeLinejoin','viewBox'].some(key=>attr(node,key)))issue(node,'Per-screen icon geometry overrides are forbidden.');
      const classes=attr(node,'className')?.getText(src)||'';
      if(/\bstroke-(?:\d|\[)/.test(classes))issue(node,'Icon stroke thickness belongs to the family, not the screen.');
      if((tag==='span'||tag==='div') && /animate-spin/.test(classes) && /border-/.test(classes))issue(node,'Use the shared Loader2/Spinner instead of a CSS-drawn icon.');
    }
    if(ts.isPropertyAssignment(node) && !exception && ['strokeWidth','strokeLinecap','strokeLinejoin'].includes(node.name.getText(src)))issue(node,'Inline style cannot override central icon geometry.');
    if(ts.isCallExpression(node)){
      const callee=node.expression.getText(src);
      if(callee==='createAyroviIcon' && node.arguments.length!==1)issue(node,'Compatibility icons must reference a glyph name, never contain duplicate drawings.');
      if(/(?:createElement|createElementNS)$/.test(callee) && node.arguments.some(a=>ts.isStringLiteral(a)&&vectorTags.has(a.text)) && !exception)issue(node,'Programmatic inline SVG bypasses the icon renderer.');
    }
    if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)) && symbolIcon.test(node.text)){
      // Copyright and trademark signs are typography, not UI illustrations.
      const stripped=node.text.replace(/[©®™]/g,'');
      if(symbolIcon.test(stripped))issue(node,'Authored emoji/text icons must use the editorial family.');
    }
    ts.forEachChild(node,visit);
  }
  visit(src);
  if(exception && svg.length!==exception.count)issues.push({file,line:1,reason:`Expected exactly ${exception.count} reviewed SVG(s), found ${svg.length}.`});
  return {issues,rawSvgCount:svg.length};
}

export function checkIconContract(root=process.cwd()) {
  const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
  const files=walk('client/src').filter(f=>/\.(tsx?|css)$/.test(f));let svg=0;const issues=[];
  for(const file of files){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    if(file.endsWith('.css')){
      const clean=text.replace(/\/\*[\s\S]*?\*\//g,'');
      if(/stroke-(?:width|linecap|linejoin)\s*:/.test(clean))issues.push({file,line:1,reason:'CSS may size/color icons, but cannot redefine their geometry.'});
      if(/data:image\/svg|(?:mask|background)(?:-image)?\s*:[^;]*\.svg|font-family\s*:[^;]*(?:Font Awesome|Material Icons)/i.test(clean))issues.push({file,line:1,reason:'CSS-drawn/image/font icons require migration to the shared renderer.'});
    } else {const result=inspectIconSource(file,text);issues.push(...result.issues);svg+=result.rawSvgCount;}
  }
  for(const file of Object.keys(policy.rawSvg))if(!files.includes(file))issues.push({file,line:1,reason:'Stale SVG exception: remove or update it explicitly.'});
  return {scope:'All client source, public and admin',files:files.length,rawSvg:svg,issues};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const report=checkIconContract();
  for(const issue of report.issues)console.error(`${issue.file}:${issue.line}: ${issue.reason}`);
  console.log(`Icon contract: ${report.files} source files; ${report.rawSvg} reviewed SVG roots; ${report.issues.length} violations.`);
  if(report.issues.length)process.exitCode=1;
}
