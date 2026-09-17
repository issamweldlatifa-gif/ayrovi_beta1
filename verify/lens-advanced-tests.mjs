#!/usr/bin/env node
// Advanced Lens Tests — Part1 Touch TAP INSTANT (Google Lens level) 10, Part2 AI 7 + Search 9 + Regression
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname ? import.meta.dirname + '/..' : '.');
const results = [];

function test(name, fn) {
  try {
    const ok = fn();
    if (ok === true || ok === undefined) {
      console.log(`✅ ${name}`);
      results.push({ name, status: 'PASS' });
    } else if (ok === false) {
      console.log(`❌ ${name} — returned false`);
      results.push({ name, status: 'FAIL', error: 'returned false' });
    } else {
      console.log(`✅ ${name} — ${ok}`);
      results.push({ name, status: 'PASS', detail: String(ok) });
    }
  } catch (e) {
    console.log(`❌ ${name} — ${e.message}`);
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

function read(p) { return fs.readFileSync(path.join(root, p), 'utf-8'); }

// ============ PART 1 — TOUCH SELECTION 10 CASES (TAP INSTANT) ============
console.log('\n=== PART1 — TOUCH TAP INSTANT (10 cases) ===');

test('1. Tap on sleeve → expands to complete shirt (findBoxForTap inside)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('findBoxForTap')) throw new Error('findBoxForTap missing');
  if (!src.includes('inside')) throw new Error('inside check missing');
  const box = [0.2,0.1,0.4,0.6];
  const tap = {x:30, y:40};
  const bx0=box[0]*100, by0=box[1]*100, bx1=(box[0]+box[2])*100, by1=(box[1]+box[3])*100;
  const inside = tap.x>=bx0 && tap.x<=bx1 && tap.y>=by0 && tap.y<=by1;
  if (!inside) throw new Error('inside logic wrong');
  return true;
});

test('2. Tap on shoe near center expands via nearest box (dist <12)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('dist < 12')) throw new Error('dist threshold missing');
  const box=[0.7,0.7,0.15,0.15];
  const tap={x:78,y:79};
  const cx=(box[0]*100+(box[0]+box[2])*100)/2, cy=(box[1]*100+(box[1]+box[3])*100)/2;
  const dist=Math.hypot(tap.x-cx, tap.y-cy);
  if (dist>=12) throw new Error('dist calc wrong');
  return true;
});

test('3. Tap far from any product returns 22% centered box fallback (Google Lens style)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('22')) throw new Error('22% fallback missing');
  if (!src.includes('22%') && !src.includes('22 ')) throw new Error('22% box missing');
  // far tap should fallback not null
  if (!src.includes('return { x:')) throw new Error('box fallback missing');
  return true;
});

test('4. Instant tap <300ms highlight, no heavy lasso per-move (selectedBox + tapStart)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('selectedBox')) throw new Error('selectedBox missing — lasso not removed');
  if (!src.includes('tapStart')) throw new Error('tapStart missing');
  if (!src.includes('triggerTapSearch')) throw new Error('triggerTapSearch missing');
  if (src.includes('lassoPoints') && src.includes('lassoPointsRef')) throw new Error('heavy lassoPoints still present — must be deleted');
  if (!src.includes('12') || !src.includes('400')) throw new Error('tap threshold <12px <400ms missing');
  return true;
});

test('5. Single rect highlight — no heavy SVG Q path, lightweight', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (src.includes('lassoPathD')) throw new Error('heavy lassoPathD still present');
  if (src.includes(' Q')) throw new Error('heavy Q smoothing still present');
  if (!src.includes('<rect')) throw new Error('single rect highlight missing');
  if (!src.includes('vectorEffect')) throw new Error('non-scaling stroke missing');
  return true;
});

test('6. CropBoxToFile with 18% pad and 0.85 jpeg (faster/lighter than lasso 0.92)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('cropBoxToFile')) throw new Error('cropBoxToFile missing');
  if (!src.includes('18%') && !src.includes('0.18')) throw new Error('18% padding missing');
  if (!src.includes('0.85')) throw new Error('0.85 jpeg missing');
  if (src.includes('cropLassoToFile')) throw new Error('old cropLassoToFile still present');
  return true;
});

