/**
 * SONDE LENS — « le moteur fonctionne-t-il vraiment ? » (02/10/2026).
 *
 * Exécute le CHEMIN RÉEL du moteur Lens sur une image locale, SANS clé IA :
 *   1. `serpApiVisualSearch`        — Google Lens via SerpApi (redimensionnement
 *                                     mémoire, upload temporaire, visual_matches) ;
 *   2. `deduplicateCandidates`      — un produit = une fiche ;
 *   3. `filterWithFallback`         — politique d'affichage (prix > 0, devise,
 *                                     URL publique, neuf uniquement, trust) ;
 *   4. `enrichCandidatesLiveStock`  — lecture de la page marchande derrière les
 *                                     premiers liens : tailles, couleurs, stock.
 *
 * Aucune donnée n'est inventée : ce qui est imprimé est ce que le client verrait.
 *
 * Usage :
 *   SERPAPI_KEY=xxx npm run verify:lens-probe -- chemin/vers/photo.jpg [--json]
 *
 * La clé n'est lue QUE depuis l'environnement — jamais écrite sur disque.
 */
import fs from 'node:fs';
import path from 'node:path';
import { serpApiVisualReady, serpApiVisualSearch } from '../src/ayrovix/services/visualSearch';
import { deduplicateCandidates } from '../src/ayrovix/services/candidateDedup';
import { filterWithFallback } from '../src/ayrovix/services/candidatePolicy';
import { enrichCandidatesLiveStock, filterPurchasable, purchaseBlocker } from '../src/ayrovix/services/lensLiveStock';
import { SmartLinkScraper } from '../src/scraper/scraper';
import type { AyrovixCandidate } from '../src/ayrovix/types';

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function fmtPrice(c: AyrovixCandidate): string {
  if (c.price == null || !c.currency) return 'prix à confirmer';
  const tnd = c.priceTnd != null ? ` (≈ ${(c.priceTnd as number).toFixed(3)} TND)` : '';
  const origin = c.priceOrigin === 'merchant' ? ' · lu sur la page marchande' : ' · extrait SerpApi (page non lue)';
  const barred = c.originalPrice ? ` — barré ${c.originalPrice} ${c.currency}` : '';
  return `${c.price} ${c.currency}${tnd}${barred}${origin}`;
}

