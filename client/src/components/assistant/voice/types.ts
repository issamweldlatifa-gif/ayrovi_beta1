export type VoiceChatState =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'user_speaking'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';
