#!/usr/bin/env node
/**
 * AYWEBs — SONDE DE LATENCE « Add to Cart » (05/10/2026).
 *
 * À quoi ça sert : vérifier sur un serveur VIVANT que l'attente avant qu'un
 * produit chiffré apparaisse a bien disparu. La sonde fait le trajet réel du
 * client — `POST /api/v1/aywebs/product/resolve` — deux fois de suite sur la
 * MÊME url, puis lit les compteurs du cache dans `/api/v1/aywebs/health`.
 *
 * Ce qu'on doit lire :
 *   1re passe : from_cache=false, cache_age_ms=null  → la fiche est réellement lue ;
 *   2e  passe : from_cache=true,  cache_age_ms=<âges> → aucune relecture marchande,
 *               et le prix reste celui du moteur AYROVI (jamais servi par le cache).
 *
 * Utilisation :
 *   node scripts/aywebs-latency-probe.mjs \
 *     --base https://ayrovi-beta1.onrender.com \
 *     --url "https://www.amazon.com/dp/B0GYM3V9H5"
 *
 * Options :
 *   --base   origine du site (défaut : variable AYROVI_BASE_URL, sinon localhost:3000)
 *   --url    lien produit à mesurer (obligatoire, sauf si --self-test)
 *   --runs   nombre de passes (défaut 2)
 *   --cold   force une LECTURE FRAÎCHE sur la première passe (`refresh:true`) :
 *            mesure le coût réel de la première visite, sans dépendre de l'état
 *            de la mémoire de lecture au moment de la sonde
 *   --store  identifiant boutique optionnel (ex. amazon)
 *   --session identifiant de session AYWEBs (défaut : sonde aléatoire)
 *
 * Sortie : un tableau lisible + code de sortie 1 si la 2e passe n'est PAS
 * servie par la mémoire de lecture (c'est le symptôme que cette sonde traque).
 */

const args = process.argv.slice(2);

function option(name, fallback = '') {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
}

const base = (option('base', process.env.AYROVI_BASE_URL || 'http://localhost:3000')).replace(/\/+$/, '');
const productUrl = option('url', '');
const runs = Math.max(1, Math.min(5, Number(option('runs', '2')) || 2));
const store = option('store', '');
const cold = args.includes('--cold');
const session = option('session', `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

if (!productUrl) {
  console.error('Usage : node scripts/aywebs-latency-probe.mjs --base <origine> --url <lien produit>');
  console.error('Exemple : node scripts/aywebs-latency-probe.mjs --base https://ayrovi-beta1.onrender.com --url "https://www.amazon.com/dp/B0GYM3V9H5"');
  process.exit(2);
}

const headers = {
  'content-type': 'application/json',
  'x-session-id': session,
};

function ms(value) {
  return `${String(Math.round(value)).padStart(6)} ms`;
}

async function timed(label, run) {
  const startedAt = Date.now();
  const result = await run();
  return { label, durationMs: Date.now() - startedAt, ...result };
}

async function resolveOnce(index) {
  const body = {
    url: productUrl,
    ...(store ? { store } : {}),
    // Première passe forcée : la mesure « à froid » ne dépend pas de ce que la
    // mémoire contient déjà (utile juste après un déploiement, ou en CI).
    ...(cold && index === 1 ? { refresh: true } : {}),
  };
  const response = await fetch(`${base}/api/v1/aywebs/product/resolve`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  const data = payload?.data || {};
  return {
    httpStatus: response.status,
    success: Boolean(payload?.success),
    code: payload?.code || '',
    fromCache: payload?.from_cache === true,
    cacheAgeMs: typeof payload?.cache_age_ms === 'number' ? payload.cache_age_ms : null,
    price: Number(data.price || 0),
    currency: String(data.currency || ''),
    pricingTnd: Number(data?.ayrovi_pricing?.total_tnd || 0),
    productId: String(data.product_id || ''),
    missing: Array.isArray(payload?.missing) ? payload.missing : [],
    title: String(data.title || '').slice(0, 60),
    index,
  };
}

function printRow(result) {
  const cache = result.fromCache ? `CACHE (${result.cacheAgeMs ?? '?'} ms)` : 'LECTURE MARCHANDE';
  console.log(
    `  ${String(result.index).padStart(2)}. ${ms(result.durationMs)}  http=${result.httpStatus}` +
    `  ${cache.padEnd(20)}  prix=${result.price} ${result.currency}` +
    (result.pricingTnd > 0 ? `  ≈ ${result.pricingTnd.toFixed(2)} TND` : ''),
  );
  if (result.missing.length) console.log(`      champs manquants : ${result.missing.join(', ')}`);
  if (!result.success && result.code) console.log(`      refus métier : ${result.code}`);
}

async function health() {
  try {
    const response = await fetch(`${base}/api/v1/aywebs/health`);
    const payload = await response.json();
    return payload?.data?.resolve_cache || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nAYWEBs — sonde de latence « Add to Cart »`);
  console.log(`  serveur : ${base}`);
  console.log(`  produit : ${productUrl}`);
  if (cold) console.log('  mode    : première passe forcée à froid (refresh:true)');
  console.log(`  session : ${session}\n`);

  const before = await health();
  const results = [];
  for (let index = 1; index <= runs; index += 1) {
    try {
      results.push(await timed('resolve', () => resolveOnce(index)));
    } catch (error) {
      console.error(`  ${index}. échec réseau : ${error instanceof Error ? error.message : error}`);
      process.exit(2);
    }
  }

  console.log('Résolutions successives :');
  results.forEach(printRow);

  const after = await health();
  if (after) {
    console.log('\nCompteurs du cache de lecture (/api/v1/aywebs/health → resolve_cache) :');
    console.log(
      `  enabled=${after.enabled} ttl=${after.ttl_ms} ms  entrées=${after.entries}/${after.max_entries}` +
      `  hits=${after.hits} misses=${after.misses} writes=${after.writes}`,
    );
    if (before) {
      console.log(
        `  delta : hits +${after.hits - before.hits}  misses +${after.misses - before.misses}` +
        `  writes +${after.writes - before.writes}  entrées +${after.entries - before.entries}`,
      );
    }
  } else {
    console.log('\n(health indisponible : compteurs du cache non lus)');
  }

  const first = results[0];
  const second = results[1];
  if (!first?.success) {
    console.log(`\nPremière passe refusée par le serveur (${first?.code || 'inconnu'}) : rien à conclure sur le cache.`);
    process.exit(1);
  }
  if (first.price <= 0) {
    console.log('\nLa fiche n’a pas de prix : elle n’est JAMAIS mémorisée (règle voulue) — relancez sur un produit lisible.');
    process.exit(1);
  }
  if (!second) {
    console.log('\nUne seule passe demandée : relancez avec --runs 2 pour vérifier la mémoire de lecture.');
    process.exit(0);
  }
  if (second.fromCache && second.durationMs < first.durationMs) {
    console.log(`\n✅ Mémoire de lecture active : ${first.durationMs} ms → ${second.durationMs} ms (aucune relecture marchande).`);
    process.exit(0);
  }
  console.log(
    `\n❌ Deuxième passe NON servie par la mémoire de lecture (${second.durationMs} ms, from_cache=${second.fromCache}).\n` +
    '   Vérifiez que le serveur déployé contient bien le module resolveCache et que AYWEBS_RESOLVE_CACHE_TTL_MS > 0.',
  );
  process.exit(1);
}

void main();