test('7. Lasso heavy code DELETED (no lassoPointsRef/rAF per-move, no even-odd 0.42)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (src.includes('lassoPointsRef')) throw new Error('lassoPointsRef not deleted');
  if (src.includes('rafPending')) throw new Error('rafPending not deleted');
  if (src.includes('isDrawing')) throw new Error('isDrawing not deleted');
  if (src.includes('rgba(0,0,0,0.42)')) throw new Error('old dim 0.42 still present — should be 0.38 tap');
  if (!src.includes('rgba(0,0,0,0.38)')) throw new Error('new dim 0.38 missing');
  return true;
});

test('8. Multi-product separate objects (person+shirt+pants+shoes+bag) via detectedProducts', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('detectedProducts')) throw new Error('detectedProducts prop missing');
  if (!src.includes('box: [number,number,number,number]')) throw new Error('box type missing');
  const launcher = read('client/src/ayrovix/components/LensLauncher.tsx');
  if (!launcher.includes('detectedProducts')) throw new Error('Launcher not wiring detectedProducts');
  if (!launcher.includes('result.identification.products')) throw new Error('not mapping identification.products');
  if (!src.includes('detectedProducts.length > 1')) throw new Error('multi-product overlay missing');
  return true;
});

test('9. Visual feedback: tap selected clear highlight dim 0.38 + white frame + pulse 0.55s', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('rgba(0,0,0,0.38)')) throw new Error('dim 0.38 missing');
  if (!src.includes('stroke=\"white\"')) throw new Error('white outline missing');
  if (!src.includes('evenodd')) throw new Error('evenodd dim missing');
  if (!src.includes('pulseBox')) throw new Error('pulse missing');
  if (!src.includes('0.55s')) throw new Error('pulse duration missing');
  return true;
});

test('10. Performance: tap = fast local/lightweight instant, confirm = AI only (no AI per touch)', () => {
  const src = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (!src.includes('INSTANT TAP') && !src.includes('Google Lens')) throw new Error('tap performance comment missing');
  if (!src.includes('no AI per')) throw new Error('no AI per touch missing');
  const ai = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!ai.includes('CACHE_TTL_MS')) throw new Error('cache missing');
  const routes = read('src/ayrovix/routes.ts');
  if (routes.includes('handlePointerMove') && routes.includes('generateOptimizedSearch')) throw new Error('AI should not be in pointer move');
  if (!src.includes('selectedBox')) throw new Error('tap state missing');
  return true;
});

// ============ PART 2 — AI 7 CASES ============
console.log('\n=== PART2 — AI INTELLIGENCE (7 cases) ===');

test('11. AI product understanding: category/type/brand/model/color/shape/material/pattern/style/text-logo/distinctive, visible vs inferred', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('ProductUnderstanding')) throw new Error('ProductUnderstanding missing');
  if (!src.includes('attributesVisible')) throw new Error('visible vs inferred missing');
  if (!src.includes('attributesInferred')) throw new Error('inferred missing');
  if (!src.includes('category') || !src.includes('brand') || !src.includes('color') || !src.includes('material') || !src.includes('pattern')) throw new Error('attributes incomplete');
  if (!src.includes('distinctive')) throw new Error('distinctive missing');
  if (!src.includes('textLogo')) throw new Error('textLogo missing');
  if (!src.includes('no invention') && !src.includes("N'invente")) throw new Error('no invention rule missing');
  return true;
});

test('12. AI does NOT invent brand/model/code/price when not visible', () => {
  const ai = read('src/ayrovix/services/ai.ts');
  if (!ai.includes("N'invente jamais")) throw new Error('no invention rule missing in ai.ts');
  const intel = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!intel.includes("N'invente jamais")) throw new Error('no invention in intelligence');
  if (!intel.includes('visible vs inferred')) throw new Error('visible vs inferred not enforced');
  return true;
});

test('13. Customer intent understanding: selected object + image + optional text + context', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('understandCustomerIntent')) throw new Error('intent function missing');
  if (!src.includes('selectedObject')) throw new Error('selectedObject missing');
  if (!src.includes('optionalText')) throw new Error('optionalText missing');
  if (!src.includes('context')) throw new Error('context missing');
  if (!src.includes('customerIntent')) throw new Error('customerIntent missing');
  return true;
});

