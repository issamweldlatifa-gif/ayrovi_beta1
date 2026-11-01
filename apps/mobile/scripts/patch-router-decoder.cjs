/** Temporary SDK 57 bridge: query-string 7 expects CommonJS but the fixed
 * decode-uri-component 0.5.1 is ESM. Fail closed if upstream changes; remove
 * this bridge when upgrading to an Expo Router without query-string 7. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const routerRequire = createRequire(require.resolve('expo-router/package.json'));
const queryPackage = routerRequire.resolve('query-string/package.json');
const query = JSON.parse(fs.readFileSync(queryPackage, 'utf8'));
const queryRequire = createRequire(queryPackage);
const decoderEntry = queryRequire.resolve('decode-uri-component');
const decoder = JSON.parse(fs.readFileSync(path.join(path.dirname(decoderEntry), 'package.json'), 'utf8'));
if (query.version !== '7.1.3' || decoder.version !== '0.5.1') {
  throw new Error(`Review the router decoder bridge: query-string ${query.version}, decoder ${decoder.version}`);
}
const file = path.join(path.dirname(queryPackage), 'index.js');
const before = "const decodeComponent = require('decode-uri-component');";
const after = "const decodeComponent = require('decode-uri-component').default;";
const source = fs.readFileSync(file, 'utf8');
if (source.includes(after) && !source.includes(before)) {
  console.log('Router decoder bridge already applied.');
} else if (source.split(before).length === 2 && !source.includes(after)) {
  fs.writeFileSync(file, source.replace(before, after));
  console.log('Applied router decoder compatibility bridge.');
} else {
  throw new Error('Unexpected query-string source: refusing to patch.');
}

// GHSA-gcqx-w48m-w2h4: no patched deepmerge release exists yet. Exclude the
// dangerous key before reading either merge operand; retain enumerable symbols.
// Patch each actual Expo/Jest copy and all three published entry points.
const mergePackages = new Set();
for (const consumer of ['@expo/config/package.json', 'jest-config/package.json']) {
  const consumerRequire = createRequire(require.resolve(consumer));
  mergePackages.add(consumerRequire.resolve('deepmerge/package.json'));
}
for (const mergePackage of mergePackages) {
  const merge = JSON.parse(fs.readFileSync(mergePackage, 'utf8'));
  if (merge.version !== '4.3.1') throw new Error(`Review deepmerge backport: ${merge.version}`);
  for (const entry of ['index.js', 'dist/cjs.js', 'dist/umd.js']) {
    const mergeFile = path.join(path.dirname(mergePackage), entry);
    const oldLine = 'return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target))';
    const newLine = "return Object.keys(target).filter(function(key) { return key !== '__proto__' }).concat(getEnumerableOwnPropertySymbols(target))";
    const content = fs.readFileSync(mergeFile, 'utf8');
    if (content.includes(newLine) && !content.includes(oldLine)) continue;
    if (content.split(oldLine).length !== 2 || content.includes(newLine)) {
      throw new Error(`Unexpected deepmerge source: ${mergeFile}`);
    }
    fs.writeFileSync(mergeFile, content.replace(oldLine, newLine));
    console.log(`Applied deepmerge safety backport: ${entry}`);
  }
}
