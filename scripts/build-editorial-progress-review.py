from pathlib import Path
import base64,html
root=Path(__file__).resolve().parents[1]
def uri(p,mime):return 'data:'+mime+';base64,'+base64.b64encode((root/p).read_bytes()).decode()
shots=[
 ('الرئيسية · عربي','customer/home-ar-390.png'),
 ('الرئيسية · فرنسي','customer/home-fr-390.png'),
 ('الدخول · عربي','customer/auth-ar-390.png'),
 ('الحساب · حساب اختبار','account/home-fr.png'),
 ('القائمة · عربي','customer/menu-ar-390.png'),
 ('SONIM · عربي','customer/sonim-ar-390.png'),
 ('SONIM · فرنسي','customer/sonim-fr-390.png'),
 ('Lens · عربي','customer/lens-ar-390.png'),
 ('Lens · فرنسي','customer/lens-fr-390.png'),
 ('الاستعادة · بيانات اختبار','auth-functional/request-ar.png'),
 ('الإعدادات · بيانات اختبار','account/preferences-ar.png'),
 ('SONIM · وضع داكن / ارتفاع قصير','customer/sonim-dark-short.png'),
]
# A run may not include an optional secondary screenshot; report only existing evidence.
shots=[(title,file) for title,file in shots if (root/'screenshots/editorial'/file).exists()]
font=uri(Path('client/public/fonts/editorial/noto-sans-arabic.woff2'),'font/woff2')
logo=uri(Path('client/public/media/logo-ayrovi.png'),'image/png')
cards=''.join('<figure><figcaption>'+html.escape(title)+'</figcaption><img loading="lazy" src="'+uri(Path('screenshots/editorial')/file,'image/png')+'" alt="'+html.escape(title)+'"></figure>' for title,file in shots)
content='''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AYROVI — التطبيق الفعلي / الدفعة 02</title><style>
@font-face{font-family:Body;src:url(FONT) format('woff2');font-weight:100 900;font-display:swap}*{box-sizing:border-box}body{margin:0;background:#fff;color:#272322;font:15px/1.9 Body,sans-serif}header,main{max-width:1220px;margin:auto;padding:24px}header{border-bottom:1px solid #ddd9d5;display:flex;align-items:center;gap:16px}header img{width:48px;height:48px}header span{margin-inline-start:auto;font-size:12px;letter-spacing:.1em}h1{font-size:30px;font-weight:500;line-height:1.6;margin:24px 0 8px}h1:before{content:'';display:inline-block;width:6px;height:6px;background:#ff7900;margin-inline-end:12px}p{max-width:850px;color:#716c67}.metrics{display:grid;grid-template-columns:repeat(4,1fr);border-block:1px solid #ddd9d5;margin:32px 0}.metrics div{padding:20px;border-inline-end:1px solid #ddd9d5}.metrics b{display:block;font:400 30px/1.5 system-ui}.metrics small{font-size:12px}.note{background:#f6f5f3;border:1px solid #ddd9d5;padding:20px;margin-bottom:32px}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}figure{margin:0;border:1px solid #ddd9d5}figcaption{font-size:13px;padding:12px;border-bottom:1px solid #ddd9d5}figure img{display:block;width:100%;height:auto}footer{border-top:1px solid #ddd9d5;margin-top:32px;padding:24px 0;font-size:13px;color:#716c67}@media(max-width:850px){.gallery{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.gallery{grid-template-columns:1fr}main,header{padding:16px}h1{font-size:25px}}
</style></head><body><header><img src="LOGO" alt="شعار AYROVI الأصلي"><strong>AYROVI</strong><span>ÉDITORIAL / 02</span></header><main><h1>من المرجعية إلى التطبيق.</h1><p>هذه لقطات من واجهات الموقع المبني والمختبَر محليًا، وليست صور تصميم مولّدة. الهوية تعمل في التطبيق، مع بقاء الشعار والتنقل ووظائف الحساب. بيانات الحساب المعروضة تجريبية داخل قاعدة معزولة.</p><div class="metrics"><div><b>935</b><small>اختبارًا ناجحًا · 67 ملفًا</small></div><div><b>225</b><small>فحصًا للشاشات الفعلية</small></div><div><b>82</b><small>فحص حساب / API / قاعدة بيانات</small></div><div><b>≈1.42%</b><small>أعلى قراءة برتقالي في اللقطات المقاسة</small></div></div><div class="note"><strong>حدود هذه الدفعة</strong><p>الرئيسية والدخول والحساب والقائمة وAbout وإطار SONIM ومدخل Lens رُحّلت. حالات النتائج الغنية، الصوت والكاميرا الفعلية، الاكتشاف والتجارة المركبة ما زالت تحتاج استكمالًا ومراجعة مخصّصة. قياس البرتقالي بعِتبات لونية موثقة للّقطات المختبرة، لا شهادة لكل الموقع. هذه معاينة محلية ولا تثبت نشر الإنتاج.</p></div><div class="gallery">CARDS</div><footer>نجح أيضًا 208 فحوص للدخول و23 فحصًا للاستعادة ومسار البريد. مزوّدو OAuth والبريد الخارجي محاكون في هذه الفحوص؛ لا ادعاء بتسجيل دخول أو وصول بريد أو دفع حقيقي.</footer></main></body></html>'''
# Single substitution pass: never replace substrings inside embedded base64.
import re
mapping={'FONT':font,'LOGO':logo,'CARDS':cards}
content=re.sub(r'FONT|LOGO|CARDS',lambda m:mapping[m[0]],content)
p=root/'docs/editorial/PHASE_02_REVIEW.html';p.write_text(content);print(p)
