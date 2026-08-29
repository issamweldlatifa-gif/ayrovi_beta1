# قرار معمارية AYROVI Realtime Voice

**التاريخ:** 2026-08-29

**الحالة:** منفّذ برمجيًا خلف بوابات fail-closed — التحقق الفعلي من quota والصوت على Firefox/mobile ما زال إلزاميًا قبل إعلان الاكتمال

**القاعدة غير القابلة للتفاوض:** Claude هو عقل AYROVI الوحيد، ومزوّد الصوت لا يملك قرار الحوار أو الأدوات.

## 1. الحالة الفعلية الآن

أصبح مسار الكود:

```text
Microphone
  ├→ AudioWorklet PCM16 mono/16 kHz → Gemini 3.5 Transcribe Live
  └→ complete MediaRecorder container → Groq Whisper (recovery only)
             ↓ one finalized transcript only
  Claude AYROVI Agent + Tools
             ↓ one final answer
  ├→ Gemini 3.1 Flash TTS SSE → PCM 24 kHz scheduler (when enabled/healthy)
  └→ Browser SpeechSynthesis (automatic recovery/current production mode)
             ↓
          Speaker
```

- الخادم يصدر token قصير العمر، single-use، ومقيّدًا بالموديل وإخراج `TEXT` و`inputAudioTranscription` فقط.
- المتصفح يتصل بـGoogle WSS بهذا token؛ مفتاح Gemini الدائم لا يصل إلى bundle أو browser API.
- interim transcript للعرض فقط. الدالة الوحيدة التي تمرر finalized text إلى Claude محمية من التكرار.
- MediaRecorder يبدأ من أول لحظة استماع ويحفظ WebM/Ogg كاملًا، لكنه لا يُرفع إلى Groq إذا نجح Live.
- جلسة Live تتجدد قبل حد العشر دقائق أو عند `goAway`، وبين الأدوار فقط.
- TTS يستخدم طلب `streamGenerateContent?alt=sse` واحدًا، وbinary PCM scheduler واحدًا قابلًا للإلغاء؛ لا sentence queues.
- وضع الإخراج المنشور يبقى `ASSISTANT_TTS_MODE=browser` إلى أن تثبت quota. لذلك كود streaming جاهز لكنه يفشل مغلقًا إلى Browser SpeechSynthesis.
- أول Gemini TTS 429 يفتح circuit ولا توجد إعادة فورية أو محاولة جديدة لكل دور.
- رد Claude يبقى ظاهرًا كنص مهما فشل النقل أو الإخراج الصوتي.

## 2. تشخيص Gemini TTS الحالي

| الحقل | القيمة المؤكدة من الكود والوثائق الرسمية |
|---|---|
| Provider | Google Gemini Developer API |
| Model | `gemini-3.1-flash-tts-preview` |
| Endpoint | `POST /v1beta/models/{model}:generateContent` |
| Input | Text |
| Output | Raw PCM 16-bit / 24 kHz، ويحوّله AYROVI إلى WAV |
| Runtime result السابق | HTTP 429 / quota exceeded |
| Project identity | غير قابلة للاستخراج بأمان من API key داخل التطبيق |
| Quota tier | يجب تأكيدها من Google AI Studio للمشروع نفسه |

HTTP 429 يثبت وصول الطلب وقبول مسار المصادقة مبدئيًا، لكنه لا يحدد وحده هل السبب RPM أو TPM أو RPD أو spend limit أو عدم إتاحة الحصة لهذا الـpreview model.

## 3. حماية 429

عند تفعيل `ASSISTANT_TTS_MODE=auto`:

1. أول HTTP 429 يفتح circuit breaker.
2. يسجّل الخادم فقط:
   - `TTS_QUOTA_EXCEEDED`
   - HTTP status
   - model
   - وقت أول probe مسموح بعده
3. لا يُعاد الاتصال بـGemini لكل دور مستخدم أثناء مدة الحظر.
4. مدة الحظر الافتراضية ساعة، أو قيمة `Retry-After` إذا أرسلها المزود.
5. API يعيد fallback منظمًا، ولا يعرض للمستخدم `HTTP 429` أو نص quota.
6. المحادثة النصية لا تتوقف، ويعمل Browser SpeechSynthesis كإخراج احتياطي واحد.

متغير التشغيل:

```env
GEMINI_TTS_QUOTA_COOLDOWN_MS=3600000
```

## 4. القرار المعماري

