#!/usr/bin/env node
/**
 * Réglages Gradle pour les builds Android de la CI — 15/11/2026.
 *
 * 1) Runs #463 et #465 (commits 8743f285, a1660acf) :
 *      « ERROR: R8: java.lang.OutOfMemoryError: Java heap space »
 *    `expo prebuild` écrit `org.gradle.jvmargs=-Xmx2048m` ; R8 (réduction du code)
 *    tourne dans ce processus et débordait.
 * 2) Run #467 (0670f4c9), tas à 6 Go : processus tué (« exit code 143 ») après
 *    50 min. Le dépôt est désormais PRIVÉ : le runner GitHub d'un dépôt privé
 *    (offre gratuite) n'a que 2 cœurs et 7 Go de RAM (16 Go en public). 6 Go de
 *    tas + le démon Kotlin + Node (bundle JS) dépassaient la machine.
 *
 * Réglages pour une machine de 7 Go :
 *   • tas Gradle 3,5 Go (R8 tient, la machine aussi), métaspace 768 Mo ;
 *   • Kotlin compilé DANS le processus Gradle (pas de second démon de 1–2 Go) ;
 *   • 2 workers (= 2 cœurs) : pas de compilations parallèles qui s'additionnent ;
 *   • `reactNativeArchitectures` = les `abiFilters` d'app.json. Le modèle Expo
 *     compile le C++ pour QUATRE architectures (x86 et x86_64 compris) alors que
 *     l'APK n'en garde que deux : la moitié de la compilation native était jetée.
 *
 * Le projet natif n'est pas versionné (CNG) : ce script passe après CHAQUE
 * prebuild et ÉCHOUE si une valeur n'a pas été écrite.
 *
 * Usage : node scripts/raise-gradle-heap.mjs [gradle.properties] [app.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GRADLE_JVM_ARGS = '-Xmx3584m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8';

/** Les ABI réellement embarquées (expo-build-properties → android.abiFilters). */
/**
 * @param {any} appJson
 * @returns {string[] | null}
 */
export function abiFiltersFromAppJson(appJson) {
  const plugins = appJson?.expo?.plugins ?? [];
  for (const plugin of plugins) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      const abis = plugin[1]?.android?.abiFilters;
      if (Array.isArray(abis) && abis.length > 0 && abis.every((abi) => typeof abi === 'string' && abi)) return abis;
    }
  }
  return null;
}

/** Remplace (ou ajoute) une clé `key=value` dans un fichier properties. */
/**
 * @param {string} text
 * @param {string} key
 * @param {string} value
 */
function setProperty(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key.replace(/\./g, '\\.')}\\s*=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.replace(/\s*$/, '')}\n${line}\n`;
}

/**
 * @param {string[] | null} abis
 * @returns {Record<string, string>}
 */
export function ciGradleProperties(abis) {
  /** @type {Record<string, string>} */
  const values = {
    'org.gradle.jvmargs': GRADLE_JVM_ARGS,
    'org.gradle.workers.max': '2',
    'kotlin.compiler.execution.strategy': 'in-process',
  };
  if (abis) values.reactNativeArchitectures = abis.join(',');
  return values;
}

/**
 * @param {string} text
 * @param {string[] | null} [abis]
 */
export function raiseGradleHeap(text, abis = null) {
  let next = text;
  for (const [key, value] of Object.entries(ciGradleProperties(abis))) next = setProperty(next, key, value);
  return next;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] ?? 'android/gradle.properties';
  const appJsonPath = process.argv[3] ?? 'app.json';
  if (!existsSync(file)) {
    console.error(`::error title=Réglages Gradle::${file} introuvable — lancer après « expo prebuild ».`);
    process.exit(1);
  }
  const abis = existsSync(appJsonPath) ? abiFiltersFromAppJson(JSON.parse(readFileSync(appJsonPath, 'utf8'))) : null;
  writeFileSync(file, raiseGradleHeap(readFileSync(file, 'utf8'), abis));
  const written = readFileSync(file, 'utf8');
  const missing = Object.entries(ciGradleProperties(abis)).filter(([key, value]) => !written.includes(`${key}=${value}`));
  if (missing.length > 0) {
    console.error(`::error title=Réglages Gradle::non écrits : ${missing.map(([key]) => key).join(', ')}`);
    process.exit(1);
  }
  console.log(`::notice title=Réglages Gradle::jvmargs=${GRADLE_JVM_ARGS} · ABI=${abis ? abis.join(',') : 'modèle Expo'} · Kotlin in-process · 2 workers`);
}
