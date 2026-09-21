// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCamera } from '../client/src/ayrovix/components/LiveCamera';
import { LensLauncher } from '../client/src/ayrovix/components/LensLauncher';
import { LensAccess, readLensConsent, rememberLensConsent } from '../client/src/ayrovix/components/LensHelp';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { NavigationHistoryProvider } from '../client/src/navigation/NavigationHistory';
const mocks=vi.hoisted(()=>({state:null as null | ((s:any)=>void),start:vi.fn(),stop:vi.fn(),scan:vi.fn(()=>({stop:vi.fn()}))}));
vi.mock('../client/src/ayrovix/services/liveVisionRuntime',()=>({LiveVisionRuntime:class { constructor(opts:any){mocks.state=opts.onState;} start=mocks.start; stop=mocks.stop; }}));
vi.mock('../client/src/ayrovix/services/qr',()=>({startCodeScan:mocks.scan}));
vi.mock('../client/src/services/publicApi',async original=>({...await original<any>(),getCommerceConfig:async()=>({data:{features:{ayrovixLensLive:true}}})}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement,track:any,getMedia:ReturnType<typeof vi.fn>;
const callbacks=()=>({onPhoto:vi.fn(),onQrUrl:vi.fn(),onBarcode:vi.fn(),onCodeText:vi.fn(),onLink:vi.fn(),onClose:vi.fn(),onMenu:vi.fn(),onCameraFailed:vi.fn()});
beforeEach(()=>{
  vi.clearAllMocks();sessionStorage.clear();localStorage.clear();window.history.replaceState({},'');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  track={enabled:true,stop:vi.fn(),getCapabilities:()=>({torch:false}),applyConstraints:vi.fn(async()=>{})};
  getMedia=vi.fn(async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]}));
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:getMedia}});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:44,height:44}] as any);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function render(child:React.ReactNode){await act(async()=>root.render(<LocaleProvider><NavigationHistoryProvider>{child}</NavigationHistoryProvider></LocaleProvider>));}
async function press(text:string){const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')===text||b.textContent?.trim()===text);expect(b,text).toBeTruthy();await act(async()=>b!.click());}
async function ready(){const video=host.querySelector('video')!;Object.defineProperty(video,'videoWidth',{configurable:true,value:640});Object.defineProperty(video,'videoHeight',{configurable:true,value:480});await act(async()=>video.dispatchEvent(new Event('canplay',{bubbles:true})));}
async function back(){await act(async()=>{window.history.back();await new Promise(r=>setTimeout(r,35));});}

describe('Lens entry — real controls, lifecycle and explicit policy',()=>{
 it('requires both declarations, never treats a single checkbox as agreement',async()=>{
  const accept=vi.fn();await render(<LensAccess onAccept={accept} onClose={()=>{}}/>);
  const button=host.querySelector<HTMLButtonElement>('.lens-panel-primary')!;expect(button.disabled).toBe(true);
  const inputs=host.querySelectorAll<HTMLInputElement>('.lens-consent input');
  await act(async()=>inputs[0].click());expect(button.disabled).toBe(true);
  await act(async()=>inputs[1].click());expect(button.disabled).toBe(false);
  await act(async()=>button.click());expect(accept).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Ce n’est pas une vérification');
 });
 it('session declaration is versioned and survives blocked storage without crashing',()=>{
  expect(readLensConsent()).toBe(false);rememberLensConsent();expect(readLensConsent()).toBe(true);
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked');});expect(readLensConsent()).toBe(false);
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});expect(()=>rememberLensConsent()).not.toThrow();
 });
 it('actual Launcher does not request a camera before agreement',async()=>{
  await render(<LensLauncher isOpen onClose={()=>{}} onOrder={async()=>{}} cartCount={0} onOpenCart={()=>{}} darkMode={false} onToggleDarkMode={()=>{}}/>);
  expect(host.querySelector('.lens-access')).toBeTruthy();expect(getMedia).not.toHaveBeenCalled();
  for(const e of host.querySelectorAll<HTMLInputElement>('.lens-consent input'))await act(async()=>e.click());
  await press('Continuer vers Lens');expect(getMedia).toHaveBeenCalledTimes(1);expect(readLensConsent()).toBe(true);
 });
 it('disables capture until video is ready and labels unavailable torch truthfully',async()=>{
  await render(<LiveCamera {...callbacks()}/>);expect(host.querySelector<HTMLButtonElement>('.lens-camera-shutter')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Flash indisponible sur cet appareil"]')!.disabled).toBe(true);
  await ready();expect(host.querySelector<HTMLButtonElement>('.lens-camera-shutter')!.disabled).toBe(false);
  expect(host.textContent).toContain('Scan en direct indisponible');
 });
 it('methods are separate; a scanned code cannot invoke the link form by accident',async()=>{
  await render(<LiveCamera {...callbacks()} />);await ready();await press('Lien / code');
  expect(host.querySelector('.lens-camera-stage')?.hasAttribute('inert')).toBe(true);expect(host.querySelector('input[type=url]')).toBeNull();
  await press('Scanner un codeCode-barres ou QR · avec la caméra');
  expect(mocks.scan).toHaveBeenCalledTimes(1);expect(host.querySelector('.lens-panel')).toBeNull();expect(host.querySelector('input[type=url]')).toBeNull();
  await back();expect(host.textContent).toContain('Cadrez le produit');expect(getMedia).toHaveBeenCalledTimes(1);
 });
 it('link form rejects non-web URLs and credentials; valid data uses existing handler',async()=>{
  const props=callbacks();await render(<LiveCamera {...props}/>);await ready();await press('Lien / code');await press('Coller un lien produitDepuis la page d’un produit');
  const input=host.querySelector<HTMLInputElement>('input[type=url]')!,form=host.querySelector('form')!;
  const fill=async(v:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,v);input.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));};
  await fill('javascript:alert(1)');expect(props.onLink).not.toHaveBeenCalled();
  await fill('https://name:secret@example.org/p');expect(props.onLink).not.toHaveBeenCalled();
  await fill('https://example.org/p?size=M');expect(props.onLink).toHaveBeenCalledWith('https://example.org/p?size=M');
 });
 it('suspends live analysis in help and resumes it without reopening the camera',async()=>{
  await render(<LiveCamera {...callbacks()} liveEnabled/>);await ready();await press('Scan en direct');expect(mocks.start).toHaveBeenCalledTimes(1);
  await press('Aide et règles de Lens');expect(track.enabled).toBe(false);const stopped=mocks.stop.mock.calls.length;expect(stopped).toBeGreaterThan(0);
  await back();expect(mocks.start).toHaveBeenCalledTimes(2);expect(track.enabled).toBe(true);expect(getMedia).toHaveBeenCalledTimes(1);
 });
 it('Escape closes only the nested help, keeping Lens open',async()=>{
  const props=callbacks();await render(<LiveCamera {...props}/>);await ready();await press('Aide et règles de Lens');
  await act(async()=>{host.querySelector('.lens-panel')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,35));});
  expect(host.querySelector('.lens-panel')).toBeNull();expect(props.onClose).not.toHaveBeenCalled();
 });
 it('captures immediately and ignores a late blob after unmount',async()=>{
  const props=callbacks();let deliver:BlobCallback;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>{deliver=callback;});
  await render(<LiveCamera {...props}/>);await ready();await press('Photographier');expect(deliver!).toBeTypeOf('function');
  await act(async()=>root.render(null));deliver!(new Blob(['test'],{type:'image/jpeg'}));expect(props.onPhoto).not.toHaveBeenCalled();expect(track.stop).toHaveBeenCalledTimes(1);
 });
 it('keeps the existing image/result shell and does not start Live over a photo',async()=>{
  const props=callbacks(),close=vi.fn();await render(<LiveCamera {...props} liveEnabled photoUrl="blob:test" overlay={<div>Existing results</div>} onPhotoClose={close}/>);
  expect(host.textContent).toContain('Existing results');expect(host.querySelector('.lens-camera-controls')).toBeNull();expect(host.querySelector('[aria-label="Aide et règles de Lens"]')).toBeNull();
  await press('Retour à la caméra');expect(close).toHaveBeenCalledTimes(1);expect(props.onClose).not.toHaveBeenCalled();expect(mocks.start).not.toHaveBeenCalled();
 });
 it('reports permission failure through the existing fallback callback',async()=>{
  getMedia.mockRejectedValueOnce(new Error('NotAllowedError'));const props=callbacks();await render(<LiveCamera {...props}/>);
  expect(props.onCameraFailed).toHaveBeenCalledTimes(1);expect(mocks.start).not.toHaveBeenCalled();
 });
 it('stops media that arrives after the component has already closed',async()=>{
  let resolve:(value:any)=>void;getMedia.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  await render(<LiveCamera {...callbacks()}/>);await act(async()=>root.render(null));
  await act(async()=>resolve!({getTracks:()=>[track],getVideoTracks:()=>[track]}));expect(track.stop).toHaveBeenCalledTimes(1);
 });
 it('supported torch exposes a true pressed state and toggles the real track constraint',async()=>{
  track.getCapabilities=()=>({torch:true});await render(<LiveCamera {...callbacks()}/>);await ready();await press('Allumer le flash');
  expect(track.applyConstraints).toHaveBeenCalledWith({advanced:[{torch:true}]});expect(host.querySelector('[aria-label="Éteindre le flash"]')?.getAttribute('aria-pressed')).toBe('true');
  await press('Éteindre le flash');expect(track.applyConstraints).toHaveBeenLastCalledWith({advanced:[{torch:false}]});
 });

 it('a failed video playback releases the acquired camera before fallback',async()=>{
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('playback denied'));
  const props=callbacks();await render(<LiveCamera {...props}/>);expect(track.stop).toHaveBeenCalledTimes(1);expect(props.onCameraFailed).toHaveBeenCalledTimes(1);
 });
 it('help switches the physical torch off, not just the video preview',async()=>{
  track.getCapabilities=()=>({torch:true});await render(<LiveCamera {...callbacks()}/>);await ready();await press('Allumer le flash');await press('Aide et règles de Lens');
  expect(track.applyConstraints).toHaveBeenLastCalledWith({advanced:[{torch:false}]});await back();
  expect(host.querySelector('[aria-label="Allumer le flash"]')?.getAttribute('aria-pressed')).toBe('false');
 });
 it('serializes an in-flight torch-on with the off request from help',async()=>{
  let done!:()=>void;track.getCapabilities=()=>({torch:true});track.applyConstraints.mockImplementationOnce(()=>new Promise<void>(r=>{done=r;}));
  await render(<LiveCamera {...callbacks()}/>);await ready();await press('Allumer le flash');await press('Aide et règles de Lens');
  expect(track.applyConstraints).toHaveBeenCalledTimes(1);await act(async()=>done());
  expect(track.applyConstraints).toHaveBeenCalledTimes(2);expect(track.applyConstraints).toHaveBeenLastCalledWith({advanced:[{torch:false}]});
 });
 it('does not falsely show flash off when the device rejects that change',async()=>{
  track.getCapabilities=()=>({torch:true});await render(<LiveCamera {...callbacks()}/>);await ready();await press('Allumer le flash');track.applyConstraints.mockRejectedValueOnce(new Error('device'));
  await press('Éteindre le flash');expect(host.querySelector('[aria-label="Éteindre le flash"]')?.getAttribute('aria-pressed')).toBe('true');expect(host.textContent).toContain('Le réglage du flash a échoué');
 });
 it('hidden pages stop Live and the torch, then reuse the same stream on return',async()=>{
  track.getCapabilities=()=>({torch:true});await render(<LiveCamera {...callbacks()} liveEnabled/>);await ready();await press('Scan en direct');await press('Allumer le flash');
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
  expect(track.enabled).toBe(false);expect(track.applyConstraints).toHaveBeenLastCalledWith({advanced:[{torch:false}]});
  hidden.mockReturnValue(false);await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(track.enabled).toBe(true);expect(mocks.start).toHaveBeenCalledTimes(2);expect(getMedia).toHaveBeenCalledTimes(1);
 });

 it('offline status explicitly says online search is paused',async()=>{
  await render(<LiveCamera {...callbacks()} liveEnabled/>);await ready();await press('Scan en direct');
  await act(async()=>mocks.state!({objects:[],status:'offline'}));expect(host.textContent).toContain('Hors ligne');
 });
 it('provider failure does not pretend that a local detector is available',async()=>{
  await render(<LiveCamera {...callbacks()} liveEnabled/>);await ready();await press('Scan en direct');
  await act(async()=>mocks.state!({objects:[],status:'ai-unavailable'}));expect(host.textContent).toContain('Recherche en ligne indisponible');expect(host.textContent).not.toContain('Analyse locale');
 });

});