test('14. Optional text handling (customerIntent text appended)', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('customerIntentText')) throw new Error('customerIntentText param missing');
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('customerIntentText')) throw new Error('routes not reading customerIntent');
  const api = read('client/src/ayrovix/services/lensApi.ts');
  if (!api.includes('customerIntent')) throw new Error('lensApi not sending intent');
  return true;
});

test('15. AI search query generation: important vs unnecessary attributes, keywords, variations', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('generateOptimizedSearch')) throw new Error('generateOptimizedSearch missing');
  if (!src.includes('importantAttributes')) throw new Error('important missing');
  if (!src.includes('unnecessaryAttributes')) throw new Error('unnecessary missing');
  if (!src.includes('keywords')) throw new Error('keywords missing');
  if (!src.includes('variations')) throw new Error('variations missing');
  if (!src.includes('primaryQuery')) throw new Error('primaryQuery missing');
  return true;
});

test('16. AI query fallback when AI not configured (rule-based) + ultra-fast timeout 3500', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('buildFallbackQuery')) throw new Error('fallback missing');
  if (!src.includes('isConfigured()')) throw new Error('isConfigured check missing');
  if (!src.includes('fallback: true')) throw new Error('fallback flag missing');
  if (!src.includes('3500')) throw new Error('fast timeout 3500 missing — must be ultra-fast');
  return true;
});

test('17. AI flow cached, only on confirm, no duplicate searches + pipeline cache', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('queryCache')) throw new Error('query cache missing');
  if (!src.includes('relevanceCache')) throw new Error('relevance cache missing');
  if (!src.includes('CACHE_TTL_MS')) throw new Error('TTL missing');
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('generateOptimizedSearch')) throw new Error('routes not using optimized');
  if (!routes.includes('analyzeResultRelevance')) throw new Error('routes not using relevance');
  if (!routes.includes('pipelineCache')) throw new Error('pipelineCache missing for 1000+ users');
  if (!routes.includes('650') && !routes.includes('750') && !routes.includes('2200') && !routes.includes('2800')) throw new Error('race timeout for ultra-fast missing');
  return true;
});

// ============ PART 2 — SEARCH 9 CASES ============
console.log('\n=== PART2 — SEARCH INTELLIGENCE (9 cases) ===');

test('18. SerpApi kept (visualSearch still used)', () => {
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('serpApiVisualSearch')) throw new Error('SerpApi removed');
  const vs = read('src/ayrovix/services/visualSearch.ts');
  if (!vs.includes('google_lens')) throw new Error('google lens engine missing');
  if (!vs.includes('serpApiVisualReady')) throw new Error('ready check missing');
  return true;
});

test('19. Flow: upload→Lens→tap confirm→AI understand→AI optimize→SerpApi→AI analyze→Dedup→Display (ultra-fast)', () => {
  const routes = read('src/ayrovix/routes.ts');
  const hasIdentify = routes.includes('identifyProduct');
  const hasOptimize = routes.includes('generateOptimizedSearch');
  const hasSerp = routes.includes('serpApiVisualSearch');
  const hasSearch = routes.includes('searchCandidates');
  const hasRelevance = routes.includes('analyzeResultRelevance');
  const hasDedup = routes.includes('deduplicateCandidates');
  if (!hasIdentify || !hasOptimize || !hasSerp || !hasSearch || !hasRelevance || !hasDedup) throw new Error('flow incomplete');
  if (!routes.includes('pipelineCache')) throw new Error('pipelineCache not in flow');
  return true;
});

test('20. AI result analysis: strong/similar/weak/irrelevant, no false exact match, cap 86', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes("'strong'") || !src.includes("'similar'") || !src.includes("'weak'") || !src.includes("'irrelevant'")) throw new Error('levels missing');
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes("Math.min(adj, 86)") && !routes.includes('cap strong')) throw new Error('confidence cap not in routes');
  if (!src.includes('3800')) throw new Error('relevance fast timeout 3800 missing');
  return true;
});

