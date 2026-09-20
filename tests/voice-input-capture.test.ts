import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputCapture, MAX_VOICE_INPUT_BYTES } from '../client/src/components/assistant/voice/VoiceInputCapture';
class Recorder extends EventTarget {
  static instances: Recorder[]=[];static isTypeSupported=()=>true;
  state:RecordingState='inactive';mimeType='audio/webm';ondataavailable:any;onerror:any;
  constructor(){super();Recorder.instances.push(this);}
  start(){this.state='recording';}requestData=vi.fn();stop=vi.fn(()=>{this.state='inactive';});
  chunk(size:number,marker=1){this.ondataavailable?.({data:new Blob([new Uint8Array(size).fill(marker)])});}
  end(){this.dispatchEvent(new Event('stop'));}
}
let input:VoiceInputCapture;let errors=vi.fn(),closed=vi.fn();
beforeEach(()=>{vi.useFakeTimers();Recorder.instances=[];vi.stubGlobal('MediaRecorder',Recorder);errors=vi.fn();closed=vi.fn();input=new VoiceInputCapture({} as MediaStream,error=>errors(error),()=>closed());input.start();});
afterEach(()=>{input.cancel();vi.useRealTimers();vi.unstubAllGlobals();});
describe('owned complete voice containers',()=>{
  it('keeps first and final fragments in order and emits its actual MIME',async()=>{const r=Recorder.instances[0];r.chunk(180,42);const done=input.finish();r.chunk(200,99);r.end();const blob=(await done)!;expect(blob.type).toBe('audio/webm');expect(blob.size).toBe(380);const bytes=new Uint8Array(await blob.arrayBuffer());expect(bytes[0]).toBe(42);expect(bytes[379]).toBe(99);expect(closed).toHaveBeenCalledOnce();});
  it('joins repeated finish requests without a second recorder stop',async()=>{const r=Recorder.instances[0];r.chunk(200);const first=input.finish(),second=input.finish();expect(first).toBe(second);r.end();await first;expect(r.stop).toHaveBeenCalledOnce();});
  it('cancellation wins over a pending finalization',async()=>{const r=Recorder.instances[0];r.chunk(200);const result=input.finish();input.cancel();r.end();expect(await result).toBeNull();expect(errors).not.toHaveBeenCalled();expect(closed).toHaveBeenCalledOnce();});
  it('queued data/error/stop callbacks have no effect after cancellation',()=>{const r=Recorder.instances[0],data=r.ondataavailable,error=r.onerror;input.cancel();data({data:new Blob(['late'])});error();r.end();expect(errors).not.toHaveBeenCalled();expect(closed).toHaveBeenCalledOnce();});
  it('never returns partial audio when the native stop event is missing',async()=>{Recorder.instances[0].chunk(200);const result=input.finish();vi.advanceTimersByTime(5000);expect(await result).toBeNull();expect(errors).toHaveBeenCalledExactlyOnceWith('flush-timeout');});
  it('rejects oversized capture before retaining it and closes exactly once',async()=>{const r=Recorder.instances[0];r.chunk(MAX_VOICE_INPUT_BYTES);r.chunk(1);expect(errors).toHaveBeenCalledExactlyOnceWith('large');expect(await input.finish()).toBeNull();expect(closed).toHaveBeenCalledOnce();expect(r.stop).toHaveBeenCalledOnce();});
  it('reports an unexpected recorder stop instead of pretending it is still listening',async()=>{const r=Recorder.instances[0];r.state='inactive';r.end();expect(errors).toHaveBeenCalledExactlyOnceWith('recording');expect(await input.finish()).toBeNull();});
  it('cleans up failed recorder startup',()=>{input.cancel();const start=vi.spyOn(Recorder.prototype,'start').mockImplementation(()=>{throw new Error('device');});try{errors.mockClear();closed.mockClear();input=new VoiceInputCapture({} as MediaStream,error=>errors(error),()=>closed());input.start();expect(errors).toHaveBeenCalledExactlyOnceWith('recording');expect(closed).toHaveBeenCalledOnce();}finally{start.mockRestore();}});
});
