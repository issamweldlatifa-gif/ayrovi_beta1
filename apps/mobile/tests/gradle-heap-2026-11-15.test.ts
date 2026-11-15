/**
 * Build APK du 15/11 : « R8: java.lang.OutOfMemoryError: Java heap space ».
 * Le tas de Gradle est relevé après CHAQUE `expo prebuild`, dans les deux workflows Android.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — script Node (ESM) sans déclaration de types
import { GRADLE_JVM_ARGS, KOTLIN_JVM_ARGS, raiseGradleHeap } from '../scripts/raise-gradle-heap.mjs';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Extrait du fichier tel que `expo prebuild` l'écrit (modèle Expo). */
const PREBUILD = `# Project-wide Gradle settings.
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
android.useAndroidX=true
`;

describe('mémoire de Gradle pour R8', () => {
  it('remplace les 2 Go du modèle et garde les autres réglages', () => {
    const out = raiseGradleHeap(PREBUILD);
    expect(out).toContain(`org.gradle.jvmargs=${GRADLE_JVM_ARGS}`);
    expect(out).not.toContain('-Xmx2048m');
    expect(out.match(/^org\.gradle\.jvmargs=/gm)).toHaveLength(1);
    expect(out).toContain(`kotlin.daemon.jvmargs=${KOTLIN_JVM_ARGS}`);
    expect(out).toContain('org.gradle.parallel=true');
    expect(out).toContain('android.useAndroidX=true');
    expect(GRADLE_JVM_ARGS).toMatch(/-Xmx6g/);
  });

  it('idempotent, et ajoute la clé si le modèle ne l’a pas', () => {
    const once = raiseGradleHeap(PREBUILD);
    expect(raiseGradleHeap(once)).toBe(once);
    expect(raiseGradleHeap('android.useAndroidX=true\n')).toContain(`org.gradle.jvmargs=${GRADLE_JVM_ARGS}`);
  });

  it('les deux workflows Android relèvent le tas juste après le prebuild', () => {
    for (const workflow of ['mobile-android.yml', 'mobile-release-aab.yml']) {
      const text = read(`../../../.github/workflows/${workflow}`);
      const prebuild = text.indexOf('npx expo prebuild --platform android --no-install');
      const heap = text.indexOf('node scripts/raise-gradle-heap.mjs android/gradle.properties');
      const gradle = text.search(/\.\/gradlew (assemble|bundle)Release/);
      expect(prebuild, workflow).toBeGreaterThan(0);
      expect(heap, workflow).toBeGreaterThan(prebuild);
      expect(gradle, workflow).toBeGreaterThan(heap);
    }
  });
});
