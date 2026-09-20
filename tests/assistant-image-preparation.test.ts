// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PREPARED_IMAGE_BYTES, prepareAssistantImage, validImageHeader } from '../client/src/components/assistant/media/prepareImage';
const header = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const file = (type='image/png',size=header.length)=>new NodeFile([header,new Uint8Array(Math.max(0,size-header.length))],'photo.png',{type}) as unknown as File;
let bitmap: {width:number;height:number;close:ReturnType<typeof vi.fn>}, encode:ReturnType<typeof vi.fn>;
class Reader {
  static pending: Reader[]=[]; static hold=false; static aborts=0;
  readyState=0;result:any=null;onload:any;onerror:any;onabort:any;
  readAsDataURL(blob:Blob){this.readyState=1;this.result=`data:${blob.type};base64,TEST`;if(Reader.hold)Reader.pending.push(this);else{this.readyState=2;this.onload?.();}}
  abort(){Reader.aborts++;this.readyState=2;this.onabort?.();}
}
beforeEach(()=>{
  bitmap={width:3200,height:1600,close:vi.fn()};vi.stubGlobal('createImageBitmap',vi.fn(async()=>bitmap));
  Reader.pending=[];Reader.hold=false;Reader.aborts=0;vi.stubGlobal('FileReader',Reader);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
  encode=vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation((callback,type)=>callback(new Blob(['valid'],{type})));
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
describe('bounded, cancellable image preparation',()=>{
  it.each(['image/jpeg','image/gif','image/webp','text/plain'])('rejects a PNG header mislabeled as %s',type=>expect(prepareAssistantImage(file(type),new AbortController().signal)).rejects.toMatchObject({code:'format'}));
  it('recognizes the supported signatures, not arbitrary image MIME labels',()=>{expect(validImageHeader(new Uint8Array([255,216,255]),'image/jpeg')).toBe(true);expect(validImageHeader(new TextEncoder().encode('GIF89a'),'image/gif')).toBe(true);expect(validImageHeader(new TextEncoder().encode('RIFF1234WEBP'),'image/webp')).toBe(true);expect(validImageHeader(new Uint8Array(12),'image/png')).toBe(false);});
  it('rejects oversized sources before decoding',async()=>{await expect(prepareAssistantImage(file('image/png',5*1024*1024+1),new AbortController().signal)).rejects.toMatchObject({code:'large'});expect(createImageBitmap).not.toHaveBeenCalled();});
  it('closes its bitmap and reports the actual encoder MIME',async()=>{encode.mockImplementation(callback=>callback(new Blob(['jpeg'],{type:'image/jpeg'})));expect(await prepareAssistantImage(file(),new AbortController().signal)).toEqual({preview:'data:image/jpeg;base64,TEST',type:'image/jpeg'});expect(bitmap.close).toHaveBeenCalledOnce();});
  it('does not create an attachment from an empty encoder result',async()=>{encode.mockImplementation(callback=>callback(new Blob([],{type:'image/png'})));await expect(prepareAssistantImage(file(),new AbortController().signal)).rejects.toMatchObject({code:'unreadable'});});
  it('does not leak a bitmap when canvas is unavailable',async()=>{vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);await expect(prepareAssistantImage(file(),new AbortController().signal)).rejects.toMatchObject({code:'unreadable'});expect(bitmap.close).toHaveBeenCalledOnce();});
  it('enforces the final byte limit after every compression fallback',async()=>{encode.mockImplementation(callback=>callback(new Blob([new Uint8Array(MAX_PREPARED_IMAGE_BYTES+1)],{type:'image/jpeg'})));await expect(prepareAssistantImage(file(),new AbortController().signal)).rejects.toMatchObject({code:'prepared-large'});expect(encode).toHaveBeenCalledTimes(3);expect(bitmap.close).toHaveBeenCalledOnce();});
  it('does not fall back to an unreadable original on decode failure',async()=>{vi.mocked(createImageBitmap).mockRejectedValue(new Error('decode'));await expect(prepareAssistantImage(file(),new AbortController().signal)).rejects.toMatchObject({code:'unreadable'});});
  it('bounds the original fallback when bitmap decoding is unavailable',async()=>{vi.stubGlobal('createImageBitmap',undefined);await expect(prepareAssistantImage(file('image/png',MAX_PREPARED_IMAGE_BYTES+1),new AbortController().signal)).rejects.toMatchObject({code:'prepared-large'});});
  it('closes a bitmap that arrives after cancellation without continuing to canvas',async()=>{let release!:(value:any)=>void;vi.mocked(createImageBitmap).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const controller=new AbortController();const pending=prepareAssistantImage(file(),controller.signal);const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});await flush();controller.abort();await assertion;release(bitmap);await flush();expect(bitmap.close).toHaveBeenCalledOnce();expect(encode).not.toHaveBeenCalled();});
  it('aborts FileReader itself, not only its consumer',async()=>{Reader.hold=true;const controller=new AbortController();const pending=prepareAssistantImage(file(),controller.signal);const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});await flush();expect(Reader.pending).toHaveLength(1);controller.abort();await assertion;expect(Reader.aborts).toBe(1);});
  it('times out a browser encoder which never calls back',async()=>{vi.useFakeTimers();encode.mockImplementation(()=>{});const pending=prepareAssistantImage(file(),new AbortController().signal);const assertion=expect(pending).rejects.toMatchObject({code:'timeout'});await flush();vi.advanceTimersByTime(30_000);await assertion;expect(bitmap.close).toHaveBeenCalledOnce();});
});
