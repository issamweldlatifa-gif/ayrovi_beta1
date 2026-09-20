export type VoiceCaptureFailure = 'recording' | 'flush-timeout' | 'large';
export const MAX_VOICE_INPUT_BYTES = 12 * 1024 * 1024;
const FLUSH_TIMEOUT_MS = 5_000;

/** Owns one complete MediaRecorder container, not the microphone stream.
 * The controller owns the stream/VAD. Old callbacks only ever see this capture.
 * Cancel wins over a pending finish; an incomplete flush is never uploaded.
 */
export class VoiceInputCapture {
  private readonly recorder: MediaRecorder;
  private readonly mimeType: string;
  private chunks: Blob[] = [];
  private bytes = 0;
  private done = false;
  private stopping = false;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private resolve!: (audio: Blob | null) => void;
  private readonly completion = new Promise<Blob | null>(resolve => { this.resolve = resolve; });

  constructor(stream: MediaStream, private readonly onFailure: (failure: VoiceCaptureFailure) => void, private readonly onClosed: () => void) {
    const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
      ? ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      : undefined;
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.mimeType = this.recorder.mimeType || mimeType || 'audio/webm';
    this.recorder.ondataavailable = event => {
      if (this.done || !event.data?.size) return;
      if (this.bytes + event.data.size > MAX_VOICE_INPUT_BYTES) { this.close(null, 'large'); return; }
      this.bytes += event.data.size;
      // Keep the initialization header and all following fragments intact.
      this.chunks.push(event.data);
    };
    this.recorder.onerror = () => { if (!this.done) this.close(null, 'recording'); };
    this.recorder.addEventListener('stop', this.onStopped);
  }

  start(): void {
    if (this.done) return;
    try { this.recorder.start(200); } catch { this.close(null, 'recording'); }
  }

  finish(): Promise<Blob | null> {
    if (this.done || this.stopping) return this.completion;
    this.stopping = true;
    this.deadline = setTimeout(() => this.close(null, 'flush-timeout'), FLUSH_TIMEOUT_MS);
    try {
      if (this.recorder.state === 'inactive') this.close(null, 'recording');
      else {
        if (typeof this.recorder.requestData === 'function') this.recorder.requestData();
        if (!this.done) this.recorder.stop();
      }
    } catch { this.close(null, 'recording'); }
    return this.completion;
  }

  cancel(): void { this.close(null); }

  private readonly onStopped = () => {
    if (this.done) return;
    if (!this.stopping) { this.close(null, 'recording'); return; }
    this.close(this.chunks.length ? new Blob(this.chunks, { type: this.mimeType }) : null);
  };

  private close(audio: Blob | null, failure?: VoiceCaptureFailure): void {
    if (this.done) return;
    this.done = true;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    this.recorder.ondataavailable = this.recorder.onerror = null;
    this.recorder.removeEventListener('stop', this.onStopped);
    this.chunks = []; this.bytes = 0;
    try { if (this.recorder.state !== 'inactive') this.recorder.stop(); } catch {}
    this.resolve(audio);
    try { if (failure) this.onFailure(failure); } finally { this.onClosed(); }
  }
}
