/** Read-only schema inspection. Never reads business rows or changes schema. */
export interface SchemaReader {
  all<T = any>(sql: string, ...params: any[]): T[];
}
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
export function inspectDatabaseSchema(db: SchemaReader) {
  const tables = db.all<{ name: string }>("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return tables.map(({ name }) => {
    const columns = db.all<{ name: string; type: string; notnull: number; pk: number }>(`PRAGMA table_info(${quote(name)})`)
      .map(c => ({ name: c.name, type: c.type, declaredNotNull: Boolean(c.notnull), primaryKeyPosition: c.pk }));
    const indexes = db.all<{ name: string; unique: number; partial: number }>(`PRAGMA index_list(${quote(name)})`)
      .map(i => ({ name: i.name, unique: Boolean(i.unique), partial: Boolean(i.partial),
        columns: db.all<{ name: string | null }>(`PRAGMA index_info(${quote(i.name)})`).map(c => c.name) }));
    const grouped = new Map<number, { id: number; parent: string; columns: string[]; parentColumns: (string | null)[]; onDelete: string; onUpdate: string }>();
    for (const fk of db.all<{ id: number; seq: number; table: string; from: string; to: string | null; on_delete: string; on_update: string }>(`PRAGMA foreign_key_list(${quote(name)})`).sort((a, b) => a.id - b.id || a.seq - b.seq)) {
      let group = grouped.get(fk.id);
      if (!group) {
        group = { id: fk.id, parent: fk.table, columns: [], parentColumns: [], onDelete: fk.on_delete, onUpdate: fk.on_update };
        grouped.set(fk.id, group);
      }
      group.columns.push(fk.from); group.parentColumns.push(fk.to);
    }
    const primaryKey = columns.filter(c => c.primaryKeyPosition > 0).sort((a, b) => a.primaryKeyPosition - b.primaryKeyPosition).map(c => c.name);
    const candidates = [...indexes.filter(i => !i.partial).map(i => i.columns), primaryKey];
    const foreignKeys = [...grouped.values()].map(fk => ({ ...fk,
      // Equality lookups can use either ordering of a compound FK's leading columns.
      childLookupIndexed: candidates.some(index => index.length >= fk.columns.length
        && new Set(index.slice(0, fk.columns.length)).size === fk.columns.length
        && index.slice(0, fk.columns.length).every(c => c !== null && fk.columns.includes(c))) }));
    return { name, columns, indexes, foreignKeys };
  });
}
