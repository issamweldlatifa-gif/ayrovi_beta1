# جرد بنية SQLite — الدفعة الأولى

هذه نتيجة قاعدة **تجريبية جديدة** أُنشئت عبر bootstrap الخادم الكامل، وليست فحصًا لبيانات Render. لم تتغير الجداول أو الاستضافة أو البيانات الفعلية في هذه الدفعة.

## النتيجة المقاسة

- 154 جدولًا، باستثناء أسماء SQLite الداخلية التي تبدأ بـ`sqlite_`.
- 441 فهرسًا، تشمل الفهارس الآلية للقيود. كان العدد 439 في الجرد الأول؛ أضافت دفعة قراءة المنتجات فهرسين غير فريدين دون تغيير صفوف البيانات.
- 181 قيد Foreign Key؛ لا تعني تغطية كل العلاقات المنطقية أو الروابط متعددة الأنواع.
- `integrity_check`: النتيجة `ok`، و`foreign_key_check`: صفر مخالفات على بيانات التهيئة التجريبية.
- 75 علاقة مرشحة لمراجعة فهرس بحث من جهة الجدول التابع. ليس كل مرشح عيبًا: القرار يحتاج الاستعلامات والحمل وكلفة الكتابة. الفهارس الجزئية لا تُحسب هنا كغطاء عام؛ قد تكون مفيدة لبعض الاستعلامات.

## ما أضيف فعليًا

- مفتش بنية للقراءة فقط في `src/db/schemaInspection.ts`، لا يصدّر صفوف المستخدمين ولا يعدّل القاعدة.
- `npm run audit:database` ينشئ قاعدة معزولة في الذاكرة ويخرج جردًا إلى `.cache/database-structure-audit.json`، ولا يقبل رابط production.
- اختبارات للفهرسة المركبة والجزئية وأسماء الجداول المقتبسة وعدم تعديل البنية.
- اختبار ملف SQLite مؤقت يتحقق من بقاء إعداد مخصّص وإعدادات منشور مميز وعنوان/مرجع صورة Lens وسجل الترحيلات والبنية بعد إعادة الفتح مرتين. هذا لا يثبت بقاء ملف الصورة نفسه أو كل إعداد CMS أو أي ترحيل تاريخي ممكن.
- سجل نقاط الفهرسة القديمة واختبار يمنع مرور علاقة جديدة غير مغطاة بفهرس عام دون إضافتها صراحةً لسجل المراجعة مع تبرير. السجل الأولي دين مراجعة قائم، وليس إعلان قبول 75 حالة أو ضمانًا لصحة التصميم.

## التحقق المنفّذ

- نجحت 7 اختبارات في 4 ملفات: تفتيش البنية، سجل مراجعة العلاقات، بقاء إعدادات مختارة، وترحيل arrivals الموجود.
- نجح فحص TypeScript للموقع والخادم، وبناء الخادم. لم تُشغّل مجموعة الخادم الكاملة في هذه الدفعة.
- أعيد تشغيل جرد الخادم الكامل على قاعدة معزولة، ونتيجته مطابقة للأعداد المذكورة أعلاه.

## التنظيم الذي لم يكتمل بعد

1. مراجعة ملكية الجداول والعلاقات حسب مجالات CRM والكتالوج والعملاء والمخزون وغيرها، بما فيها العلاقات المنطقية غير المعلنة ومواضع تكرار البيانات.
2. مراجعة نقاط الفهرسة حسب الاستعلامات الفعلية وEXPLAIN، لا إضافة 75 فهرسًا آليًا.
3. توحيد التغييرات الجديدة للقاعدة على آليات ترحيل مناسبة واختبارات ترقية وبقاء بيانات؛ `runSchema` القديم يتجاهل أخطاء statements، فلا يُعامل نجاح bootstrap وحده كإثبات تطبيق كل DDL.
4. فصل الوصول للبيانات في الوظائف التي نعمل عليها وتقليل مسؤوليات `database.ts` تدريجيًا، مع اختبارات تكافؤ؛ لم يُنفّذ تفكيك شامل في هذه الدفعة.
5. توسيع اختبارات بقاء تعديلات CMS واختبارات الترقيات التاريخية والاسترجاع. لا تفسير تلقائي لفقد الإعدادات قبل التحقق من ملف الإنتاج والتخزين وعمليات التهيئة.

