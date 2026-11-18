/** Executable identity contract: source lint + resource allowlist + manifest invariants.
 * Not a security sandbox for hostile developers; protect this check with required CI review. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import ts from 'typescript';
const generated = new Set(['client/src/design/editorial/tokens.generated.css','client/public/identity.css']);
const tokens = new Set(['--font-primary','--ay-font-stack','--zayrovi-font','--zayrovi-font-body','--zayrovi-font-display']);
const familyValue = value => value === 'inherit' || [...tokens].some(name => value === `var(${name})`);
export function inspectBrandSource(file, text) {
  const errors = [];
  const add = message => errors.push(`${file}: ${message}`);
  const clean = text.replace(/\/\*[\s\S]*?\*\//g,'');
  if (/fonts\.(?:googleapis|gstatic)\.com/.test(clean)) add('remote font service');
  if (/font-(?:mono|serif)\b/.test(clean.replace(/--font-(?:mono|serif)\s*:/g,''))) add('use ay-number, not a second font utility');
  if (/font-\[/.test(clean)) add('arbitrary font utility');
  if (/<font\b[^>]*\bface\s*=/i.test(clean) || /\bnew\s+FontFace\s*\(/.test(clean)) add('unreviewed font loader');
  if (/@import\s+(?:url\()?['"]?(?:https?:|\/\/)/i.test(clean)) add('remote stylesheet import');
  if (/<link\b(?=[^>]*rel\s*=\s*['"]stylesheet['"])(?=[^>]*href\s*=\s*['"](?:https?:|\/\/))/i.test(clean)) add('remote stylesheet loader');
  const declaration = (prop, value, inFace = false) => {
    prop = prop.toLowerCase();
    if (prop.includes('\\')) add('escaped CSS properties cannot bypass identity review');
    value = value.trim();
    if (prop.startsWith('--ay-e-') && !generated.has(file)) add('canonical color/geometry token outside identity generator');
    if (prop === 'font-family') {
      if (inFace && generated.has(file)) return;
      if (!familyValue(value)) add(`unapproved font-family: ${value}`);
    }
    if (prop === 'font' && value !== 'inherit' && ![...tokens].some(t => value.endsWith(`var(${t})`))) add(`unapproved font shorthand: ${value}`);
    if (/^--(?:font-(?:primary|sans|body|display|mono|serif)|ay-font-stack|zayrovi-font(?:-body|-display)?)$/.test(prop)) {
      if (generated.has(file) && prop === '--ay-font-stack') return;
      if (!familyValue(value)) add(`unapproved stack token: ${prop}`);
    }
  };
  if (file.endsWith('.css')) {
    try {
      const tree = postcss.parse(text);
      tree.walkAtRules(rule => {
        if (rule.name.toLowerCase() === 'font-face' && !generated.has(file)) add('@font-face outside generator');
        if (rule.name === 'import' && /(?:https?:|\/\/)/.test(rule.params)) add('remote stylesheet import');
      });
      tree.walkDecls(d => {
        // Explicit user-approved Clean exception, not a second global theme or CMS font channel.
        const cleanFamilies = new Map([
          ["#root [data-clean-screen]", "Arial, 'Noto Sans Arabic', sans-serif"],
        ]);
        if (file === 'client/src/components/assistant/clean.css' && d.prop === 'font-family' && cleanFamilies.get(d.parent?.selector) === d.value) return;
        declaration(d.prop,d.value,d.parent?.name === 'font-face');
      });
    } catch(error) { add(`CSS cannot be audited: ${error.message}`); }
  } else {
    // CSS embedded in HTML/templates. Only server-owned interpolation is allowed.
    for (const m of clean.matchAll(/font-family\s*:\s*((?:\$\{[^}]+\}|[^;}<>])+)/g)) {
      const value=m[1].trim(), prop='font-family';
      if (value === '${FONT_STACK}' && ['src/customer/accountMail.ts','src/services/invoice.ts','src/services/brandDocuments.ts'].includes(file)) continue;
      if (file === 'src/services/brandDocuments.ts' && value === "'${f.family}'") continue;
      declaration(prop,value);
    }
  }
  if (file.endsWith('.html')) for (const m of clean.matchAll(/\bfont\s*:\s*([^;}<>]+)/g)) declaration('font',m[1]);
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const visit=node=>{
      if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'fontFamily') add('fontFamily shorthand must use an approved explicit token');
      if (ts.isPropertyAssignment(node) && ['fontFamily','font'].includes(node.name.getText(source).replace(/['"]/g,''))) {
        const value=node.initializer.getText(source);
        const literal=ts.isStringLiteral(node.initializer)?node.initializer.text:null;
        const approvedPreview=file==='client/src/admin/InterfaceStudio.tsx' && /^(?:config\.typography\.(?:body|display)|preset\.(?:body|display))$/.test(value);
        const pdfFont=file==='src/services/simplePdf.ts' && value==='run.font';
        if (!approvedPreview && !pdfFont && value!=='FONT_STACK' && !(literal && familyValue(literal))) add(`unapproved style expression: ${value}`);
      }
      if (ts.isJsxAttribute(node) && node.name.getText(source)==='fontFamily') add('SVG/JSX fontFamily must inherit');
      ts.forEachChild(node,visit);
    }; visit(source);
    if (/\.fontFamily\s*=|setProperty\(\s*['"]font(?:-family)?['"]/.test(clean)) add('imperative font override');
  }
  return errors;
}
export function auditBrand(root=process.cwd()) {
  const errors=[];
  const identity=JSON.parse(fs.readFileSync(path.join(root,'client/src/design/editorial/identity.json'),'utf8'));
  if (identity.typography.stack !== "'Zayrovi Extracted Sans', 'Noto Sans Arabic', sans-serif") errors.push('official stack changed');
  if (identity.fonts.length!==2 || identity.fonts.map(f=>f.family).join('|')!=='Zayrovi Extracted Sans|Noto Sans Arabic') errors.push('official family allowlist changed');
  // Palette officielle v5.0.0 (« Za. », décision du propriétaire 18/11/2026, maquette v2 approuvée) :
  // noir #0A0A0A · blanc #FFFFFF · gris clair #F2F2F2 · jaune #F2AE00.
  // Plus AUCUN bleu : toute action, lien, focus, interrupteur ou case est ENCRE (blanc en mode sombre).
  // Le jaune est réservé au logo et aux actions d'ACHAT (barre d'achat, « + » produit, Commander),
  // libellé noir (blanc sur jaune ≈ 2:1), et reste ≤ 4 % d'un écran.
  const official={canvas:'#FFFFFF',ink:'#0A0A0A',surface:'#FFFFFF',shimmer:'#F2F2F2',action:'#0A0A0A',accent:'#0A0A0A',onAction:'#FFFFFF',accentSoft:'#F2F2F2',onAccentSoft:'#0A0A0A',secondaryAction:'#0A0A0A',onSecondaryAction:'#FFFFFF',focus:'#0A0A0A',brandYellow:'#F2AE00',buy:'#F2AE00',onBuy:'#0A0A0A'};
  for(const [role,value] of Object.entries(official)) if(identity.colors[role]!==value) errors.push(`official palette changed: ${role}`);
  const officialDark={canvas:'#0A0A0A',ink:'#FFFFFF',action:'#FFFFFF',accent:'#FFFFFF',onAction:'#0A0A0A',focus:'#FFFFFF',brandYellow:'#F2AE00',buy:'#F2AE00',onBuy:'#0A0A0A'};
  for(const [role,value] of Object.entries(officialDark)) if(identity.darkColors[role]!==value) errors.push(`official palette changed: dark ${role}`);
  const BLUE=/^#(?:0A63F5|0A53CB|0B57CF|DCE8FE|78A9FA)$/i;
  for(const mode of ['colors','darkColors']) for(const [role,value] of Object.entries(identity[mode])) if(BLUE.test(String(value))) errors.push(`blue is retired: ${mode}.${role}`);
  const share=identity.accentShare||{};
  if(share.scope!=='screen'||share.yellow!==0.04||share.total!==0.04) errors.push('yellow share changed (≤ 4 % of a screen, buy actions only)');
  const walk=relative=>{
    for (const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
      const file=path.posix.join(relative,entry.name);
      if(entry.isDirectory()) walk(file);
      else if (/\.(?:css|html|[cm]?[jt]sx?)$/.test(file)) errors.push(...inspectBrandSource(file,fs.readFileSync(path.join(root,file),'utf8')));
      else if (/\.(?:woff2?|ttf|otf)$/i.test(file) && file.startsWith('client/public/') && !identity.fonts.some(f=>'client/public'+f.file===file)) errors.push(`${file}: undeclared font asset`);
    }
  };
  for(const dir of ['client/src','client/public','src','shared']) walk(dir);
  errors.push(...inspectBrandSource('client/index.html',fs.readFileSync(path.join(root,'client/index.html'),'utf8')));
  for(const f of identity.fonts) {
    const bytes=fs.readFileSync(path.join(root,'client/public'+f.file));
    if(createHash('sha256').update(bytes).digest('hex')!==f.sha256) errors.push(`${f.file}: font hash mismatch`);
    if(!fs.readFileSync(path.join(root,'client/public'+f.license),'utf8').includes('SIL OPEN FONT LICENSE')) errors.push(`${f.file}: missing OFL`);
  }
  const pdfFonts=JSON.parse(fs.readFileSync(path.join(root,'assets/fonts/manifest.json'),'utf8'));
  for(const f of pdfFonts) if(createHash('sha256').update(fs.readFileSync(path.join(root,f.file))).digest('hex')!==f.sha256) errors.push(`${f.file}: PDF font hash mismatch`);
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const errors=auditBrand();
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('ZAYROVI A: source, stack, official palette, local assets and font hashes verified.');
}
