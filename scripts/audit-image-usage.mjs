/** Read-only, conservative image inventory. Run from the repository root.
 * A missing literal reference is NOT permission to delete a CMS asset, dynamic
 * resource, fixture, identity master or report input. Never deletes files.
 * Output (ignored): .cache/image-cleanup/inventory.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const output = '.cache/image-cleanup';
fs.mkdirSync(output, { recursive: true });
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const images = files.filter(file => /\.(png|jpe?g|webp|gif|avif|svg|ico)$/i.test(file) && fs.existsSync(file));
const imageFiles = new Set(images);
const names = [...new Set(images.map(file => path.basename(file)))];
const references = new Map(names.map(name => [name, new Set()]));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Basenames intentionally over-retain same-name files rather than delete an asset
// because a URL prefix, alias or relative import differs. Empty inventories are safe.
const pattern = names.length
  ? new RegExp(names.sort((a, b) => b.length - a.length).map(escapeRegex).join('|'), 'g')
  : /(?!)/g;
function scan(source, text) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) references.get(match[0]).add(source);
}

for (const file of files) {
  if (!fs.existsSync(file) || fs.statSync(file).size > 12_000_000) continue;
  // SVG is text and may refer to another image through <image href="...">.
  if (imageFiles.has(file) && !file.endsWith('.svg')) continue;
  if (/\.(woff2?|ttf|otf|mp4|pdf|zip|lock)$/i.test(file) || file.endsWith('package-lock.json')) continue;
  const bytes = fs.readFileSync(file);
  if (bytes.subarray(0, 2048).includes(0)) continue;
  scan(file, bytes.toString('utf8'));
}

// Optional LOCAL database only, read-only. Never changes schemas or customer data,
// logs field values, opens production URLs, or treats absence here as proof that
// an asset is unused by a separate deployed CMS database.
if (fs.existsSync('data/qatafo.sqlite')) {
  const Database = require('better-sqlite3');
  const db = new Database('data/qatafo.sqlite', { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for (const { name } of tables) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      for (const row of db.prepare('SELECT * FROM ' + quoted).iterate()) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') scan(`[local database:${name}]`, value);
        }
      }
    }
  } finally {
    db.close();
  }
}

const result = images.map(file => ({
  file,
  bytes: fs.statSync(file).size,
  refs: [...references.get(path.basename(file))].filter(source => source !== file),
}));
fs.writeFileSync(`${output}/inventory.json`, JSON.stringify(result, null, 2) + '\n');
const unresolved = result.filter(item => !item.refs.length);
console.error(`Reviewed ${result.length} tracked images; ${unresolved.length} require manual/dynamic-usage review. No files deleted.`);
for (const item of unresolved) console.log(`${item.bytes}\t${item.file}`);
