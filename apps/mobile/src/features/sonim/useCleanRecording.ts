/** Owned, foreground-only microphone capture; uses the existing authenticated STT API. */
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useSessionId } from '@/session/session';
import { apiSend } from '@/api/client';
import type { AudioRecorder } from 'expo-audio';

// Only the current capture owner may restore the process-wide audio mode.
let activeAudioOwner: symbol | null = null;

export function useCleanRecording(owner: string, onText: (text: string) => void) {
  const sessionId = useSessionId();
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState(false);
  const recorder = useRef<AudioRecorder | null>(null);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0), busy = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lease = useRef<symbol | null>(null);
  const callback = useRef(onText); callback.current = onText;
  const clean = async (r: AudioRecorder | null, token: symbol | null) => {
    const uri = r?.uri;
    try { r?.release(); } catch { /* already released */ }
    if (uri && Platform.OS !== 'web') { try { const { File } = require('expo-file-system') as typeof import('expo-file-system'); new File(uri).delete(); } catch { /* temporary cache cleanup best effort */ } }
    if (token && activeAudioOwner === token) {
      activeAudioOwner = null;
      try { const audio = require('expo-audio') as typeof import('expo-audio'); await audio.setAudioModeAsync({ allowsRecording: false }); } catch { /* shutdown */ }
    }
  };
  const cancel = () => {
    generation.current++; busy.current = false; abort.current?.abort(); abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    const r = recorder.current; recorder.current = null;
    const token = lease.current;
    if (r) void r.stop().catch(() => {}).finally(() => clean(r, token));
    else void clean(null, token);
    setState('idle');
  };
  useEffect(() => {
    const listener = AppState.addEventListener('change', s => { if (s !== 'active') cancel(); });
    return () => { listener.remove(); cancel(); };
    // Ownership change discards pending OS permission replies and in-flight transcription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);
  const finish = async () => {
    const r = recorder.current;
    if (!r || state !== 'recording') return;
    recorder.current = null;
    if (timer.current) clearTimeout(timer.current);
    const id = generation.current, token = lease.current;
    setState('transcribing');
    try {
      await r.stop();
      if (id !== generation.current || !r.uri) return;
      const form = new FormData();
      if (Platform.OS === 'web') { const blob = await (await fetch(r.uri)).blob(); form.append('audio', blob, 'clean-voice.webm'); }
      else form.append('audio', { uri: r.uri, name: 'clean-voice.m4a', type: 'audio/mp4' } as unknown as Blob);
      const controller = new AbortController(); abort.current = controller;
      const result = await apiSend<{ text: string }>('POST', '/api/assistant/transcribe', { form, signal: controller.signal, timeoutMs: 60000, headers: sessionId ? { 'x-session-id': sessionId } : {} });
      if (id === generation.current && result.data?.text?.trim()) callback.current(result.data.text.trim());
    } catch { if (id === generation.current) setError(true); }
    finally { await clean(r, token); if (id === generation.current) { busy.current = false; setState('idle'); } }
  };
  const start = async () => {
    if (busy.current) return;
    busy.current = true; setState('starting'); setError(false);
    const id = ++generation.current, token = Symbol('clean-recording');
    lease.current = token;
    let r: AudioRecorder | null = null;
    try {
      const audio = require('expo-audio') as typeof import('expo-audio');
      const permission = await audio.requestRecordingPermissionsAsync();
      if (id !== generation.current) return;
      if (!permission.granted) throw new Error('permission');
      activeAudioOwner = token;
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (id !== generation.current) { await clean(null, token); return; }
      r = new audio.AudioModule.AudioRecorder(audio.RecordingPresets.HIGH_QUALITY);
      await r.prepareToRecordAsync();
      if (id !== generation.current) { await clean(r, token); return; }
      recorder.current = r; r.record({ forDuration: 120 }); setState('recording');
      timer.current = setTimeout(() => { cancel(); setError(true); }, 120000);
    } catch { await clean(r, token); if (id === generation.current) { setError(true); setState('idle'); busy.current = false; } }
  };
  return { state, error, start, finish, cancel };
}