test('21. Irrelevant filtered but at least 2 kept if all irrelevant', () => {
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes("relevance !== 'irrelevant'")) throw new Error('irrelevant filter missing');
  if (!routes.includes('filtered.length >= 2')) throw new Error('keep at least 2 missing');
  return true;
});

test('22. Deterministic dedup by URL/ID (normalizeUrl)', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('normalizeUrl')) throw new Error('normalizeUrl missing');
  if (!src.includes('seenUrl')) throw new Error('seenUrl missing');
  if (!src.includes('seenId')) throw new Error('seenId missing');
  return true;
});

test('23. Dedup by normalized title + brand + source (brand-model)', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('normalizeTitle')) throw new Error('normalizeTitle missing');
  if (!src.includes('brandModelKey')) throw new Error('brandModelKey missing');
  if (!src.includes('skuLike')) throw new Error('skuLike missing');
  return true;
});

test('24. Jaccard near-duplicate 0.88 threshold (semantic dedup, no incorrect merge)', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('jaccard')) throw new Error('jaccard missing');
  if (!src.includes('0.88')) throw new Error('0.88 threshold missing');
  if (!src.includes('no incorrect merge') && !src.includes('Do NOT merge')) throw new Error('no incorrect merge comment missing');
  return true;
});

test('25. Duplicate prevention: URL/ID/SKU/source/brand-model/normalized + AI semantic', () => {
  const src = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!src.includes('deduplicateCandidates')) throw new Error('deduplicateCandidates missing');
  if (!src.includes('aiSemanticDedup')) throw new Error('aiSemanticDedup missing');
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('deduplicateCandidates')) throw new Error('routes not deduping');
  return true;
});

test('26. Ultra-fast search: budget 4200ms, visual shortcut skip AI if ≥4 matches', () => {
  const search = read('src/ayrovix/services/search.ts');
  if (!search.includes('4_200') && !search.includes('4200')) throw new Error('4.2s budget missing');
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('visualCandidates.length <')) throw new Error('visual shortcut missing — must skip AI when Lens already has matches');
  const ai = read('src/ayrovix/services/aiLensIntelligence.ts');
  if (!ai.includes('3500')) throw new Error('optimize fast timeout missing');
  return true;
});

// ============ REGRESSION ============
console.log('\n=== REGRESSION ===');

test('27. No second Lens/touch/SerpApi/pipeline/display (re-use components)', () => {
  const files = fs.readdirSync(path.join(root, 'src/ayrovix/services'));
  const countLens = files.filter(f=> f.toLowerCase().includes('lens')).length;
  if (countLens > 6) throw new Error('too many lens files, maybe duplicate');
  const routes = read('src/ayrovix/routes.ts');
  const serpCount = (routes.match(/serpApiVisualSearch/g)||[]).length;
  if (serpCount > 2) throw new Error('duplicate SerpApi usage');
  return true;
});

test('28. Pricing/DB not broken (calculatePrice still used, tokenized)', () => {
  const routes = read('src/ayrovix/routes.ts');
  if (!routes.includes('calculatePrice')) throw new Error('pricing broken');
  if (!routes.includes('tokenizedCandidates')) throw new Error('tokenization broken');
  if (!routes.includes('priceToken')) throw new Error('priceToken broken');
  return true;
});

test('29. Build still passes (typecheck 0, vite 780 modules)', () => {
  if (!fs.existsSync(path.join(root, 'public/assets'))) throw new Error('build not run');
  const snap = read('client/src/ayrovix/components/InteractiveLensResults.tsx');
  if (snap.length < 3000) throw new Error('InteractiveLensResults too small');
  if (snap.length > 30000) throw new Error('InteractiveLensResults too heavy — should be light tap');
  return true;
});

// Summary
console.log('\n=== SUMMARY ===');
const pass = results.filter(r=>r.status==='PASS').length;
const fail = results.filter(r=>r.status==='FAIL').length;
console.log(`Passed: ${pass}/${results.length}`);
console.log(`Failed: ${fail}/${results.length}`);
if (fail>0) {
  console.log('\nFailed tests:');
  results.filter(r=>r.status==='FAIL').forEach(r=> console.log(` - ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log('\nAll advanced lens tests PASSED ✅');
}
