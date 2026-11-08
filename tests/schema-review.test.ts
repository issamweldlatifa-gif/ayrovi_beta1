import { expect, it } from 'vitest';
import { db } from '../src/server';
import { inspectDatabaseSchema } from '../src/db/schemaInspection';
import baseline from '../docs/architecture/database-index-review.json';
const key = (fk: { table: string; parent: string; columns: string[]; parentColumns: (string | null)[] }) =>
  JSON.stringify([fk.table, fk.parent, fk.columns, fk.parentColumns]);
it('requires explicit review of new child-FK index gaps and keeps the backlog current', () => {
  const candidates = inspectDatabaseSchema(db).flatMap(t => t.foreignKeys.filter(fk => !fk.childLookupIndexed).map(fk => ({ table: t.name, ...fk })));
  const actual = new Set(candidates.map(key));
  const recorded = new Set(baseline.pendingReview.map(key));
  expect(recorded.size).toBe(baseline.pendingReview.length);
  expect(baseline.pendingReview.every(fk => fk.reason.trim().length > 20)).toBe(true);
  expect(candidates.filter(fk => !recorded.has(key(fk))), 'Add the appropriate index or explicitly record and justify the exception for review.').toEqual([]);
  expect(baseline.pendingReview.filter(fk => !actual.has(key(fk))), 'Remove resolved or changed relationships from the review backlog.').toEqual([]);
});
it('starts with enabled FK enforcement and a consistent synthetic database', () => {
  expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  expect(db.get('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
});
