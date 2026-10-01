# Lens «الروابط أولاً» (Link-First)

## القاعدة
SerpAPI يعطينا **الرابط فقط**. السعر، الصور، التوفّر، المقاس/السعة/النوع كلّها تتقرا من **صفحة التاجر** وتدخل لمحرّك الحساب متاع AYROVI (تحويل، رسوم، تخفيض) قبل ما تتعرض.

```
SerpAPI google_lens ─► روابط تجّار فقط (linkSource.ts)
   ─► قراءة الصفحة (scraper.scrapeParsedPage) ─► حقائق (pageFacts.ts)
   ─► تحقّق من الهوية (titleMatch: الصفحة تحكي على نفس المنتج؟)
   ─► محرّك الأسعار (pricingEngine.ts → estimateWithDb / promo)
   ─► عقد الطلب (recordVariantContract) ─► بطاقة الشبكة ─► البطاقة الكبيرة
```

الكود: `src/ayrovix/linkFirst/` (`linkEngine.resolveLinks` هو القلب).
بوّابة موحّدة للمستعملين الآخرين (المساعد): `linkFirst/visualMatches.ts`.

## النظام القديم (معزول)
`src/ayrovix/legacy/` فيه `lensEnrichment` و`productEnrichment` (أسعار/وصف/مقاسات من SerpAPI). ما يتنفّذوش إلا بـ:

```
AYROVI_LENS_SOURCE=legacy
```

الافتراضي = `links`. اختبار معماري (`tests/lens-link-first.test.ts`) يمنع أي ملف خارج `legacy/` يستورد النظام القديم.

## متغيّرات البيئة
| المتغيّر | الافتراضي | المعنى |
|---|---|---|
| `AYROVI_LENS_SOURCE` | `links` | `legacy` يرجّع النظام القديم |
| `AYROVI_LINKS_BUDGET` | 8 | أقصى عدد صفحات تتزار لكل بحث |
| `AYROVI_LINKS_CONCURRENCY` | 4 | قراءات متوازية |
| `AYROVI_LINKS_DEADLINE_MS` | 8000 | بعدها نعرض اللي حضر |
| `AYROVI_LINKS_TTL_MS` | 3600000 | عمر السعر المخزّن (ساعة) |
| `AYROVI_LINKS_MATCH_THRESHOLD` | 0.5 | حدّ تطابق العنوان |
| `AYROVI_LINKS_CACHE_DIR` / `AYROVI_LINKS_CACHE=false` | `data/lens-link-facts` | الكاش |

## المقايضة
صفحة التاجر لو حجبتنا (anti-bot) أو ما فيهاش سعر → **ما فيه بطاقة** (ما نرجّعوش سعر SerpAPI كحلّ بديل). النتيجة أدقّ لكن ممكن تكون أقلّ عدداً.
