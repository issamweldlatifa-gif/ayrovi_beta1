import type { ImageErrorCode } from './prepareImage';
import type { VoiceNoteError } from './VoiceNoteCapture';
export const imageErrorLabels: Record<ImageErrorCode, readonly [string, string]> = {
  limit: ['Deux images au maximum, y compris celles en préparation.', 'صورتان كحد أقصى، بما فيهما الصور قيد التجهيز.'],
  format: ['Image non reconnue. Utilisez un fichier JPEG, PNG, WebP ou GIF valide.', 'الصورة غير معروفة. استخدم ملف JPEG أو PNG أو WebP أو GIF صالحًا.'],
  large: ['Image trop volumineuse (maximum 5 Mo).', 'حجم الصورة كبير جدًا (الحد الأقصى 5 ميغابايت).'],
  'prepared-large': ['L’image reste trop volumineuse après préparation. Réduisez sa taille puis réessayez.', 'بقي حجم الصورة كبيرًا بعد تجهيزها. صغّرها ثم أعد المحاولة.'],
  unreadable: ['Impossible de préparer cette image. Aucun fichier n’a été ajouté.', 'تعذّر تجهيز هذه الصورة. لم يُضف أي ملف.'],
  timeout: ['La préparation de l’image a dépassé le délai. Réessayez.', 'انتهت مهلة تجهيز الصورة. أعد المحاولة.'],
};
export const voiceNoteErrorLabels: Record<VoiceNoteError, readonly [string, string]> = {
  unsupported: ['L’enregistrement vocal est indisponible dans ce navigateur.', 'التسجيل الصوتي غير متاح في هذا المتصفح.'],
  permission: ['Autorisez le microphone pour enregistrer un message vocal.', 'اسمح باستعمال الميكروفون لتسجيل رسالة صوتية.'],
  microphone: ['Microphone indisponible. Réessayez.', 'الميكروفون غير متاح. أعد المحاولة.'],
  recording: ['Impossible de terminer l’enregistrement. Aucun message n’a été envoyé.', 'تعذّر إنهاء التسجيل. لم تُرسل أي رسالة.'],
  short: ['Enregistrement trop court. Aucun message n’a été envoyé.', 'التسجيل قصير جدًا. لم تُرسل أي رسالة.'],
  large: ['Enregistrement trop volumineux (maximum 12 Mo). Aucun message n’a été envoyé.', 'التسجيل كبير جدًا (الحد الأقصى 12 ميغابايت). لم تُرسل أي رسالة.'],
  transcription: ['Impossible de transcrire cet enregistrement. Aucun message n’a été envoyé.', 'تعذّر تحويل هذا التسجيل إلى نص. لم تُرسل أي رسالة.'],
  empty: ['Aucune parole détectée. Aucun message n’a été envoyé.', 'لم يُكتشف كلام في التسجيل. لم تُرسل أي رسالة.'],
  timeout: ['La transcription a dépassé le délai. Aucun message n’a été envoyé.', 'انتهت مهلة تحويل الصوت إلى نص. لم تُرسل أي رسالة.'],
};
