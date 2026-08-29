export type VoiceState =
  | 'idle'
  | 'initializing'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'processing'
  | 'tool_execution'
  | 'assistant_speaking'
  | 'interrupted'
  | 'muted'
  | 'error'
  | 'closing';

export interface VoiceSessionConfig {
  sessionId: string;
  conversationId: string;
  voice: {
    id: string;
    name: string;
    language: string;
    gender: 'female' | 'male';
    provider: string;
    rate: number;
    pitch: number;
  };
  audioInput: {
    format: string;
    sampleRate: number;
    channelCount: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  turnDetection: {
    type: string;
    speechStartThreshold: number;
    silenceThreshold: number;
    silenceDurationMs: number;
    prefixPaddingMs: number;
  };
  capabilities: {
    vision: boolean;
    pricingCalculator: boolean;
    orderTracking: boolean;
    orderCreation: boolean;
    realtimeStreaming: boolean;
    instantBargeIn: boolean;
  };
}

export type RealtimeVoiceEvent =
  | { type: 'state.changed'; state: VoiceState }
  | { type: 'input_audio.level'; level: number }
  | { type: 'output_audio.level'; level: number }
  | { type: 'speech.started' }
  | { type: 'speech.stopped'; durationMs: number }
  | { type: 'transcript.delta'; text: string }
  | { type: 'transcript.completed'; text: string }
  | { type: 'response.started' }
  | { type: 'response.audio.delta'; text: string }
  | { type: 'response.completed' }
  | { type: 'tool.started'; name: string }
  | { type: 'tool.completed'; name: string; data: any }
  | { type: 'interrupted' }
  | { type: 'error'; code: string; message: string };
