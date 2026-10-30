// Fail closed when a deployment or CI workflow drifts from the reviewed runtime.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Node version must be an exact release');
const [major, minor, patch] = version.split('.').map(Number);
if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) throw new Error('Node must be at least the reviewed Node 22.23.4 security release');
if (process.versions.node !== version) throw new Error(`Running Node ${process.versions.node}, expected ${version}`);
const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
if (!new RegExp(`key: NODE_VERSION\\s+value: ${version.replace(/\./g, '\\.')}(?:\\s|$)`).test(render)) throw new Error('Render Node version does not match .nvmrc');
for (const name of fs.readdirSync(path.join(root, '.github/workflows')).filter(name => /\.ya?ml$/.test(name))) {
  const content = fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8');
  for (const [, configured] of content.matchAll(/^\s*node-version:\s*['"]?([^\s'"]+)/gm)) {
    if (configured !== version) throw new Error(`${name} uses Node ${configured}, expected ${version}`);
  }
}
console.log(`Node ${version}: pin matches Render and explicit CI versions.`);
