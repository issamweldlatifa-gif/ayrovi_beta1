import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { inspectDatabaseSchema } from '../src/db/schemaInspection';
it('inspects compound keys and child indexes without changing schema or reading business rows', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE parent(a TEXT,b TEXT,PRIMARY KEY(a,b));
      CREATE TABLE child(a TEXT,b TEXT,FOREIGN KEY(a,b) REFERENCES parent(a,b));
      CREATE INDEX reverse_lookup ON child(b,a);
      CREATE TABLE missing(a TEXT REFERENCES parent(a));
      CREATE TABLE partial(a TEXT,b TEXT,FOREIGN KEY(a,b) REFERENCES parent(a,b));
      CREATE INDEX partial_lookup ON partial(a,b) WHERE a IS NOT NULL;
      CREATE TABLE wrong_prefix(x TEXT,a TEXT,b TEXT,FOREIGN KEY(a,b) REFERENCES parent(a,b));
      CREATE INDEX wrong_lookup ON wrong_prefix(x,a,b);`);
    const before = db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
    const queries: string[] = [];
    const tables = inspectDatabaseSchema({ all: (sql: string) => { queries.push(sql); return db.prepare(sql).all() as any; } });
    expect(tables.find(t => t.name === 'child')?.foreignKeys[0]).toMatchObject({ columns: ['a','b'], parent: 'parent', childLookupIndexed: true });
    for (const name of ['missing', 'partial', 'wrong_prefix']) expect(tables.find(t => t.name === name)?.foreignKeys[0].childLookupIndexed).toBe(false);
    expect(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(before);
    expect(queries.every(sql => sql.startsWith('PRAGMA ') || sql.includes('FROM sqlite_schema'))).toBe(true);
  } finally { db.close(); }
});
it('handles quoted identifiers and a child key covered by its own primary key', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE parent(id TEXT PRIMARY KEY); CREATE TABLE "child's \"\"table"(id TEXT PRIMARY KEY REFERENCES parent(id));`);
    const tables = inspectDatabaseSchema({ all: (sql: string) => db.prepare(sql).all() as any });
    expect(tables.find(t => t.name.startsWith("child's"))?.foreignKeys[0].childLookupIndexed).toBe(true);
  } finally { db.close(); }
});