### مرفوض: Gemini Live Agent كعقل حوار ثانٍ

`gemini-3.1-flash-live-preview` هو Audio-to-Audio conversational model: يستمع ويفكر ويولّد الرد الصوتي. وضعه مباشرة بين الميكروفون والسماعة سيجعل Gemini مشاركًا في قرار الرد، حتى لو استُخدم Claude كأداة. هذا يخالف شرط:

```text
Claude = Reasoning / Agent Brain
```

كما أن مطالبة Live Agent بقراءة نص Claude حرفيًا ليست ضمانًا بروتوكوليًا؛ يمكن للنموذج أن يعيد الصياغة أو يضيف كلامًا.

### مقبول: Dedicated Live Transcription + Claude + Streaming TTS

المسار الهدف هو:

```text
Microphone (PCM stream)
  ↓
Gemini 3.5 Transcribe Live (STT only — no assistant)
  ↓  interim + one finalized transcript
Claude AYROVI Agent
  ↓
AYROVI Tools / AYROVIX / Orders / Tracking / CRM
  ↓  one authoritative final answer
Gemini 3.1 Flash TTS streaming (voice rendering only)
  ↓
One PCM playback operation
  ↓
Speaker
```

الموديل المقترح للإدخال:

```text
gemini-3.5-transcribe-live
```

Google يعرّفه كـdedicated speech-recognition pipeline وليس conversational agent؛ لذلك لا ينشئ مساعدًا ثانيًا.

## 5. حدود كلمة “Realtime” بوجود Claude كعقل وحيد

- الإدخال يمكن أن يكون realtime فعلًا: PCM chunks مع interim transcripts أثناء الكلام.
- Claude يبقى مسؤولًا عن الرد والأدوات عبر مساره الحالي.
- `gemini-3.1-flash-tts-preview` يستطيع stream **output audio** لطلب نص واحد، لكنه لا يستقبل Claude tokens تدريجيًا داخل نفس طلب TTS.
- المرحلة الآمنة الأولى تنتظر جواب Claude الكامل، ثم تبدأ طلب TTS streaming واحد وتُشغّل PCM فور وصوله.
- إذا أصبح بدء الصوت قبل اكتمال جواب Claude شرطًا إلزاميًا، نحتاج pure streaming-TTS WebSocket يقبل incremental text، أو buffering لعبارات مستقرة داخل **عملية تشغيل واحدة**. لا نستخدم Gemini Live Agent لإخفاء هذه الفجوة.

## 6. Gate إلزامي قبل تحويل TTS إلى `auto` وقبل إعلان Voice مكتملًا

محاولة Live STT آمنة لأنها تسقط تلقائيًا إلى Groq، لكن لا يجوز رفع TTS من `browser` أو إعلان الاكتمال قبل فحص المشروع نفسه في Google AI Studio، دون إرسال أي API key:

1. اسم المشروع ورقمه.
2. الـAPI key المستخدم في Render ينتمي إلى المشروع نفسه.
3. Billing account مربوط وفعال.
4. Usage tier الحالي.
5. الحدود والاستهلاك لـ:
   - `gemini-3.1-flash-tts-preview`
   - `gemini-3.5-transcribe-live`
6. RPM / TPM / RPD وأي spend-based limit.
7. تجربة صوت ناجحة واحدة من AI Studio لكل موديل مطلوب.

الرابط الرسمي:

```text
https://aistudio.google.com/rate-limit?timeRange=last-28-days
```

## 7. خطة التنفيذ المرحلية

### Phase 0 — Safe fallback (منجزة)

- Groq STT يعمل.
- Claude والأدوات يعملان.
- Browser SpeechSynthesis يعمل.
- Gemini server TTS معطل افتراضيًا.
- لا يظهر 429 للمستخدم.

### Phase 1 — Realtime STT transport (منجزة برمجيًا)

- Backend يصدر ephemeral token قصير العمر ومقيّدًا حصريًا بـ`gemini-3.5-transcribe-live`.
- لا يصل Gemini API key الدائم إلى المتصفح.
- AudioWorklet يحوّل الميكروفون إلى PCM16 mono.
- إرسال chunks تقارب 100ms.
- Hybrid VAD: server VAD + client `audioStreamEnd`.
- `silenceDurationMs` بين 500 و800ms.
- عرض interim transcript فقط للمعاينة.
- إرسال finalized transcript واحد فقط إلى Claude لكل دور.

