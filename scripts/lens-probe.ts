/*
 * Sonde Lens : mesure la chaîne réelle « photo → SerpAPI Lens → lecture des pages marchandes ».
 *
 * Usage (la clé vient UNIQUEMENT de l'environnement, jamais d'un argument ni d'un fichier) :
 *   SERPAPI_KEY=... npx tsx scripts/lens-probe.ts <dossier-de-sortie> <image1.jpg> [image2.jpg ...]
 *
 * Sortie : un rapport JSON (sans aucune clé) + un résumé sur la console.
 * Chaque candidat reçoit un verdict : prix lu, ou échec avec son code (page_non_lue, HTTP, etc.).
 */
import fs from 'node:fs';
import path from 'node:path';
import { serpApiVisualReady, serpApiVisualSearch } from '../src/ayrovix/services/visualSearch';
import { SmartLinkScraper } from '../src/scraper/scraper';

const CONCURRENCY = 3;
const PAGE_TIMEOUT_MS = 25_000;

type Row = {
  image: string;
  sourceUrl: string;
  host: string;
  source: string;
  kind: string;
  verified: boolean;
  price: number | null;
  currency: string | null;
  priceSource: string | null;
  provider: string | null;
  failureCode: string | null;
  error: string | null;
  ms: number;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'invalid';
  }
}

async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const [outDirArg, ...images] = process.argv.slice(2);
  if (!outDirArg || images.length === 0) {
    console.error('Usage: SERPAPI_KEY=... npx tsx scripts/lens-probe.ts <dossier-de-sortie> <image...>');
    process.exit(2);
  }
  if (!serpApiVisualReady()) {
    console.error('SERPAPI_KEY absent de l\'environnement : rien n\'a été exécuté.');
    process.exit(3);
  }

  const scraper = new SmartLinkScraper();
  const rows: Row[] = [];
  const searchFailures: Array<{ image: string; error: string }> = [];

  for (const imagePath of images) {
    const name = path.basename(imagePath);
    let candidates: Awaited<ReturnType<typeof serpApiVisualSearch>> = [];
    try {
      candidates = await serpApiVisualSearch(fs.readFileSync(imagePath), 24);
    } catch (error: any) {
      searchFailures.push({ image: name, error: String(error?.message || error).slice(0, 120) });
      continue;
    }
    const targets = candidates.filter((item) => /^https?:\/\//i.test(item.sourceUrl || ''));
    console.log(`[${name}] ${candidates.length} candidats, ${targets.length} avec page http(s)`);

    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const item = targets[cursor++];
        const started = Date.now();
        const row: Row = {
          image: name, sourceUrl: item.sourceUrl, host: hostOf(item.sourceUrl), source: item.source,
          kind: item.kind, verified: false, price: null, currency: null, priceSource: null,
          provider: null, failureCode: null, error: null, ms: 0,
        };
        try {
          const result: any = await withTimeout(scraper.scrapeParsedPage(item.sourceUrl), PAGE_TIMEOUT_MS);
          row.verified = Boolean(result?.verified);
          row.provider = result?.provider ?? null;
          row.failureCode = result?.failureCode ?? null;
          row.price = typeof result?.data?.price === 'number' ? result.data.price : null;
          row.currency = result?.data?.currency ?? null;
          row.priceSource = result?.data?.priceSource ?? null;
        } catch (error: any) {
          row.error = String(error?.message || error).slice(0, 120);
        }
        row.ms = Date.now() - started;
        rows.push(row);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const byHost = new Map<string, { total: number; verified: number; codes: Record<string, number> }>();
  for (const row of rows) {
    const entry = byHost.get(row.host) ?? { total: 0, verified: 0, codes: {} };
    entry.total += 1;
    if (row.verified) entry.verified += 1;
    const code = row.verified ? 'OK' : (row.failureCode || row.error || 'unknown');
    entry.codes[code] = (entry.codes[code] || 0) + 1;
    byHost.set(row.host, entry);
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    images: images.length,
    pagesRead: rows.length,
    verified: rows.filter((row) => row.verified).length,
    searchFailures,
    byHost: Object.fromEntries([...byHost.entries()].sort((a, b) => b[1].total - a[1].total)),
    rows,
  };
  fs.mkdirSync(outDirArg, { recursive: true });
  const file = path.join(outDirArg, `lens-probe-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));

  console.log(`\nPages lues : ${summary.pagesRead} · prix vérifiés : ${summary.verified}`);
  for (const [host, entry] of Object.entries(summary.byHost)) {
    console.log(`  ${host}: ${entry.verified}/${entry.total} ${JSON.stringify(entry.codes)}`);
  }
  if (searchFailures.length) console.log('Échecs de recherche :', searchFailures);
  console.log(`Rapport : ${file}`);
}

main().catch((error) => {
  console.error('Sonde interrompue :', String(error?.message || error).slice(0, 200));
  process.exit(1);
});