## الجداول الموجودة في الجرد

| الجدول | الأعمدة | الفهارس | قيود FK | مرشحو مراجعة فهرس FK |
|---|---:|---:|---:|---:|
| `admin_notifications` | 9 | 2 | 0 | 0 |
| `admin_sessions` | 6 | 3 | 1 | 0 |
| `admin_users` | 9 | 2 | 0 | 0 |
| `ai_knowledge` | 9 | 2 | 0 | 0 |
| `ai_learning_events` | 9 | 2 | 0 | 0 |
| `ai_shadow_run_records` | 34 | 7 | 0 | 0 |
| `applied_data_migrations` | 2 | 1 | 0 | 0 |
| `arrivals` | 14 | 2 | 0 | 0 |
| `assistant_feedback` | 10 | 4 | 1 | 0 |
| `assistant_support_tickets` | 14 | 4 | 2 | 1 |
| `assistant_tool_audit` | 19 | 4 | 0 | 0 |
| `assistant_tool_idempotency` | 9 | 3 | 0 | 0 |
| `audit_logs` | 21 | 6 | 0 | 0 |
| `ayrovix_lens_traces` | 4 | 2 | 0 | 0 |
| `ayweb_audit_logs` | 11 | 3 | 0 | 0 |
| `ayweb_cart_add_requests` | 8 | 3 | 0 | 0 |
| `ayweb_cart_ayrovi_links` | 6 | 3 | 0 | 0 |
| `ayweb_cart_items` | 23 | 3 | 2 | 1 |
| `ayweb_carts` | 8 | 3 | 1 | 0 |
| `ayweb_checkout_fees` | 9 | 2 | 1 | 0 |
| `ayweb_consolidations` | 5 | 2 | 2 | 1 |
| `ayweb_domain_events` | 8 | 3 | 2 | 2 |
| `ayweb_evidence` | 17 | 3 | 3 | 2 |
| `ayweb_order_items` | 21 | 2 | 3 | 2 |
| `ayweb_order_links` | 7 | 2 | 1 | 0 |
| `ayweb_orders` | 28 | 4 | 3 | 2 |
| `ayweb_packages` | 10 | 3 | 1 | 0 |
| `ayweb_payments` | 21 | 3 | 2 | 1 |
| `ayweb_product_variants` | 12 | 2 | 1 | 0 |
| `ayweb_products` | 35 | 4 | 0 | 0 |
| `ayweb_purchase_attempts` | 12 | 2 | 1 | 0 |
| `ayweb_purchase_requests` | 20 | 4 | 3 | 2 |
| `ayweb_recent_stores` | 7 | 2 | 1 | 1 |
| `ayweb_sessions` | 8 | 2 | 2 | 1 |
| `ayweb_shipping` | 15 | 2 | 1 | 0 |
| `ayweb_store_capabilities` | 4 | 1 | 1 | 0 |
| `ayweb_store_domains` | 2 | 1 | 1 | 0 |
| `ayweb_store_requests` | 14 | 2 | 2 | 2 |
| `ayweb_stores` | 16 | 2 | 0 | 0 |
| `ayweb_warehouse_items` | 11 | 2 | 1 | 1 |
| `brands` | 12 | 4 | 0 | 0 |
| `cart_items` | 22 | 3 | 1 | 0 |
| `catalogue_attribute_values` | 7 | 3 | 2 | 1 |
| `catalogue_attributes` | 12 | 2 | 0 | 0 |
| `catalogue_categories` | 9 | 5 | 1 | 0 |
| `catalogue_media` | 10 | 3 | 2 | 0 |
| `catalogue_variants` | 12 | 3 | 1 | 0 |
| `content_products` | 5 | 3 | 1 | 0 |
| `crm360_activities` | 17 | 4 | 3 | 1 |
| `crm360_communications` | 11 | 2 | 2 | 1 |
| `crm360_contacts` | 16 | 4 | 1 | 0 |
| `crm360_issues` | 18 | 5 | 3 | 1 |
| `crm360_notes` | 11 | 3 | 4 | 3 |
| `crm360_parties` | 28 | 7 | 1 | 0 |
| `crm360_party_links` | 7 | 3 | 1 | 0 |
| `crm360_relationships` | 10 | 3 | 2 | 0 |
| `crm360_status_events` | 9 | 2 | 1 | 1 |
| `crm360_tasks` | 18 | 6 | 3 | 1 |
| `crm_arrival_client_stores` | 5 | 4 | 2 | 0 |
| `crm_arrival_clients` | 7 | 3 | 3 | 2 |
| `crm_arrival_sources` | 12 | 4 | 4 | 2 |
| `crm_arrivals` | 7 | 2 | 1 | 1 |
| `crm_categories` | 10 | 4 | 0 | 0 |
| `crm_extracted_products` | 49 | 7 | 9 | 5 |
| `crm_extraction_jobs` | 25 | 5 | 4 | 1 |
| `crm_schema_migrations` | 4 | 1 | 0 | 0 |
| `crm_shipment_cartons` | 16 | 5 | 1 | 0 |
| `crm_shipment_dispatches` | 15 | 4 | 1 | 0 |
| `crm_shipments` | 34 | 4 | 1 | 0 |
| `crm_store_source_profiles` | 8 | 2 | 1 | 0 |
| `crm_stores` | 6 | 2 | 0 | 0 |
| `crm_warehouse_dispatches` | 16 | 5 | 2 | 0 |
| `customer_accounts` | 15 | 5 | 0 | 0 |
| `customer_addresses` | 13 | 2 | 1 | 0 |
| `customer_auth_identities` | 5 | 3 | 1 | 0 |
| `customer_auth_mail_jobs` | 14 | 3 | 1 | 1 |
| `customer_auth_rate_limits` | 3 | 1 | 0 | 0 |
| `customer_email_code_challenges` | 9 | 3 | 0 | 0 |
| `customer_favorites` | 8 | 4 | 2 | 1 |
| `customer_native_handoffs` | 7 | 2 | 1 | 1 |
| `customer_notifications` | 10 | 2 | 1 | 0 |
| `customer_oauth_states` | 8 | 2 | 1 | 1 |
| `customer_otp_challenges` | 10 | 3 | 0 | 0 |
| `customer_password_resets` | 7 | 2 | 1 | 0 |
| `customer_preferences` | 7 | 1 | 1 | 0 |
| `customer_push_devices` | 9 | 3 | 1 | 0 |
| `customer_push_dispatched` | 6 | 2 | 1 | 0 |
| `customer_sessions` | 8 | 3 | 1 | 0 |
| `customers` | 9 | 4 | 0 | 0 |
| `customs_categories` | 9 | 1 | 0 | 0 |
| `deliveries` | 17 | 3 | 1 | 0 |
| `discovery_markets` | 13 | 3 | 0 | 0 |
| `discovery_sources` | 15 | 4 | 0 | 0 |
| `erp_audit_changes` | 7 | 3 | 1 | 0 |
| `erp_branches` | 9 | 3 | 1 | 0 |
| `erp_departments` | 8 | 3 | 2 | 1 |
| `erp_employees` | 16 | 6 | 6 | 3 |
| `erp_events` | 8 | 3 | 0 | 0 |
| `erp_notification_deliveries` | 13 | 3 | 0 | 0 |
| `erp_organizations` | 7 | 2 | 0 | 0 |
| `erp_role_permissions` | 10 | 3 | 0 | 0 |
| `erp_sequences` | 8 | 1 | 0 | 0 |
| `erp_teams` | 8 | 3 | 2 | 1 |
| `expenses` | 9 | 2 | 0 | 0 |
| `goods_receipt_lines` | 9 | 4 | 3 | 1 |
| `goods_receipts` | 15 | 4 | 2 | 1 |
| `hero_carousel_settings` | 8 | 1 | 0 | 0 |
| `hero_events` | 7 | 2 | 0 | 0 |
| `hero_slide_drafts` | 21 | 1 | 0 | 0 |
| `hero_slides` | 21 | 2 | 0 | 0 |
| `home_blocks` | 4 | 1 | 0 | 0 |
| `home_featured_settings` | 6 | 1 | 0 | 0 |
| `inventory_stock_items` | 12 | 4 | 2 | 1 |
| `inventory_stock_movements` | 19 | 5 | 4 | 1 |
| `inventory_stocktake_lines` | 11 | 3 | 2 | 1 |
| `inventory_stocktakes` | 13 | 4 | 0 | 0 |
| `invoices` | 9 | 4 | 2 | 0 |
| `lens_analysis_cache` | 4 | 1 | 0 | 0 |
| `lens_evaluations` | 8 | 1 | 0 | 0 |
| `lens_hero_settings` | 36 | 1 | 0 | 0 |
| `lens_lab_runs` | 6 | 1 | 0 | 0 |
| `magazine_drafts` | 20 | 4 | 2 | 1 |
| `news_items` | 13 | 2 | 2 | 2 |
| `order_items` | 28 | 2 | 1 | 0 |
| `order_status_history` | 7 | 2 | 1 | 0 |
| `orders` | 43 | 6 | 3 | 1 |
| `payment_proofs` | 16 | 4 | 3 | 1 |
| `payment_transactions` | 16 | 5 | 3 | 1 |
| `payments` | 14 | 4 | 1 | 0 |
| `price_watchers` | 14 | 4 | 1 | 0 |
| `pricing_config` | 23 | 1 | 0 | 0 |
| `product_arrivals` | 2 | 1 | 2 | 1 |
| `product_profiles` | 7 | 3 | 0 | 0 |
| `products` | 31 | 7 | 1 | 1 |
| `promo_rules` | 10 | 2 | 0 | 0 |
| `promotion_arrivals` | 2 | 1 | 2 | 1 |
| `promotion_products` | 2 | 1 | 2 | 1 |
| `promotions` | 14 | 2 | 0 | 0 |
| `public_nav_items` | 8 | 1 | 0 | 0 |
| `publication_dislikes` | 3 | 1 | 1 | 1 |
| `publication_feed_settings` | 3 | 1 | 0 | 0 |
| `publication_follows` | 3 | 1 | 2 | 1 |
| `publication_preferences` | 5 | 1 | 2 | 1 |
| `publications` | 26 | 3 | 2 | 2 |
| `purchase_order_lines` | 9 | 4 | 3 | 1 |
| `purchase_orders` | 20 | 5 | 2 | 0 |
| `reels` | 15 | 2 | 2 | 2 |
| `settings` | 8 | 2 | 0 | 0 |
| `social_comment_replies` | 2 | 1 | 2 | 1 |
| `stories` | 21 | 2 | 3 | 3 |
| `stories_showcase_settings` | 12 | 1 | 0 | 0 |
| `story_interactions` | 8 | 5 | 0 | 0 |
| `story_publishers` | 8 | 2 | 0 | 0 |
| `suppliers` | 16 | 4 | 0 | 0 |

