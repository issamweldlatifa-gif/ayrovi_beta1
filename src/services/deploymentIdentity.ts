/**
 * هوية النشر — «أي كود قاعد يخدم على الخادم المنشور؟»
 *
 * علاش موجود: الخادم يجاوب على `/api/ready`، والجواب هذا هو اللي يفرّق بين
 * «الخادم يشغّل `main`» و«الخادم يشغّل الفرع». بلا هوية صادقة، أي تشخيص يبقى
 * تخميناً — وواحد يقلّب في التطبيق وهو صحيح، والمشكلة في النشر.
 *
 * خطأ كانت هنا: الكود كان يقرا `RENDER_GIT_COMMIT_SHA` وحدها. Render تعطي
 * `RENDER_GIT_COMMIT` (والفرع في `RENDER_GIT_BRANCH`) — الاسم الغالط يعطي
 * `local` دائماً، يعني «ما نعرفوش أي كود قاعد يخدم» بلا حتى إشارة. هنا
 * نقراو الأسماء الصحيحة **قبل** البدائل، والبدائل تبقى للبناء المحلي.
 */

export interface DeploymentIdentity {
  /** SHA مختصر (12) أو `local` للبناء المحلي. */
  commit: string;
  /** الفرع المنشور، أو `unknown` كان ما نعرفوهش. */
  branch: string;
}

type Environment = Record<string, string | undefined>;

const trim = (value: unknown): string => String(value ?? '').trim();

/**
 * ترتيب القراءة مقصود: **الاسم الرسمي متاع Render أولاً**، ثم الأسماء
 * القديمة/البديلة، ثم `local`. نستعملو `||` موش `??` خاطر Render تنجّم تعطي
 * سلسلة فارغة في بعض الحالات، والفارغ ما هوش هوية.
 */
export function deploymentIdentity(env: Environment = process.env): DeploymentIdentity {
  const commit = trim(env.RENDER_GIT_COMMIT)
    || trim(env.RENDER_GIT_COMMIT_SHA)
    || trim(env.AYROVI_BUILD_COMMIT);
  const branch = trim(env.RENDER_GIT_BRANCH)
    || trim(env.AYROVI_BUILD_BRANCH);
  return {
    commit: (commit || 'local').slice(0, 12),
    branch: (branch || 'unknown').slice(0, 80),
  };
}