### Phase 2 — Claude orchestration (منجزة؛ لم تتغير ملكية العقل أو الأدوات)

- لا تغيير في ملكية reasoning.
- نفس conversation ID، session ID، history وtools.
- لا يستدعي Gemini أي أداة AYROVI.
- cancellation operation ID يمنع ghost responses.

### Phase 3 — Streaming voice renderer (منجزة برمجيًا؛ production gate ما زال `browser`)

- جواب Claude النهائي يدخل طلب TTS streaming واحدًا.
- PCM 24kHz يصل إلى Web Audio scheduler ويُشغّل كعملية واحدة.
- لا sentence queue، ولا تغيير حالة بين audio chunks.
- interruption يلغي request ويصفّر كل queued PCM فورًا.
- عند 429 أو decode failure: النص يبقى، ثم browser fallback واحد فقط.

### Phase 4 — Resilience (النقل والحماية منجزان؛ القياسات والاختبار الفيزيائي باقيان)

- Ephemeral token: one use، بدء session خلال دقيقة، انتهاء قصير.
- `gemini-3.5-transcribe-live` محدود حاليًا بعشر دقائق لكل session؛ يُجدّد الاتصال قبل الحد مع الحفاظ على دورة المحادثة في AYROVI.
- session resumption حيث يدعمها المسار، وإعادة اتصال مضبوطة من دون تكرار finalized transcript.
- timeouts وحدود buffer وbackpressure.
- circuit breaker مستقل لكل provider/model.
- metrics للزمن: speech end → final transcript → Claude first/final token → first audio → playback end.

## 8. State machine المطلوبة

```text
IDLE
→ STARTING
→ LISTENING
→ USER_SPEAKING
→ FINALIZING_TRANSCRIPT
→ CLAUDE_THINKING
→ TTS_CONNECTING
→ SPEAKING
→ LISTENING
```

قواعد ثابتة:

- لا يُرسل finalized transcript أكثر من مرة.
- لا يُسمح لصوت المساعد بالدخول إلى STT.
- لا يوجد TTS retry فوري عند 429.
- أي interruption يلغي كل العمليات الأقدم بمعرّف العملية.
- fallback لا ينشئ utterance ثانية إذا بدأ إخراج صوتي بالفعل.

## 9. مصفوفة القبول

1. Firefox Android وChrome Android وSafari iOS وChrome desktop.
2. العربية التونسية والفرنسية والإنجليزية وcode-switching.
3. عدم ضياع أول مقطع صوتي.
4. interim transcript لا يُرسل إلى Claude.
5. finalized transcript واحد فقط.
6. Claude وحده يولّد الرد ويستدعي الأدوات.
7. first audio قابل للقياس، والصوت كامل غير مقطوع.
8. barge-in يوقف التشغيل فورًا بلا echo loop.
9. 429 واحد يفتح circuit ولا يولّد شبكة طلبات متكررة.
10. فشل الصوت لا يحذف جواب Claude النصي.

## 10. نتيجة التحقق الحالية

منجز آليًا:

- token constraints وعدم تسريب المفتاح الدائم.
- PCM 16 kHz، interim/final lifecycle، backpressure، `goAway` renewal، وفشل مغلق إلى batch STT.
- finalized transcript واحد يؤدي إلى callback واحد، ونجاح Live يمنع Groq upload لنفس الدور.
- proxy لـSSE TTS يحافظ على ترتيب PCM، وWeb Audio يلغي جميع المصادر المجدولة كعملية واحدة.
- أول TTS 429 يؤدي إلى provider fetch واحد عبر دورين ثم Browser fallback.
- half-duplex، إلغاء العمليات القديمة، وسلامة Firefox/Android complete-container fallback.

غير منجز خارجيًا بعد:

- إثبات quota الفعلية لـLive Transcribe وGemini TTS على مشروع Render.
- سماع رد Assistant فعلي كامل من Gemini TTS.
- مرور التدفق الفيزيائي على Firefox Android/mobile. لذلك لا تزال صفة “Voice complete” ممنوعة.

## 11. مراجع Google الرسمية

- Live API overview: https://ai.google.dev/gemini-api/docs/live-api
- Live Transcription: https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
- Live API capabilities: https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Ephemeral tokens: https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
- Gemini TTS: https://ai.google.dev/gemini-api/docs/speech-generation
- Rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Pricing: https://ai.google.dev/gemini-api/docs/pricing
