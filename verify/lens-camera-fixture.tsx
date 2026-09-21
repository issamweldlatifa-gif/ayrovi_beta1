/** Verification only: actual UI, synthetic camera, isolated callbacks; no analysis provider. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider, useNavigationHistory } from '../client/src/navigation/NavigationHistory';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import { LiveCamera } from '../client/src/ayrovix/components/LiveCamera';
import { LensAccess, readLensConsent, rememberLensConsent } from '../client/src/ayrovix/components/LensHelp';
const state={mediaRequests:0,stopped:0,photos:[] as number[],links:[] as string[],codes:[] as string[],exits:0};(window as any).lensEntryTest=state;
const canvas=document.createElement('canvas');canvas.width=720;canvas.height=960;const ctx=canvas.getContext('2d')!;
const gradient=ctx.createLinearGradient(0,0,720,960);gradient.addColorStop(0,'#8b9290');gradient.addColorStop(1,'#313a38');ctx.fillStyle=gradient;ctx.fillRect(0,0,720,960);ctx.fillStyle='#c4c6c0';ctx.fillRect(150,290,420,470);ctx.strokeStyle='#92998d';ctx.lineWidth=3;ctx.strokeRect(150,290,420,470);
const stream=canvas.captureStream(10);const track=stream.getVideoTracks()[0];const stop=track.stop.bind(track);track.stop=()=>{state.stopped++;stop();};
const timer=setInterval(()=>{ctx.fillStyle='#bbbfb8';ctx.fillRect(155,295,410,460);},100);window.addEventListener('pagehide',()=>clearInterval(timer));
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{state.mediaRequests++;return stream;}}});
function Fixture(){
 const [accepted,setAccepted]=useState(readLensConsent);const [photo,setPhoto]=useState<string|null>(null);const nav=useNavigationHistory();
 const close=()=>{state.exits++;nav.back();};
 return <><button data-open onClick={()=>nav.pushLayer({id:'app:lens'})}>Ouvrir Lens / فتح Lens</button>{nav.has('app:lens')&&(accepted?<LiveCamera
  onPhoto={file=>{state.photos.push(file.size);setPhoto(URL.createObjectURL(file));}}
  photoUrl={photo} overlay={photo?<InteractiveLensResults shell previewUrl={photo} fallbackImage={null} view={{queryLabel:null,list:[],eventId:"fixture"}} onChoose={()=>{}} onReset={()=>{if(photo)URL.revokeObjectURL(photo);setPhoto(null);}}/>:null}
  onPhotoClose={()=>{if(photo)URL.revokeObjectURL(photo);setPhoto(null);}}
  onQrUrl={u=>state.links.push(u)} onBarcode={c=>state.codes.push(c)} onCodeText={c=>state.codes.push(c)} onLink={u=>state.links.push(u)}
  onClose={close} onMenu={()=>{}} onCameraFailed={()=>{throw Error('Synthetic camera failed');}} liveEnabled={new URLSearchParams(location.search).get('live')!=='off'}
 />:<LensAccess onAccept={()=>{rememberLensConsent();setAccepted(true);}} onClose={close}/>)}</>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><Fixture/></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
