import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { VoiceNoteCapture } from '../client/src/components/assistant/media/VoiceNoteCapture';
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: any; onstop: any; onerror: any;
  constructor() { Recorder.instances.push(this); }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; }
  chunk(size = 200) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) }); }
  flush() { this.chunk(); this.onstop?.(); }
}
let track: { stop: Mock }, stream: MediaStream;
let media: Mock, transcribe: Mock;
let onText: Mock, onError: Mock, onState: Mock;
let capture: VoiceNoteCapture;
beforeEach(() => {
  vi.useFakeTimers(); Recorder.instances=[];
  track={ stop:vi.fn() }; stream={ getTracks:()=>[track] } as unknown as MediaStream;
  media=vi.fn(async()=>stream); vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:media}}); vi.stubGlobal('MediaRecorder',Recorder);
  transcribe=vi.fn(async()=>({text:'  النص الكامل  '})); onText=vi.fn(); onError=vi.fn(); onState=vi.fn();
  capture=new VoiceNoteCapture({onText,onError,onState,onSeconds:vi.fn(),transcribe});
});
afterEach(()=>{capture.cancel();vi.useRealTimers();vi.unstubAllGlobals();});
async function finish() { await capture.start(); vi.advanceTimersByTime(750);capture.finish();Recorder.instances.at(-1)!.flush();await Promise.resolve(); }
describe('owned manual voice-note lifecycle',()=>{
  it('sends the complete transcript once and releases busy before delivery',async()=>{onText.mockImplementation(()=>expect(capture.busy).toBe(false));await finish();expect(onText).toHaveBeenCalledExactlyOnceWith('النص الكامل');expect(track.stop).toHaveBeenCalledTimes(1);expect(capture.busy).toBe(false);});
  it('reserves permission synchronously and stops a late grant after cancellation',async()=>{const permission=deferred<MediaStream>();media.mockReturnValue(permission.promise);const start=capture.start();await capture.start();expect(media).toHaveBeenCalledTimes(1);expect(onState).toHaveBeenLastCalledWith('requesting');capture.cancel();permission.resolve(stream);await start;expect(track.stop).toHaveBeenCalledOnce();expect(Recorder.instances).toHaveLength(0);});
  it('never sends a result from an aborted transcription, even when transport ignores abort',async()=>{const result=deferred<{text:string}>();transcribe.mockReturnValue(result.promise);await finish();const signal=transcribe.mock.calls[0][1];capture.cancel();expect(signal.aborted).toBe(true);result.resolve({text:'STALE'});await Promise.resolve();expect(onText).not.toHaveBeenCalled();expect(onError).not.toHaveBeenCalled();});
  it('old recorder callbacks cannot stop or contaminate a new recording',async()=>{await capture.start();const old=Recorder.instances[0];const lateStop=old.onstop,lateData=old.ondataavailable,lateError=old.onerror;capture.cancel();const nextTrack={stop:vi.fn()};media.mockResolvedValue({getTracks:()=>[nextTrack]});await capture.start();lateData({data:new Blob(['OLD'])});lateStop();lateError();expect(nextTrack.stop).not.toHaveBeenCalled();expect(capture.busy).toBe(true);expect(onError).not.toHaveBeenCalled();vi.advanceTimersByTime(700);capture.finish();Recorder.instances[1].flush();await Promise.resolve();expect(transcribe.mock.calls[0][0].size).toBe(200);});
  it('does not transcribe cancelled audio',async()=>{await capture.start();const recorder=Recorder.instances[0];recorder.chunk();capture.cancel();recorder.flush();expect(transcribe).not.toHaveBeenCalled();});
  it('rejects too-short audio without submitting',async()=>{await capture.start();capture.finish();Recorder.instances[0].flush();expect(onError).toHaveBeenLastCalledWith('short');expect(transcribe).not.toHaveBeenCalled();});
  it('bounds captured bytes to the server upload limit',async()=>{await capture.start();Recorder.instances[0].chunk(12*1024*1024+1);expect(onError).toHaveBeenLastCalledWith('large');expect(track.stop).toHaveBeenCalledOnce();expect(transcribe).not.toHaveBeenCalled();});
  it('stops automatically at 120 seconds',async()=>{await capture.start();vi.advanceTimersByTime(120_000);expect(Recorder.instances[0].state).toBe('inactive');expect(track.stop).toHaveBeenCalledOnce();Recorder.instances[0].flush();await Promise.resolve();expect(onText).toHaveBeenCalledOnce();});
  it('recovers when a browser never flushes its stop event',async()=>{await capture.start();capture.finish();vi.advanceTimersByTime(5000);expect(capture.busy).toBe(false);expect(onError).toHaveBeenLastCalledWith('recording');});
  it('bounds transcription and discards a late successful response',async()=>{const result=deferred<{text:string}>();transcribe.mockReturnValue(result.promise);await finish();vi.advanceTimersByTime(30_000);expect(onError).toHaveBeenLastCalledWith('timeout');expect(capture.busy).toBe(false);result.resolve({text:'LATE'});await Promise.resolve();expect(onText).not.toHaveBeenCalled();});
  it('distinguishes transport failure from absence of speech',async()=>{transcribe.mockRejectedValue(new Error('503'));await finish();expect(onError).toHaveBeenLastCalledWith('transcription');expect(onText).not.toHaveBeenCalled();});
  it('reports no speech honestly',async()=>{transcribe.mockResolvedValue({text:'   '});await finish();expect(onError).toHaveBeenLastCalledWith('empty');});
  it('reports permission denial without retaining the operation',async()=>{media.mockRejectedValue(new DOMException('denied','NotAllowedError'));await capture.start();expect(onError).toHaveBeenLastCalledWith('permission');expect(capture.busy).toBe(false);});
  it('ignores repeated stop notifications',async()=>{await capture.start();vi.advanceTimersByTime(700);const recorder=Recorder.instances[0];const stop=recorder.onstop;capture.finish();recorder.chunk();stop();stop();await Promise.resolve();expect(transcribe).toHaveBeenCalledOnce();expect(onText).toHaveBeenCalledOnce();});
});
