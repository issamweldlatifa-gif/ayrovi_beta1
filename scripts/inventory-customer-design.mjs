/** Reproducible source inventory, not a manual UX/security audit. No credentials or data. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const root = process.cwd();
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const files = walk('client/src').filter(f => /\.(tsx?|css)$/.test(f));
const domain = file => file.includes('/admin/') || file.includes('/back-office/') ? 'admin' : file.includes('/assistant/') ? 'sonim' : file.includes('/ayrovix/') || /LensFeature/.test(file) ? 'lens' : /customer|account|Customer/i.test(file) ? 'account-auth' : /Cart|Checkout|OrderSuccess|ProductDrawer/.test(file) ? 'commerce' : /social|Stories|discovery|Discovery/.test(file) ? 'discovery-social' : /\/design\/|\/icons\/|QatafoIcons/.test(file) ? 'shared-design' : 'shell-content';
const records = files.map(file => {
 const text = fs.readFileSync(file,'utf8');
 const record = { file, domain: domain(file), sha256: crypto.createHash('sha256').update(text).digest('hex'), lines:text.split('\n').length, imports:[], exports:[], controls:[], icons:[], inlineSvg:[], colors:[...new Set(text.match(/#[\da-fA-F]{3,8}\b/g)||[])].sort(), fontDeclarations:[], apiReferences:[] };
 if(file.endsWith('.css')) {
   record.fontDeclarations = [...text.matchAll(/(?:font-family|--[\w-]*font[\w-]*)\s*:[^;{}]+/g)].map(m=>m[0]);
 } else {
  const src=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const line=n=>src.getLineAndCharacterOfPosition(n.getStart(src)).line+1;
  const attr=(n,name)=>{const a=n.attributes?.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(src)===name); return a?.initializer?.getText(src) ?? (a?'true':null);};
  function visit(n) {
   if(ts.isImportDeclaration(n)) {
    const module=n.moduleSpecifier.text; record.imports.push(module);
    if(/Icons|icons\/|react-icons|lucide/.test(module)) record.icons.push({module,bindings:n.importClause?.getText(src)||'',line:line(n)});
   }
   if((ts.isFunctionDeclaration(n)||ts.isVariableStatement(n)||ts.isClassDeclaration(n))&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) {
    if(ts.isVariableStatement(n)) record.exports.push(...n.declarationList.declarations.map(d=>d.name.getText(src))); else if(n.name) record.exports.push(n.name.text);
   }
   if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
    const tag=n.tagName.getText(src);
    if(/^(button|a|input|select|textarea|summary|dialog|form|Button|Modal|Field|AppHeader|Price|Card|.*Drawer|.*Sheet|.*Modal|.*Card|.*Viewer|.*Screen)$/.test(tag)) record.controls.push({tag,line:line(n),className:attr(n,'className'),type:attr(n,'type'),role:attr(n,'role'),ariaLabel:attr(n,'aria-label'),onClick:attr(n,'onClick'),disabled:attr(n,'disabled')});
    if(tag==='svg') record.inlineSvg.push({line:line(n),viewBox:attr(n,'viewBox')});
   }
   if(ts.isStringLiteral(n)&&/^\/api\//.test(n.text)) record.apiReferences.push(n.text);
   ts.forEachChild(n,visit);
  } visit(src);
 }
 return record;
});
const aliasesText=fs.readFileSync('client/src/components/QatafoIcons.tsx','utf8');
const aliases=[...aliasesText.matchAll(/export const (\w+) = I\.Ayrovi(\w+);/g)].map(([,alias,glyph])=>({alias,glyph}));
const inventory={schemaVersion:1, scope:'Recursive static inventory of all client TypeScript/TSX/CSS; manual review tracked separately', totals:{files:records.length,customerAndSharedFiles:records.filter(r=>r.domain!=='admin').length,controls:records.filter(r=>r.domain!=='admin').reduce((n,r)=>n+r.controls.length,0),iconAliases:aliases.length,uniqueGlyphs:new Set(aliases.map(a=>a.glyph)).size},aliases,files:records};
const output=JSON.stringify(inventory,null,2)+'\n';
const dest='docs/editorial/source-inventory.json';
if(process.argv.includes('--check')) {
 if(!fs.existsSync(dest)||fs.readFileSync(dest,'utf8')!==output){console.error('Design inventory stale: run npm run design:inventory');process.exit(1);}
 console.log('Design inventory up to date');
} else {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,output);console.log(JSON.stringify(inventory.totals));}
