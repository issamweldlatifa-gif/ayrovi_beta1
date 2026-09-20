export type VoiceId = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir';
export interface VoiceOutputSettings {
  voiceId: VoiceId;
  gender: 'female' | 'male';
  rate: number;
}
export const DEFAULT_VOICE_SETTINGS: Readonly<VoiceOutputSettings> = Object.freeze({ voiceId: 'Aoede', gender: 'female', rate: 1.05 });
export const VOICE_PRESETS = [
  { id: 'Aoede', gender: 'female', fr: 'Féminine', ar: 'أنثوي' },
  { id: 'Kore', gender: 'female', fr: 'Féminine douce', ar: 'أنثوي هادئ' },
  { id: 'Puck', gender: 'male', fr: 'Masculine', ar: 'ذكوري' },
  { id: 'Fenrir', gender: 'male', fr: 'Masculine calme', ar: 'ذكوري هادئ' },
] as const;
export const VOICE_RATES = [.9, 1, 1.05, 1.1, 1.25] as const;
