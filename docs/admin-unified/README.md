# ZAYROVI Unified Admin — تطبيق الدليل المرجعي

## من المرجع إلى التطبيق

| المرجع المرسل | التطبيق في `/admin` |
| --- | --- |
| Dashboard أبيض/أزرق مع قائمة Navy | لوحة رئيسية بأربع بطاقات مباشرة من `/api/admin/dashboard`، رسم المبيعات وتوزيع حالات الطلبات، المهام وآخر الطلبات. التقارير التفصيلية في تبويب مستقل، من غير حذف بيانات AyWebs أو مؤشرات الدفع. |
| Sidebar واحدة | لوحة القيادة، CRM (الحرفاء والدعم والمتابعة)، ERP (الطلبات والفواتير والكاتالوج والمخزون والموارد)، CMS (المقالات والتطبيق والمظهر)، Administration (الحسابات والصلاحيات والتدقيق). التجميع في العميل لا يضيف صلاحيات: كل عنصر لازم يجي من API التنقّل المصادق عليه. |
| جداول مُفلترة وحالات واضحة | قائمة الطلبات والفواتير الصادرة، بحث بالمرجع/الفاتورة/الحريف/الهاتف وفلاتر حالة ومدة؛ عند عرض الفواتير تكون المدة حسب تاريخ الإصدار. جدول حسابات الحرفاء قابل للفصل حسب حالة الحساب. إعادة استخدام `DataTable` والإجراءات الحالية. |
| Light وDark، RTL، responsive | لوحة بيضاء وزرقاء وبديل فحمي، القائمة تصبح درجاً على الهاتف وتنعكس للعربية. الواجهة الجديدة للتنقّل ولوحة القيادة مترجمة؛ نصوص بعض الشاشات الموجودة من قبل تبقى بالفرنسية. |
| Kanban | في مهام CRM وفي مقالات مجلتي حسب حالة النشر. البطاقات تخصّ الصفحة المصفّاة الحالية، وليست عدّادات مجمعة لكل البيانات. لا توجد عمليات نشر/تغيير حالة بالسحب: الإجراءات تمر بنفس صلاحيات التعديل والـAPI الموجود. |

## الحدود والتوافق

- احتفظنا بـ`?section=`, `request`, `focus`, `tab` وروابط `/admin/<section>`، وآلية RBAC والجلسة والبحث و2FA والتدقيق. التجميع الجديد طبقة عرض فقط؛ لا تغيير لعقد `/api/admin/back-office/navigation` أو طبقة الاستضافة/التخزين.
- الفواتير ليست نظام محاسبة جديداً. تبويب الفواتير يقرأ السجل الموجود. تنزيل PDF يحافظ على `commerce:read` مثل تفاصيل الطلب، ويستعمل نفس حارس الملفات الخاصة والتدقيق وعدم التخزين في الكاش. لا يُنشئ التنزيل فاتورة أو يغيّر حالة الدفع.
- الـCMS الحالي ينظّم محتوى التطبيق والواجهات السابقة؛ الصفحة العامة الجديدة الثابتة تبقى خارج محرّر الـCMS. لا تُقدّم هنا وحدة محاسبة عامة أو CRM Deals جديدة.
- المعاينة المرئية على قاعدة SQLite اختبار معزولة وببيانات اصطناعية. ليست عملية نشر ولا تتطلب تغيير قاعدة الإنتاج.

## التحقّق المحلي

```sh
npm run typecheck
npm run build
npm run design:check
npx vitest run tests/admin-unified-workspaces.test.ts tests/back-office-shell.test.tsx \
  tests/back-office-foundation.test.ts tests/back-office-shortcuts.test.ts \
  tests/crm-ui-render.test.tsx tests/crm-foundation.test.ts tests/erp-core-foundation.test.ts \
  tests/admin-console-upgrade.test.tsx tests/admin-sidebar-wrap-2026-11-13.test.ts \
  tests/public-upload-policy.test.ts tests/zayrovi.test.ts
```

### Alignement sur les premiers modèles

Les [premières maquettes](../concepts/images/index.html) sont des références visuelles, pas des données ni des routes à reproduire à l’identique. Le modèle A se traduit par le rail encre/bordeaux et l’accueil opérationnel (files autorisées, dernières commandes), avec les chiffres et graphiques dans « Analyses détaillées ». Le modèle C se traduit par la surface plus chaude de l’espace éditorial, sans créer de workflow de publication fictif. La connexion est une surface sombre séparée, inspirée de la référence en verre irisé, indépendante de la préférence de thème après connexion. La sonde `verify/admin-login-render.mjs` vérifie le rendu réel et l’image, pas seulement le statut HTTP.

Dans **Administration → Modules & environnement**, « En service · historique » indique un module existant porté par l’ancien écran, pas une désactivation. « Planifié · indisponible » indique que le registre annonce le module sans fournir une fonctionnalité (notamment comptabilité et automatisation). Ces étiquettes ne sont ni une autorisation par utilisateur, ni le résultat d’un test de service externe. Les intégrations restent soumises aux contrôles de Connected.