function printCard(index: number, c: AyrovixCandidate): void {
  console.log(`\n┌─ #${index + 1} ─ ${c.title}`);
  console.log(`│ Marchand   : ${c.source}  [${c.kind}]  match=${c.match}`);
  console.log(`│ Lien       : ${c.sourceUrl}`);
  console.log(`│ Prix       : ${fmtPrice(c)}  — ${c.priceVerificationStatus || 'n/a'}`);
  console.log(`│ Image      : ${c.image || '(aucune)'}`);
  if (c.images?.length) console.log(`│ Images (+) : ${c.images.length}`);
  console.log(`│ Stock      : ${c.availability || 'unknown'}`);
  console.log(`│ Tailles    : ${c.sizes.length ? c.sizes.join(', ') : '(aucune publiée)'}`);
  console.log(`│ Couleurs   : ${c.colors.length ? c.colors.join(', ') : '(aucune publiée)'}`);
  if (c.offerCount && c.offerCount > 1) console.log(`│ Offres     : ${c.offerCount} sources regroupées`);
  if (c.description) console.log(`│ Description: ${c.description.slice(0, 140)}`);
  console.log('└─');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const imagePath = args.find((a) => !a.startsWith('--'));
  if (!imagePath) fail('Usage : SERPAPI_KEY=xxx npm run verify:lens-probe -- photo.jpg [--json]');
  if (!serpApiVisualReady()) fail('SERPAPI_KEY absent de l’environnement. La sonde n’écrit jamais la clé : exportez-la avant de lancer.');

  // Pré-vol : la clé est-elle valide et le réseau ouvert ? Sans cela, « 0
  // correspondance » serait ambigu (panne réseau ≠ quota épuisé ≠ photo muette).
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const account = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(process.env.SERPAPI_KEY!.trim())}`, { signal: controller.signal });
    clearTimeout(timer);
    const body: any = await account.json().catch(() => ({}));
    if (!account.ok || body?.error) fail(`SerpApi refuse la clé (${account.status}) : ${body?.error || 'réponse inattendue'}`);
    console.log(`Clé SerpApi OK — plan « ${body.plan_name || '?'} », ${body.total_searches_left ?? '?'} recherches restantes ce mois.`);
  } catch (error: any) {
    if (error?.name === 'AbortError' || /fetch failed|ECONN|ENOTFOUND|SSL/i.test(String(error?.message || error))) {
      fail(`Réseau fermé vers serpapi.com (${String(error?.cause?.code || error?.message || error).slice(0, 80)}). Lancez la sonde depuis une machine avec accès Internet (poste local, shell Render).`);
    }
    throw error;
  }

  const absolute = path.resolve(String(imagePath));
  if (!fs.existsSync(absolute)) fail(`Image introuvable : ${absolute}`);
  const image = fs.readFileSync(absolute);
  console.log(`\nAYROVI Lens — sonde moteur\nImage : ${absolute} (${(image.length / 1024).toFixed(0)} Ko)`);

  // 1. Google Lens via SerpApi — exactement l'appel du moteur (`lensEngine`).
  const t0 = Date.now();
  const raw = await serpApiVisualSearch(image, 8);
  const serpMs = Date.now() - t0;
  console.log(`\n[1] SerpApi Google Lens  : ${raw.length} correspondances en ${serpMs} ms`);
  if (!raw.length) {
    console.log('    Aucune correspondance renvoyée. Vérifiez la clé (quota ?), ou essayez une photo plus nette / recadrée sur le produit.');
    process.exit(2);
  }

  // 2 + 3. Dédoublonnage puis politique d'affichage (identiques à la route /analyze-image).
  const deduped = deduplicateCandidates(raw);
  const displayable = filterWithFallback(deduped, 8);
  console.log(`[2] Dédoublonnage        : ${raw.length} → ${deduped.length}`);
  console.log(`[3] Politique d'affichage: ${deduped.length} → ${displayable.length} (prix>0 + devise + URL publique + neuf)`);

  // 4. Stock & tailles vivants — lecture réelle des pages marchandes (budget 4, échéance 2,5 s, cache 6 h).
  const scraper = new SmartLinkScraper();
  const t1 = Date.now();
  // Sans base de données ici : le recalcul TND utilise le taux de secours du scraper (4,00) — indicatif.
  const { candidates, report } = await enrichCandidatesLiveStock(displayable, {
    fetcher: (url) => scraper.scrapeParsedPage(url).then((r) => r.data),
    reprice: (price, currency) => ({ priceTnd: Math.round(price * (SmartLinkScraper.RATES_TO_TND[currency] || 4) * 1000) / 1000 }),
  });
  console.log(`[4] Pages marchandes     : visitées=${report.fetched} cache=${report.cacheHits} enrichies=${report.applied} (budget ${report.budget}, échéance ${report.deadlineMs} ms) en ${Date.now() - t1} ms`);

  // 5. Filtre d'achetabilité — exactement celui de la route : on ne montre pas ce qu'on ne peut pas acheter.
  const gate = filterPurchasable(candidates);
  console.log(`[5] Achetabilité         : ${gate.report.kept} gardée(s), ${gate.report.excluded} écartée(s) ${gate.report.excluded ? JSON.stringify(gate.report.reasons) : ''}`);
  for (const c of candidates) {
    const blocker = purchaseBlocker(c);
    if (blocker) console.log(`    ✗ écartée (${blocker}) : ${c.title.slice(0, 70)} — ${c.sourceUrl}`);
  }

  if (asJson) {
    console.log(JSON.stringify({ serpMs, raw: raw.length, deduped: deduped.length, displayable: displayable.length, liveStock: report, candidates }, null, 2));
    return;
  }

  console.log(`\n=== ${gate.candidates.length} fiche(s) produit — ce que le client verrait ===`);
  gate.candidates.forEach((c, i) => printCard(i, c));

  const withSizes = candidates.filter((c) => c.sizes.length).length;
  const withPrice = candidates.filter((c) => c.price != null).length;
  const withStock = candidates.filter((c) => c.availability && c.availability !== 'unknown').length;
  const merchantPriced = candidates.filter((c) => c.priceOrigin === 'merchant').length;
  console.log(`\nBilan : ${candidates.length} fiches · ${withPrice} avec prix (${merchantPriced} lus sur la page marchande) · ${withSizes} avec tailles · ${withStock} avec stock prouvé`);
  console.log('Une fiche sans tailles/stock signifie que la page marchande n’a pas été lue (budget/échéance) ou ne publie pas ces faits — jamais une invention.\n');
}

main().catch((error) => fail(String(error?.stack || error)));
