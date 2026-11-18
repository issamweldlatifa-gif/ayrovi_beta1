#!/usr/bin/env node
/**
 * CI dependency audit gate — `npm audit --audit-level=high`, with reviewed exceptions only.
 *
 * Fails when ANY high/critical advisory is present, unless it is listed in security/audit-allowlist.json with:
 *   - the same GHSA id and package,
 *   - the SAME vulnerable range as the live advisory (a changed range usually means a fix shipped → upgrade instead),
 *   - an expiry date that has not passed.
 * Moderate/low advisories are reported but do not block (same threshold as before).
 * Packages flagged only because they depend on an allowlisted package (npm lists vite, vitest… as "high" because
 * they pull picomatch) are covered by the root advisory's entry — nothing else is.
 *
 * Usage (from any package directory): node <repo>/scripts/audit-gate.mjs [--omit=dev]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKING = new Set(['high', 'critical']);
const allowlist = JSON.parse(fs.readFileSync(path.join(ROOT, 'security/audit-allowlist.json'), 'utf8')).advisories;
const today = new Date().toISOString().slice(0, 10);

/** npm audit exits 1 when it finds anything: read its JSON either way. */
function audit() {
  const args = ['audit', '--json', ...process.argv.slice(2)];
  try {
    return JSON.parse(execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

const report = audit();
if (report.error) {
  console.error(`[audit] npm audit failed: ${report.error.summary || JSON.stringify(report.error)}`);
  process.exit(1);
}
const vulnerabilities = report.vulnerabilities ?? {};
const ghsa = (url = '') => (url.match(/GHSA-[\w-]+/) || [url])[0];

// Root advisories (objects in `via`), deduplicated by GHSA id + package.
const advisories = new Map();
for (const vuln of Object.values(vulnerabilities))
  for (const via of vuln.via)
    if (typeof via === 'object') advisories.set(`${ghsa(via.url)}|${via.name}`, { id: ghsa(via.url), package: via.name, severity: via.severity, range: via.range, title: via.title, url: via.url });

const blocked = [], tolerated = [], minor = [];
for (const adv of advisories.values()) {
  if (!BLOCKING.has(adv.severity)) { minor.push(adv); continue; }
  const entry = allowlist.find((a) => a.id === adv.id && a.package === adv.package);
  if (!entry) { blocked.push({ ...adv, why: 'not reviewed' }); continue; }
  if (entry.range !== adv.range) { blocked.push({ ...adv, why: `range changed: reviewed "${entry.range}", now "${adv.range}" — a fix may exist, upgrade` }); continue; }
  if (entry.expires < today) { blocked.push({ ...adv, why: `exception expired on ${entry.expires} — re-review` }); continue; }
  tolerated.push({ ...adv, expires: entry.expires });
}

// A package marked high/critical must trace back (through `via` names) to a tolerated advisory only.
const toleratedPackages = new Set(tolerated.map((a) => a.package));
const reaches = (name, seen = new Set()) => {
  if (seen.has(name)) return true;
  seen.add(name);
  const vuln = vulnerabilities[name];
  if (!vuln) return true;
  return vuln.via.every((via) => (typeof via === 'object'
    ? !BLOCKING.has(via.severity) || toleratedPackages.has(via.name)
    : reaches(via, seen)));
};
for (const vuln of Object.values(vulnerabilities))
  if (BLOCKING.has(vuln.severity) && !reaches(vuln.name) && !blocked.some((b) => b.package === vuln.name))
    blocked.push({ id: '-', package: vuln.name, severity: vuln.severity, range: vuln.range, title: 'depends on an unreviewed vulnerable package', why: 'not reviewed' });

for (const a of minor) console.log(`[audit] ${a.severity.padEnd(8)} ${a.package} ${a.range} — ${a.title} (${a.id}) — not blocking`);
for (const a of tolerated) console.log(`[audit] TOLERATED ${a.severity} ${a.package} ${a.range} — ${a.title} (${a.id}), no patched release; reviewed exception until ${a.expires}`);
if (blocked.length) {
  for (const a of blocked) console.error(`[audit] BLOCKED  ${a.severity} ${a.package} ${a.range ?? ''} — ${a.title} (${a.id}): ${a.why}`);
  console.error(`[audit] ✗ ${blocked.length} high/critical advisory(ies) to fix (npm audit fix) or review in security/audit-allowlist.json`);
  process.exit(1);
}
console.log(`[audit] ✓ no unreviewed high/critical advisory (${tolerated.length} tolerated, ${minor.length} below threshold)`);
