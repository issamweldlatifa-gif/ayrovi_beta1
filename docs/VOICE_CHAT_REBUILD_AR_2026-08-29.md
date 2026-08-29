# إعادة بناء Voice Chat من الصفر — 2026-08-29

## القرار

تم حذف تنفيذ Voice Chat السابق بدل مواصلة ترقيعه، بما في ذلك:

- `RealtimeVoiceTransport`
- مشغل TTS العام ذي طابور الجمل
- فرع `SpeechRecognition`
- أحداث المقاطعة المتداخلة
- نغمات البدء والانتهاء والمقاطعة الاصطناعية
- تبديل الحالة بين كل جملة صوتية

## البنية الجديدة

### الإدخال

```text
Microphone + Web Audio VAD
  ├→ AudioWorklet PCM16/16 kHz → Gemini Live Transcribe (primary)
  └→ complete MediaRecorder WebM/Ogg → /api/assistant/transcribe (Groq recovery)
  → finalized transcript واحد
  → رسالة مستخدم واحدة إلى Claude/AYROVI
```

### الإخراج

```text
رد Claude النصي الكامل
  → /api/assistant/voice/tts-stream
  → SSE إلى PCM16/24 kHz في Web Audio scheduler واحد
  → SpeechSynthesis utterance واحدة فقط إذا لم يبدأ PCM
  → العودة تلقائيًا إلى الاستماع
```

الملفات المسؤولة عن ذلك:

- `client/src/components/assistant/voice/VoiceChatController.ts`
- `client/src/components/assistant/voice/LiveTranscriptionTransport.ts`
- `client/public/voice-pcm-worklet.js`
- `client/src/components/assistant/voice/VoiceOutput.ts`
- `src/assistant/geminiRealtime.ts`
- `src/assistant/geminiLive.ts`
- `client/src/components/assistant/voice/types.ts`

## قواعد التشغيل

1. يبدأ الوضع بترحيب صوتي كما طلب المستخدم.
2. بعد انتهاء الترحيب يبدأ الاستماع تلقائيًا.
3. يبدأ AudioWorklet وMediaRecorder مع الاستماع. Live هو STT الأساسي، بينما يحتفظ MediaRecorder بالحاوية كاملة حتى نهاية الدور، فلا تضيع الكلمة الأولى ولا يُحذف WebM/Ogg header الضروري لـFirefox/Android إذا لزم Groq.
4. interim text لا يغادر العرض؛ finalized transcript واحد فقط يصل إلى Claude.
5. ينتهي دور المستخدم تلقائيًا بعد 750ms من الصمت ويرسل `audioStreamEnd` إلى Live.
6. أثناء التحويل إلى نص، التفكير، تحميل TTS، أو تشغيله، يتوقف MediaRecorder ويُعطّل مسار الميكروفون.
7. لا يمكن لصوت المساعد أن يفتح دور مستخدم جديد أو أن يقاطع نفسه.
8. الضغط على الكرة أثناء كلام المساعد يوقفه فورًا ويعيد الاستماع.
9. لا توجد أصوات `beep` أو `pop` اصطناعية.
10. كل رد مساعد يُنطق في عملية واحدة، بلا طابور جمل متداخل.
11. بدء عملية صوت جديدة يلغي القديمة بمعرّف عملية مستقل، لذلك لا يوجد ghost playback.

## المزودات

- STT الأساسي: `gemini-3.5-transcribe-live` عبر WSS وephemeral token مقيّد؛ لا يملك prompt أو tools أو reasoning.
- STT الاحتياطي: `GROQ_API_KEY` مع `whisper-large-v3-turbo`، ولا يُستدعى لنفس الدور إذا عاد Live بنص نهائي.
- TTS الخادمي في وضع `auto`: `GEMINI_API_KEY` مع `gemini-3.1-flash-tts-preview` عبر streaming PCM.
- TTS الحالي مؤقتًا: وضع المتصفح هو الافتراضي الآمن، و`ASSISTANT_TTS_MODE=browser` يثبّته صراحة في Render أثناء تعطل الحصة.
- TTS في المتصفح: صوت النظام، utterance واحدة كاملة بلغة النص.

لا يلزم حذف مفتاح Gemini عند اختيار وضع المتصفح. وإذا لم يجد المتصفح صوتًا يطابق العربية، يترك اختيار الصوت للنظام ولا يفرض صوتًا فرنسيًا على النص العربي.

## إعداد Render

```env
ASSISTANT_TTS_MODE=browser
GROQ_API_KEY=...
GROQ_STT_MODEL=whisper-large-v3-turbo
ASSISTANT_REALTIME_TRANSCRIPTION=auto
GEMINI_LIVE_TRANSCRIBE_MODEL=gemini-3.5-transcribe-live
GEMINI_LIVE_QUOTA_COOLDOWN_MS=900000
GEMINI_API_KEY=...
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_TIMEOUT_MS=20000
GEMINI_TTS_QUOTA_COOLDOWN_MS=3600000
```

الفحص:

```bash
curl https://YOUR-DOMAIN/api/assistant/status
```

في الوضع المؤقت الحالي يجب أن تكون:

```json
{
  "speechToTextReady": true,
  "batchSpeechToTextReady": true,
  "liveTranscriptionReady": true,
  "serverTextToSpeechReady": false,
  "clientSpeechFallback": true,
  "ttsMode": "browser",
  "geminiTtsReady": false
}
```

إذا فشل bootstrap أو فُتح Live quota circuit تصبح `liveTranscriptionReady:false` بينما يبقى `batchSpeechToTextReady:true` ويستمر Groq تلقائيًا.

بعد عودة حصة Gemini، تغيير `ASSISTANT_TTS_MODE` إلى `auto` يعيد TTS الخادمي من دون تغيير المفاتيح. إذا أعاد Gemini HTTP 429، يفتح الخادم circuit لمدة `Retry-After` أو ساعة افتراضيًا، ويصدر `TTS_QUOTA_EXCEEDED` للمراقبة فقط من دون عرضه في واجهة المستخدم أو تكرار الطلب في كل دور.

قرار الانتقال إلى realtime موثق في `docs/REALTIME_VOICE_ARCHITECTURE_AR_2026-08-29.md`.

## التحقق

- اختبارات دورة الاستماع والتسجيل وpre-roll.
- اختبار توقف التسجيل وتعطيل الميكروفون طوال إخراج الصوت.
- اختبار العودة التلقائية إلى الاستماع بعد الرد.
- اختبار الإلغاء دون حالة `Interrompu` أو loop.
- اختبار تشغيل خادمي واحد ومنع ghost playback.
- اختبار fallback محلي واحد واحترام لغة النص وعدم قطع الرد الطويل.
- اختبار الانتقال إلى fallback عند انتهاء مهلة TTS الخادمي.
- اختبارات PCM/WAV ومسارات STT/TTS الخادمية.
- اختبارات ephemeral-token security، Live interim/final/backpressure/renewal/fallback ومنع الدور المكرر.
- اختبارات streaming PCM ordering، إلغاء العملية كاملة، وTTS 429 circuit بلا retry.
- TypeScript للخادم والواجهة.
- Production build.
- المجموعة الكاملة: **240/240 اختبارًا ناجحًا** مع TypeScript وproduction build.
- الاختبار الفيزيائي Firefox/mobile وسماع Gemini TTS ما زالا مطلوبين قبل إعلان Voice مكتملًا.
