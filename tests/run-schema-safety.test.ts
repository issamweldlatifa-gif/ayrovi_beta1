import { afterEach, expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
let db: QatafoDatabase | undefined;
afterEach(()=>db?.close());
it('propagates invalid DDL and rolls back earlier statements in the same block',()=>{
  db=new QatafoDatabase(':memory:');
  expect(()=>db!.runSchema('CREATE TABLE schema_safety_new(id TEXT); CREATE INDEX schema_safety_bad ON missing_table(id);')).toThrow();
  expect(db.get("SELECT name FROM sqlite_master WHERE name='schema_safety_new'")).toBeUndefined();
});
it('does not silently accept uniqueness violations or discard preexisting data',()=>{
  db=new QatafoDatabase(':memory:');
  db.runSchema('CREATE TABLE schema_safety_rows(id TEXT, value TEXT);');
  db.run("INSERT INTO schema_safety_rows VALUES ('a','same'),('b','same')");
  expect(()=>db!.runSchema('CREATE TABLE schema_safety_temporary(id TEXT); CREATE UNIQUE INDEX schema_safety_unique ON schema_safety_rows(value);')).toThrow();
  expect(db.all('SELECT * FROM schema_safety_rows ORDER BY id')).toEqual([{id:'a',value:'same'},{id:'b',value:'same'}]);
  expect(db.get("SELECT name FROM sqlite_master WHERE name='schema_safety_temporary'")).toBeUndefined();
});
it('supports repeated idempotent blocks, leading comments and nested savepoint rollback',()=>{
  db=new QatafoDatabase(':memory:');
  const sql='-- documented constraint\nCREATE TABLE IF NOT EXISTS schema_safety_repeat(id TEXT); CREATE INDEX IF NOT EXISTS schema_safety_index ON schema_safety_repeat(id);';
  expect(db.runSchema(sql)).toBe(2);expect(db.runSchema(sql)).toBe(2);
  db.transaction(()=>{
    db!.run("INSERT INTO schema_safety_repeat VALUES ('retained')");
    expect(()=>db!.runSchema('CREATE TABLE schema_safety_nested(id TEXT); INVALID DDL;')).toThrow();
    expect(db!.get("SELECT name FROM sqlite_master WHERE name='schema_safety_nested'")).toBeUndefined();
  });
  expect(db.all('SELECT * FROM schema_safety_repeat')).toEqual([{id:'retained'}]);
});
it('handles semicolons in comments, literals and quoted identifiers without hiding real failures',()=>{
  db=new QatafoDatabase(':memory:');
  expect(db.runSchema(`-- first; not a statement
    CREATE TABLE schema_safety_quotes("semi;column" TEXT DEFAULT 'it''s; safe');
    /* another ; delimiter */ CREATE INDEX IF NOT EXISTS schema_safety_quotes_index ON schema_safety_quotes("semi;column");
    -- trailing; comment
  `)).toBe(2);
  db.run('INSERT INTO schema_safety_quotes DEFAULT VALUES');
  expect(db.get('SELECT * FROM schema_safety_quotes')).toEqual({'semi;column':"it's; safe"});
  expect(()=>db!.runSchema("CREATE TABLE schema_safety_unclosed(id TEXT); /* missing end")).toThrow('UNTERMINATED_SCHEMA_SQL');
  expect(db.get("SELECT name FROM sqlite_master WHERE name='schema_safety_unclosed'")).toBeUndefined();
});
