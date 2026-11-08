/** Synthetic, local SQL comparison; no production DB, HTTP or credentials. */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { publicProductQuery, readPublicProducts } from '../src/catalogue/publicProducts';
Object.assign(process.env, { NODE_ENV: 'test', ADMIN_EMAIL: 'benchmark@localhost', ADMIN_PASSWORD: 'LocalProductBenchmark123!' });
async function main() {
  const { QatafoDatabase } = await import('../src/db/database');
  const db = new QatafoDatabase(':memory:');
  try {
    const results = [];
    let previous = 0;
    const percentile = (times: number[], fraction: number) => +[...times].sort((a,b) => a-b)[Math.ceil(times.length*fraction)-1].toFixed(3);
    for (const size of [5000,50000]) {
      db.run(`WITH RECURSIVE n(i) AS (SELECT ? UNION ALL SELECT i+1 FROM n WHERE i+1 < ?)
        INSERT INTO products(id,name,status,visibility,final_price,created_at,updated_at)
        SELECT 'benchmark_'||printf('%06d',i),'Fixture','ACTIVE',CASE WHEN i%5=0 THEN 'CONTENT' ELSE 'CATALOG' END,
        137.55,'2026-01-01','2026-01-01' FROM n`, previous, size);
      previous = size;
      for (const scope of ['catalog','home'] as const) {
        const limit = scope === 'home' ? 12 : 50;
        const legacySql = `SELECT p.*,GROUP_CONCAT(pa.arrival_id) arrival_ids FROM products p
          LEFT JOIN product_arrivals pa ON pa.product_id=p.id WHERE p.status='ACTIVE'
          ${scope === 'catalog' ? "AND p.visibility='CATALOG'" : ''}
          GROUP BY p.id ORDER BY p.updated_at DESC,p.id ASC LIMIT ?`;
        const legacy = () => db.all(legacySql, limit);
        const current = () => readPublicProducts(db, { scope, limit });
        const expected = legacy();
        if (JSON.stringify(expected) !== JSON.stringify(current())) throw Error('Product query equivalence failed');
        const oldTimes: number[] = [], newTimes: number[] = [];
        for (let i=0; i<22; i++) {
          for (const [run, times] of (i%2 ? [[current,newTimes],[legacy,oldTimes]] : [[legacy,oldTimes],[current,newTimes]]) as [()=>unknown, number[]][]) {
            const start = performance.now(); run(); if(i>=2) times.push(performance.now()-start);
          }
        }
        const query = publicProductQuery({ scope, limit });
        results.push({ syntheticProducts: size, scope, limit, repetitions: 20,
          legacy: { p50Ms: percentile(oldTimes,.5), p95Ms: percentile(oldTimes,.95), plan: db.all('EXPLAIN QUERY PLAN '+legacySql,limit) },
          current: { p50Ms: percentile(newTimes,.5), p95Ms: percentile(newTimes,.95), plan: db.all('EXPLAIN QUERY PLAN '+query.sql,...query.params) } });
      }
    }
    fs.mkdirSync('.cache',{recursive:true});
    fs.writeFileSync('.cache/public-product-read-benchmark.json',JSON.stringify({
      scope:'Local in-memory SQL only, synthetic products with tied timestamps, no arrival links. Twenty alternating repetitions after warmup; not HTTP latency, production capacity or disk measurement.',
      node:process.version, results },null,2)+'\n');
    console.table(results.map(r=>({ products:r.syntheticProducts,scope:r.scope,oldP95:r.legacy.p95Ms,newP95:r.current.p95Ms })));
  } finally { db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
