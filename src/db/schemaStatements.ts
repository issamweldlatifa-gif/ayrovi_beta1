/** Split simple DDL batches without treating quoted/comment semicolons as boundaries.
 * Trigger bodies are outside this helper's contract (use SQLite exec directly).
 */
export function schemaStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '', quote = '', lineComment = false, blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], next = sql[i + 1];
    if (lineComment) {
      if (c === '\n') { lineComment = false; current += '\n'; }
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i++; current += ' '; }
      continue;
    }
    if (quote) {
      current += c;
      if (c === quote) {
        if (next === quote && quote !== ']') { current += next; i++; }
        else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') { lineComment = true; i++; current += ' '; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; current += ' '; continue; }
    if (c === "'" || c === '"' || c === '`' || c === '[') { quote = c === '[' ? ']' : c; current += c; continue; }
    if (c === ';') { if (current.trim()) statements.push(current.trim()); current = ''; }
    else current += c;
  }
  if (quote || blockComment) throw new Error('UNTERMINATED_SCHEMA_SQL');
  if (current.trim()) statements.push(current.trim());
  return statements;
}