## إعادة الفحص

```bash
npm run audit:database
npx vitest run tests/schema-inspection.test.ts tests/schema-review.test.ts tests/database-reopen-preservation.test.ts tests/arrival-migration.test.ts
```

قواعد التطوير الأساسية في [اتفاق التطوير والتوسّع](DEVELOPMENT_AND_EVOLUTION_AR.md). لا يجيز هذا الجرد شراء خدمات أو ترحيل قاعدة أو حذف بيانات.

## الدفعة التالية المنفّذة

فُصلت قراءة منتجات الكتالوج والرئيسية في وحدة المجال، وأزيل التجميع العام من المسارين مع فهرسين للترتيب. التفاصيل والاختبارات وحدود القياس في [سجل فصل قراءة المنتجات](PUBLIC_PRODUCT_READ_BOUNDARY_AR.md). بقية خريطة التنظيم أعلاه لم تُنجز بالكامل.

## دفعة قراءة المحتوى المنفّذة

فُصلت قراءة قوائم Reels والمنشورات ومؤشرات صفحاتها عن HTTP بوحدة مجال مشتركة، دون تغيير المخطط أو العقود العامة. انظر [سجل فصل قراءة المحتوى](PUBLIC_SOCIAL_READ_BOUNDARY_AR.md) للتفاصيل والاختبارات وما بقي.

## دفعة التفضيلات والمتابعة المنفّذة

فُصلت كتابات تفضيلات المنشورات والمتابعة وقراءة المتابعة مع اختبارات ملكية ومعاملات وتوقيت محدود اختياري، دون تغيير المخطط. انظر [سجل التفضيلات وحدود القياس](PUBLICATION_PREFERENCE_BOUNDARY_AR.md). كتابات التفاعل وقياس موارد الإنتاج ما زالا غير منجزين.
