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

يوجد مساران واضحان فقط:

### الإدخال

```text
Microphone
  → Web Audio VAD
  → pre-roll يحفظ أول كلمة
  → MediaRecorder
  → /api/assistant/transcribe
  → رسالة مستخدم واحدة
```

### الإخراج

```text
رد المساعد النصي الكامل
  → /api/assistant/voice/tts
  → تشغيل ملف صوت واحد
  → SpeechSynthesis واحد فقط عند غياب TTS الخادمي
  → العودة تلقائيًا إلى الاستماع
```

الملفات الجديدة المسؤولة عن ذلك:

- `client/src/components/assistant/voice/VoiceChatController.ts`
- `client/src/components/assistant/voice/VoiceOutput.ts`
- `client/src/components/assistant/voice/types.ts`

## قواعد التشغيل

1. يبدأ الوضع بترحيب صوتي كما طلب المستخدم.
2. بعد انتهاء الترحيب يبدأ الاستماع تلقائيًا.
3. يحتفظ التسجيل بآخر ثانية تقريبًا قبل تأكيد VAD حتى لا تضيع الكلمة الأولى.
4. ينتهي دور المستخدم تلقائيًا بعد 750ms من الصمت.
5. أثناء التحويل إلى نص، التفكير، تحميل TTS، أو تشغيله، يتوقف MediaRecorder ويُعطّل مسار الميكروفون.
6. لا يمكن لصوت المساعد أن يفتح دور مستخدم جديد أو أن يقاطع نفسه.
7. الضغط على الكرة أثناء كلام المساعد يوقفه فورًا ويعيد الاستماع.
8. لا توجد أصوات `beep` أو `pop` اصطناعية.
9. كل رد مساعد يُنطق في عملية واحدة، بلا طابور جمل متداخل.
10. بدء عملية صوت جديدة يلغي القديمة بمعرّف عملية مستقل، لذلك لا يوجد ghost playback.

## المزودات

- STT: `GROQ_API_KEY` مع `whisper-large-v3-turbo`.
- TTS الأساسي: `GEMINI_API_KEY` مع `gemini-3.1-flash-tts-preview`.
- TTS الاحتياطي: صوت النظام في المتصفح، utterance واحدة بلغة النص.

إذا لم يجد المتصفح صوتًا يطابق العربية، يترك اختيار الصوت للنظام ولا يفرض صوتًا فرنسيًا على النص العربي.

## إعداد Render

```env
GROQ_API_KEY=...
GROQ_STT_MODEL=whisper-large-v3-turbo
GEMINI_API_KEY=...
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
GEMINI_TTS_TIMEOUT_MS=20000
```

الفحص:

```bash
curl https://YOUR-DOMAIN/api/assistant/status
```

لصوت خادمي طبيعي يجب أن تكون:

```json
{
  "speechToTextReady": true,
  "serverTextToSpeechReady": true,
  "geminiTtsReady": true
}
```

## التحقق

- اختبارات دورة الاستماع والتسجيل وpre-roll.
- اختبار توقف التسجيل وتعطيل الميكروفون طوال إخراج الصوت.
- اختبار العودة التلقائية إلى الاستماع بعد الرد.
- اختبار الإلغاء دون حالة `Interrompu` أو loop.
- اختبار تشغيل خادمي واحد ومنع ghost playback.
- اختبار fallback محلي واحد واحترام لغة النص وعدم قطع الرد الطويل.
- اختبار الانتقال إلى fallback عند انتهاء مهلة TTS الخادمي.
- اختبارات PCM/WAV ومسارات STT/TTS الخادمية.
- TypeScript للخادم والواجهة.
- Production build.
- المجموعة الكاملة: **224/224 اختبارًا ناجحًا**.
