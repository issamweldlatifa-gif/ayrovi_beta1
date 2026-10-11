/**
 * هوية النشر — «أي فرع قاعد يخدم على الخادم المنشور؟»
 *
 * هذا السؤال يتكرّر: واحد يشوف التطبيق ما يخدمش، ويسأل «يمكن الخادم منشور من
 * فرع آخر؟» — وما يلقى جواباً إلا بفتح لوحة Render. الدالة هنا تجاوب عليه من
 * `curl` واحد، بشرط أن تكون تقرا **أسماء متغيّرات Render الحقيقية**.
 *
 * الخطأ اللي وقع: `RENDER_GIT_COMMIT_SHA` ما موجودش عند Render (الصحيح
 * `RENDER_GIT_COMMIT`)، و`RENDER_GIT_BRANCH` ما كانش يتقرا أصلاً ⇒ كل خادم
 * منشور يقول `commit: "local"`، يعني «ما نعرفوش» — وهو أخطر من الخطأ، خاطر
 * يوهم أنه معلومة.
 */
import { describe, expect, test } from 'vitest';
import { deploymentIdentity } from '../src/services/deploymentIdentity';

describe('هوية النشر', () => {
  test('تقرا أسماء Render الرسمية', () => {
    expect(deploymentIdentity({
      RENDER_GIT_COMMIT: '4ee2a8af31e1dc1cabbe579b5f0e43e95664148a',
      RENDER_GIT_BRANCH: 'arena/c0321e79-ayrovi-beta1',
    })).toEqual({
      commit: '4ee2a8af31e1',
      branch: 'arena/c0321e79-ayrovi-beta1',
    });
  });

  test('الاسم الصحيح يفوت على البدائل (وكذلك الفرع)', () => {
    expect(deploymentIdentity({
      RENDER_GIT_COMMIT: 'aaaaaaaaaaaa1111',
      RENDER_GIT_COMMIT_SHA: 'bbbbbbbbbbbb2222',
      AYROVI_BUILD_COMMIT: 'cccccccccccc3333',
      RENDER_GIT_BRANCH: 'main',
      AYROVI_BUILD_BRANCH: 'beta',
    })).toEqual({ commit: 'aaaaaaaaaaaa', branch: 'main' });
  });

  test('البدائل تخدم كان الأسماء الرسمية غايبة (بناء محلي ولا CI)', () => {
    expect(deploymentIdentity({ AYROVI_BUILD_COMMIT: 'dddddddddddd4444', AYROVI_BUILD_BRANCH: 'ci' }))
      .toEqual({ commit: 'dddddddddddd', branch: 'ci' });
    expect(deploymentIdentity({ RENDER_GIT_COMMIT_SHA: 'eeeeeeeeeeee5555' }))
      .toEqual({ commit: 'eeeeeeeeeeee', branch: 'unknown' });
  });

  test('بلا أي متغيّر: `local` و`unknown` — الصدق موش التخمين', () => {
    expect(deploymentIdentity({})).toEqual({ commit: 'local', branch: 'unknown' });
    // السلسلة الفارغة (Render تنجّم تعطيها) ما هيش هوية.
    expect(deploymentIdentity({ RENDER_GIT_COMMIT: '   ', RENDER_GIT_BRANCH: '' }))
      .toEqual({ commit: 'local', branch: 'unknown' });
  });

  test('ما تكشفش أكثر من اللازم: SHA مختصر وفرع محدود الطول', () => {
    const identity = deploymentIdentity({ RENDER_GIT_COMMIT: 'f'.repeat(40), RENDER_GIT_BRANCH: 'x'.repeat(200) });
    expect(identity.commit).toHaveLength(12);
    expect(identity.branch).toHaveLength(80);
  });

  test('`/api/ready` ينشر الهوية كاملة (وما ينشرش أكثر)', async () => {
    // `process.cwd()` = جذر المشروع (نفس باقي اختبارات الجذر؛ `import.meta`
    // ما تقبلهاش `tsconfig` الجذر `module: commonjs`).
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'src/server.ts'), 'utf8');
    const start = source.indexOf("app.get('/api/ready'");
    const block = source.slice(start, source.indexOf('app.use((error', start));
    expect(block).toContain('deploymentIdentity()');
    expect(block).toContain('commit: deployment.commit');
    expect(block).toContain('branch: deployment.branch');
    // مفاتيح الحالة تُخبر المستعمل بأي كود يخدم — وبلا أسرار.
    expect(block).not.toMatch(/process\.env\.(?!npm_package_version)[A-Z_]+/);
  });
});
