export type VoiceNoteState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'transcribing';
export type VoiceNoteError = 'unsupported' | 'permission' | 'microphone' | 'recording' | 'short' | 'large' | 'transcription' | 'empty' | 'timeout';
interface Options {
  onState: (state: VoiceNoteState) => void;
  onSeconds: (seconds: number) => void;
  onText: (text: string) => void;
  onError: (error: VoiceNoteError) => void;
  transcribe: (audio: Blob, signal: AbortSignal) => Promise<{ text: string }>;
}
interface Session {
  abort: AbortController;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  chunks: Blob[];
  bytes: number;
  started: number;
  ended?: number;
  elapsed?: ReturnType<typeof setInterval>;
  deadline?: ReturnType<typeof setTimeout>;
  finishing: boolean;
  finalized: boolean;
}
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/** One voice note owns its stream, chunks, timers and transcription. No global chunk buffer. */
export class VoiceNoteCapture {
  private session: Session | null = null;
  constructor(private readonly options: Options) {}
  get busy(): boolean { return this.session !== null; }
  private current(session: Session): boolean { return this.session === session && !session.abort.signal.aborted; }
  private releaseTracks(session: Session) { session.stream?.getTracks().forEach(track => { try { track.stop(); } catch {} }); session.stream = undefined; }
  private release(session: Session) {
    session.abort.abort();
    clearInterval(session.elapsed); clearTimeout(session.deadline);
    if (session.recorder) {
      session.recorder.ondataavailable = session.recorder.onstop = session.recorder.onerror = null;
      try { if (session.recorder.state !== 'inactive') session.recorder.stop(); } catch {}
    }
    this.releaseTracks(session); session.chunks = [];
  }
  cancel(notify = true): void {
    const session = this.session; this.session = null;
    if (session) this.release(session);
    if (notify) { this.options.onState('idle'); this.options.onSeconds(0); }
  }
  private fail(session: Session, error: VoiceNoteError) {
    if (!this.current(session)) return;
    this.cancel(); this.options.onError(error);
  }
  async start(): Promise<void> {
    if (this.busy) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { this.options.onError('unsupported'); return; }
    const session: Session = { abort: new AbortController(), chunks: [], bytes: 0, started: 0, finishing: false, finalized: false };
    this.session = session; this.options.onState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.current(session)) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const mimeType = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'].find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      session.recorder = recorder;
      recorder.ondataavailable = event => {
        if (!this.current(session) || session.finalized || !event.data.size) return;
        session.bytes += event.data.size;
        if (session.bytes > MAX_AUDIO_BYTES) { this.fail(session, 'large'); return; }
        session.chunks.push(event.data);
      };
      recorder.onerror = () => this.fail(session, 'recording');
      recorder.onstop = () => {
        if (!this.current(session) || session.finalized) return;
        session.finalized = true;
        clearInterval(session.elapsed); clearTimeout(session.deadline); this.releaseTracks(session);
        const duration = ((session.ended ?? Date.now()) - session.started) / 1000;
        const audio = new Blob(session.chunks, { type: recorder.mimeType || session.chunks[0]?.type || 'audio/webm' });
        session.chunks = [];
        if (duration < .5 || audio.size < 150) { this.fail(session, 'short'); return; }
        void this.transcribe(session, audio);
      };
      session.started = Date.now(); recorder.start(250);
      if (!this.current(session)) return;
      this.options.onSeconds(0); this.options.onState('recording');
      session.elapsed = setInterval(() => {
        if (!this.current(session)) return;
        const seconds = Math.floor((Date.now() - session.started) / 1000);
        this.options.onSeconds(Math.min(seconds, 120));
        if (seconds >= 120) this.finish();
      }, 1000);
    } catch (error) {
      if (this.current(session)) this.fail(session, error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError' ? 'permission' : 'microphone');
    }
  }
  finish(): void {
    const session = this.session;
    if (!session?.recorder || session.finishing) return;
    session.finishing = true; session.ended = Date.now(); clearInterval(session.elapsed);
    this.options.onState('stopping');
    session.deadline = setTimeout(() => this.fail(session, 'recording'), 5000);
    try {
      if (session.recorder.state === 'inactive') { this.fail(session, 'recording'); return; }
      session.recorder.stop(); this.releaseTracks(session);
    } catch { this.fail(session, 'recording'); }
  }
  private async transcribe(session: Session, audio: Blob) {
    this.options.onState('transcribing');
    session.deadline = setTimeout(() => this.fail(session, 'timeout'), 30_000);
    try {
      const result = await this.options.transcribe(audio, session.abort.signal);
      if (!this.current(session)) return;
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) { this.fail(session, 'empty'); return; }
      // Busy is released synchronously before the consumer sends; React state may
      // still be on the previous render. The consumer checks this owner, not stale UI flags.
      this.cancel(); this.options.onText(text);
    } catch { if (this.current(session)) this.fail(session, 'transcription'); }
  }
}
