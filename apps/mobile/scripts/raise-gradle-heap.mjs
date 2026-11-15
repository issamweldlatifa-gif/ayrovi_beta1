#!/usr/bin/env node
/**
 * Mémoire de Gradle pour les builds Android de la CI — 15/11/2026.
 *
 * Constat (runs #463 et #465, commits 8743f285 et a1660acf) :
 *   « ERROR: R8: java.lang.OutOfMemoryError: Java heap space »
 *   « Execution failed for task ':app:minifyReleaseWithR8' »
 *
 * `expo prebuild` régénère `android/gradle.properties` avec
 * `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m`. R8 (réduction du
 * code, activée par `enableProguardInReleaseBuilds`) tourne DANS ce processus :
 * 2 Go étaient déjà juste (le run #462 passait encore), le build suivant a
 * débordé. Le runner GitHub `ubuntu-latest` dispose de 16 Go : on donne 6 Go au
 * tas et 1 Go au métaspace, et une consigne explicite au démon Kotlin.
 *
 * Le projet natif n'est pas versionné (CNG) : ce réglage est réappliqué après
 * CHAQUE prebuild, et le script ÉCHOUE si la valeur n'a pas été écrite — jamais
 * un build qui repart silencieusement avec 2 Go.
 *
 * Usage : node scripts/raise-gradle-heap.mjs [chemin/vers/gradle.properties]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GRADLE_JVM_ARGS = '-Xmx6g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';
export const KOTLIN_JVM_ARGS = '-Xmx2g';

/** Remplace (ou ajoute) une clé `key=value` dans un fichier properties. */
function setProperty(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key.replace(/\./g, '\\.')}\\s*=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.replace(/\s*$/, '')}\n${line}\n`;
}

export function raiseGradleHeap(text) {
  let next = setProperty(text, 'org.gradle.jvmargs', GRADLE_JVM_ARGS);
  next = setProperty(next, 'kotlin.daemon.jvmargs', KOTLIN_JVM_ARGS);
  return next;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] ?? 'android/gradle.properties';
  if (!existsSync(file)) {
    console.error(`::error title=Mémoire Gradle::${file} introuvable — lancer après « expo prebuild ».`);
    process.exit(1);
  }
  writeFileSync(file, raiseGradleHeap(readFileSync(file, 'utf8')));
  if (!readFileSync(file, 'utf8').includes(`org.gradle.jvmargs=${GRADLE_JVM_ARGS}`)) {
    console.error('::error title=Mémoire Gradle::org.gradle.jvmargs n’a pas été écrit.');
    process.exit(1);
  }
  console.log(`::notice title=Mémoire Gradle::org.gradle.jvmargs=${GRADLE_JVM_ARGS}`);
}
