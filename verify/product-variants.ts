/*
 * VÉRIFICATION DU MOTEUR DE VARIANTES & DISPONIBILITÉ (phase 3, 25/09/2026).
 *
 * Rejoue le contrat d'acceptation du prototype, mais à travers le CODE DE
 * PRODUCTION (src/ayrovix/services/productVariants.ts + variantAvailability.ts)
 * sur 7 réponses SerpApi réelles couvrant les quatre formes de variantes
 * (`variations`, `variants`, `sizes`, `product_variations`), le piège du groupe
 * mal nommé, le produit sans variante et les ruptures écrites en clair.
 *
 *   npm run verify:product-variants
 *
 * Ce que la vérification prouve, fiche par fiche :
 *   1. l'attribut est nommé d'après la NATURE de ses valeurs, pas d'après le nom
 *      du marchand (« Size » = 50 ml → Volume) ;
 *   2. un attribut incompatible avec la catégorie est écarté AVEC sa raison ;
 *   3. chaque variante garde son chemin JSON d'origine — rien n'est inventé ;
 *   4. la disponibilité a trois états et « inconnu » n'est jamais promu ;
 *   5. la porte de commande refuse tout ce qui n'est pas confirmé disponible.
 *
 * Code de sortie 1 si une seule garantie n'est pas tenue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildProductCard, decideOrder } from '../src/ayrovix/services/productVariants';

// Le script est empaqueté dans .cache/ : on repart de la racine du dépôt.
const FIXTURES = process.env.AYROVI_VARIANT_FIXTURES || path.join(process.cwd(), 'verify', 'fixtures', 'product-variants');

/** Attente par fiche : ce que le moteur DOIT comprendre, et rien de plus. */
const EXPECTED: Record<string, {
  category: string;
  attribute: string | null;
  states?: Record<string, 'available' | 'unavailable' | 'unknown'>;
  rejected?: string[];
}> = {
  '01_sneaker': { category: 'footwear', attribute: 'Pointure', states: { '39': 'unknown', '40': 'unknown', '41': 'unknown', '42': 'unknown' } },
  '02_pants': { category: 'apparel_bottom', attribute: 'Taille', states: { S: 'available', M: 'available', L: 'unavailable', XL: 'available' } },
  '03_perfume': { category: 'fragrance', attribute: 'Volume', states: { '30 ml': 'unavailable', '60 ml': 'available', '100 ml': 'available', '200 ml': 'unknown' } },
  '04_phone': { category: 'phone', attribute: 'Stockage', states: { '128 GB': 'available', '256 GB': 'available', '512 GB': 'unknown' } },
  '05_no_variants': { category: 'unknown', attribute: null },
  '06_trap_perfume_shoe_sizes': { category: 'fragrance', attribute: 'Volume', rejected: ['Size'] },
  '07_sneaker_out_of_stock_texts': { category: 'footwear', attribute: 'Pointure' },
};

let failures = 0;
const check = (name: string, condition: boolean, detail: string): void => {
  if (!condition) { failures += 1; console.log(`   ✗ ${name} — ${detail}`); }
  else console.log(`   ✓ ${name}`);
};

for (const file of fs.readdirSync(FIXTURES).filter((entry) => entry.endsWith('.json')).sort()) {
  const key = file.replace(/\.json$/, '');
  const payload = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
  const expected = EXPECTED[key];
  const { card } = buildProductCard(payload);
  const primary = card.attributes.find((attribute) => attribute.role === 'primary') || null;

  console.log(`\n▸ ${key} — ${card.title}`);
  console.log(`   catégorie : ${card.category} (${Math.round(card.categoryConfidence * 100)} %) · attribut : ${primary ? `${primary.label} [${primary.kind}]` : '—'}`);
  if (primary) {
    for (const variant of primary.variants) {
      console.log(`     · ${variant.value.padEnd(8)} ${variant.availability.padEnd(12)} ${variant.availabilityReason}  ← ${variant.sourcePath}`);
    }
  }
  for (const rejected of card.rejected) console.log(`     ⨯ groupe « ${rejected.sourceLabel} » écarté : ${rejected.reason}`);

  if (!expected) { check(key, false, 'fiche inconnue du contrat'); continue; }
  check('catégorie', card.category === expected.category, `attendu ${expected.category}, obtenu ${card.category}`);
  check('attribut', (primary?.label ?? null) === expected.attribute, `attendu ${expected.attribute}, obtenu ${primary?.label ?? null}`);
  if (expected.states) {
    const actual = Object.fromEntries((primary?.variants || []).map((variant) => [variant.value, variant.availability]));
    check('états de stock', JSON.stringify(actual) === JSON.stringify(expected.states), `attendu ${JSON.stringify(expected.states)}, obtenu ${JSON.stringify(actual)}`);
  }
  for (const label of expected.rejected || []) {
    check(`groupe « ${label} » écarté`, card.rejected.some((group) => group.sourceLabel === label), 'il a été accepté');
  }
  // Traçabilité : aucune variante sans origine JSON.
  check('aucune variante inventée', (primary?.variants || []).every((variant) => Boolean(variant.sourcePath)), 'un chemin source manque');
  // Porte de commande : « inconnu » et « indisponible » sont refusés.
  for (const variant of primary?.variants || []) {
    const decision = decideOrder(card, { [primary!.label]: variant.value });
    const shouldPass = variant.availability === 'available';
    if (decision.allowed !== shouldPass && !(!shouldPass && decision.allowed === false)) {
      check(`commande « ${variant.value} »`, false, `attendu ${shouldPass}, obtenu ${decision.allowed} (${decision.code})`);
    } else if (!shouldPass && decision.allowed) {
      check(`commande « ${variant.value} »`, false, 'une variante non confirmée a été acceptée');
    }
  }
}

console.log(`\n${failures === 0 ? '✓ CONFORME' : `✗ ${failures} GARANTIE(S) NON TENUE(S)`} — ${Object.keys(EXPECTED).length} fiches vérifiées via le code de production.`);
process.exit(failures === 0 ? 0 : 1);
