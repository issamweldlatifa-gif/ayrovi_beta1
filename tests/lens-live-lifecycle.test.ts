// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LiveVisionRuntime } from '../client/src/ayrovix/services/liveVisionRuntime';
const mocks=vi.hoisted(()=>({analyze:vi.fn(),load:vi.fn(),signature:vi.fn(()=> 'same-frame')}));
vi.mock('../client/src/ayrovix/services/lensApi',()=>({analyzeImage:mocks.analyze}));
vi.mock('../client/src/ayrovix/services/localDetector',()=>({loadLocalDetector:mocks.load}));
vi.mock('../client/src/ayrovix/services/liveScanner',()=>({frameSignature:mocks.signature,signatureDistance:(a:string,b:string)=>a===b?0:1,liveObjectId:(s:string)=>s}));
function deferred<T=any>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const result=(title='New product')=>({identification:{description:title,confidence:.9},candidates:[{id:title,title,match:90}],detectedPrice:null});
let runtime:LiveVisionRuntime,states:any[],events:string[],encode:BlobCallback[];
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
beforeEach(()=>{
 vi.useFakeTimers();vi.resetAllMocks();states=[];events=[];encode=[];
 mocks.signature.mockReturnValue('same-frame');mocks.load.mockResolvedValue(null);mocks.analyze.mockResolvedValue(result());
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray(32*32*4)})} as any);
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,TEST');
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(cb=>{encode.push(cb);});
 runtime=new LiveVisionRuntime({getVideo:()=>({videoWidth:640,videoHeight:480} as HTMLVideoElement),onState:s=>states.push(structuredClone(s)),onEvent:e=>events.push(e),baseInterval:2200});
});
afterEach(()=>{runtime.stop();vi.useRealTimers();vi.restoreAllMocks();});
async function startFrame(){runtime.start();await vi.advanceTimersByTimeAsync(2200);expect(encode.length).toBeGreaterThan(0);}
function deliver(index=0){encode[index](new Blob(['frame'],{type:'image/jpeg'}));}

