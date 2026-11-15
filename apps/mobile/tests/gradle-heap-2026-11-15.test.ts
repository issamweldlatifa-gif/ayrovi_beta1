/**
 * Build APK du 15/11 : R8 « OutOfMemoryError » (2 Go), puis « exit code 143 » avec 6 Go sur
 * le runner d'un dépôt PRIVÉ (2 cœurs, 7 Go). Les réglages tiennent dans 7 Go, ne compilent
 * que les ABI embarquées, et passent après CHAQUE `expo prebuild` dans les deux workflows.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRADLE_JVM_ARGS, abiFiltersFromAppJson, raiseGradleHeap } from '../scripts/raise-gradle-heap.mjs';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Extrait du fichier tel que `expo prebuild` l'écrit (modèle Expo). */
const PREBUILD = `# Project-wide Gradle settings.
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
android.useAndroidX=true
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
newArchEnabled=true
`;

describe('réglages Gradle pour le runner privé (7 Go)', () => {
  const abis = abiFiltersFromAppJson(JSON.parse(read('../app.json')));

  it('les ABI compilées sont celles que l’APK embarque (app.json)', () => {
    expect(abis).toEqual(['arm64-v8a', 'armeabi-v7a']);
  });

  it('tas 3,5 Go (plus de 2, bien sous 7), Kotlin dans le processus, 2 workers, 2 ABI', () => {
    const out = raiseGradleHeap(PREBUILD, abis);
    expect(out).toContain(`org.gradle.jvmargs=${GRADLE_JVM_ARGS}`);
    expect(GRADLE_JVM_ARGS).toMatch(/-Xmx3584m/);
    expect(out).not.toContain('-Xmx2048m');
    expect(out.match(/^org\.gradle\.jvmargs=/gm)).toHaveLength(1);
    expect(out).toContain('kotlin.compiler.execution.strategy=in-process');
    expect(out).toContain('org.gradle.workers.max=2');
    expect(out).toContain('reactNativeArchitectures=arm64-v8a,armeabi-v7a');
    expect(out).not.toMatch(/x86/);
    expect(out).toContain('newArchEnabled=true');
    expect(out).toContain('android.useAndroidX=true');
  });

  it('idempotent, et ajoute les clés absentes du modèle', () => {
    const once = raiseGradleHeap(PREBUILD, abis);
    expect(raiseGradleHeap(once, abis)).toBe(once);
    expect(raiseGradleHeap('android.useAndroidX=true\n', abis)).toContain(`org.gradle.jvmargs=${GRADLE_JVM_ARGS}`);
  });

  it('les deux workflows Android : swap, puis réglages juste après le prebuild, avant Gradle', () => {
    for (const workflow of ['mobile-android.yml', 'mobile-release-aab.yml']) {
      const text = read(`../../../.github/workflows/${workflow}`);
      const swap = text.indexOf('sudo swapon');
      const prebuild = text.indexOf('npx expo prebuild --platform android --no-install');
      const settings = text.indexOf('node scripts/raise-gradle-heap.mjs android/gradle.properties app.json');
      const gradle = text.search(/\.\/gradlew (assemble|bundle)Release/);
      expect(swap, workflow).toBeGreaterThan(0);
      expect(prebuild, workflow).toBeGreaterThan(0);
      expect(settings, workflow).toBeGreaterThan(prebuild);
      expect(gradle, workflow).toBeGreaterThan(settings);
      expect(swap, workflow).toBeLessThan(gradle);
    }
  });
});