describe('Live runtime sessions — real scheduler with controlled media/provider promises',()=>{
 it('first frame is sampled immediately rather than waiting a full polling interval',async()=>{
  runtime.start();await vi.advanceTimersByTimeAsync(0);expect(encode).toHaveLength(1);
 });
 it('a pre-stop encoded frame cannot start a request in a replacement session',async()=>{
  await startFrame();runtime.stop();runtime.start();deliver();await flush();expect(mocks.analyze).not.toHaveBeenCalled();
 });
 it('late provider responses cannot repopulate a stopped session',async()=>{
  const pending=deferred();mocks.analyze.mockReturnValue(pending.promise);await startFrame();deliver();await flush();
  const signal=mocks.analyze.mock.calls[0][1] as AbortSignal;runtime.stop();expect(signal.aborted).toBe(true);
  const count=states.length;pending.resolve(result('Old product'));await flush();expect(states).toHaveLength(count);expect(states.at(-1).status).toBe('idle');
 });
 it('an obsolete request cannot clear the replacement in-flight lock or schedule a second loop',async()=>{
  const old=deferred(),current=deferred();mocks.analyze.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await startFrame();deliver();await flush();runtime.stop();runtime.start();await vi.advanceTimersByTimeAsync(2200);deliver(1);await flush();
  old.resolve(result('Old'));await flush();expect((runtime as any).inflight).toBe(true);expect(vi.getTimerCount()).toBe(0);expect(states.at(-1).objects).toEqual([]);
  current.resolve(result('Current'));await flush();expect(states.at(-1).objects[0].label).toBe('Current');expect(vi.getTimerCount()).toBe(1);
 });
 it('a failed request is retried even if the camera remains completely still',async()=>{
  mocks.analyze.mockRejectedValueOnce(new Error('temporary'));await startFrame();deliver();await flush();await vi.advanceTimersByTimeAsync(4500);
  expect(encode.length).toBeGreaterThan(1);deliver(1);await flush();expect(mocks.analyze).toHaveBeenCalledTimes(2);
 });
 it('an unchanged recognized scene does not age its product out as if it disappeared',async()=>{
  await startFrame();deliver();await flush();await vi.advanceTimersByTimeAsync(12000);
  expect(states.at(-1).objects.some((o:any)=>o.label==='New product'&&o.status!=='lost')).toBe(true);
  expect(mocks.analyze).toHaveBeenCalledTimes(1);
 });
 it('a detector resolving from an older session cannot replace the current detector',async()=>{
  const old=deferred(),fresh=deferred();mocks.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  runtime.start();runtime.stop();runtime.start();const active={detect:vi.fn()};fresh.resolve(active);await flush();old.resolve({detect:vi.fn()});await flush();expect((runtime as any).detector).toBe(active);
 });
 it('an old local inference cannot publish detections after restart',async()=>{
  const pending=deferred();mocks.load.mockResolvedValue({detect:()=>pending.promise});runtime.start();await flush();await vi.advanceTimersByTimeAsync(2200);
  runtime.stop();runtime.start();const count=states.length;pending.resolve([{label:'Old local product',category:'object',score:.9,bbox:[0,0,20,20]}]);await flush();
  expect(states).toHaveLength(count);expect((runtime as any).objects).toEqual([]);
 });
 it('crop matching gets an abort signal and cannot survive stop',async()=>{
  mocks.load.mockResolvedValue({detect:async()=>[{label:'Bag',category:'bag',score:.9,bbox:[10,10,100,100]}]});
  const pending=deferred();mocks.analyze.mockReturnValue(pending.promise);runtime.start();await flush();await vi.advanceTimersByTimeAsync(2200);expect(encode.length).toBeGreaterThan(0);
  deliver();await flush();const signal=mocks.analyze.mock.calls[0][1] as AbortSignal;expect(signal).toBeInstanceOf(AbortSignal);
  runtime.stop();expect(signal.aborted).toBe(true);expect((runtime as any).matchingIds.size).toBe(0);const count=states.length;pending.resolve(result());await flush();expect(states).toHaveLength(count);
 });
 it('repeated start creates no duplicate scheduler, stop releases scheduled work',async()=>{
  runtime.start();runtime.start();expect(vi.getTimerCount()).toBe(1);runtime.stop();expect(vi.getTimerCount()).toBe(0);await vi.advanceTimersByTimeAsync(10000);expect(encode).toHaveLength(0);
 });
 it('periodically revalidates a stationary scene instead of retaining evidence forever',async()=>{
  await startFrame();deliver();await flush();await vi.advanceTimersByTimeAsync(20000);expect(encode.length).toBeGreaterThan(1);
 });
 it('a failed frame encode releases the lock and schedules recovery',async()=>{
  vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce(()=>{throw Error('encode unavailable');});
  runtime.start();await vi.advanceTimersByTimeAsync(0);expect((runtime as any).inflight).toBe(false);expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2200);expect(encode).toHaveLength(1);
 });
 it('unreadable frame pixels do not terminate the sampling loop',async()=>{
  mocks.signature.mockImplementationOnce(()=>{throw Error('frame unavailable');});runtime.start();await vi.advanceTimersByTimeAsync(0);expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(2200);expect(encode).toHaveLength(1);
 });

 it('backs off failed full-frame requests instead of retrying every ordinary tick',async()=>{
  mocks.analyze.mockRejectedValue(new Error('service unavailable'));runtime.start();await vi.advanceTimersByTimeAsync(0);deliver();await flush();
  await vi.advanceTimersByTimeAsync(4399);expect(encode).toHaveLength(1);await vi.advanceTimersByTimeAsync(1);expect(encode).toHaveLength(2);
  deliver(1);await flush();await vi.advanceTimersByTimeAsync(8799);expect(encode).toHaveLength(2);await vi.advanceTimersByTimeAsync(1);expect(encode).toHaveLength(3);
 });
 it('backs off failed crop matching and resets retry bookkeeping on stop',async()=>{
  mocks.load.mockResolvedValue({detect:async()=>[{label:'Bag',category:'bag',score:.9,bbox:[10,10,100,100]}]});mocks.analyze.mockRejectedValue(new Error('provider failure'));
  runtime.start();await vi.advanceTimersByTimeAsync(0);deliver();await flush();await vi.advanceTimersByTimeAsync(2200);expect(encode).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2200);expect(encode).toHaveLength(2);runtime.stop();expect((runtime as any).matchRetry.size).toBe(0);
 });

});
