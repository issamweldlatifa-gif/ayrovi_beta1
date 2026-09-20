import { chromium } from 'playwright';
import fs from 'node:fs';
const output='screenshots/editorial/sonim-handsfree';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];let page;
const check=(label,pass,details)=>{checks.push({label,pass:Boolean(pass),details});if(!pass)throw new Error(label+': '+JSON.stringify(details));};
const browser=await chromium.launch({headless:true});
try {
  for(const locale of ['fr','ar'])for(const width of [320,390]){
    const ar=locale==='ar',key=`${locale}/${width}`;
    const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await context.addInitScript(locale=>{
      localStorage.setItem('ayrovi.locale.v1',locale);
      const m=window.handsfreeTest={level:128,tracks:[],recorders:[],held:[],holdStop:false,transcripts:[],utterances:[]};
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
        const track={enabled:true,stopped:false,stop(){this.stopped=true;}};m.tracks.push(track);return {getTracks:()=>[track],getAudioTracks:()=>[track]};
      }}});
      class Recorder extends EventTarget{
        static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';ondataavailable=null;onerror=null;
        constructor(){super();m.recorders.push(this);}start(){this.state='recording';this.chunk(180,1);}requestData(){this.chunk(180,2);}
        chunk(size,marker){this.ondataavailable?.({data:new Blob([new Uint8Array(size).fill(marker)],{type:this.mimeType})});}
        stop(){this.state='inactive';const data=this.ondataavailable;const flush=()=>{data?.({data:new Blob([new Uint8Array(180).fill(3)])});this.dispatchEvent(new Event('stop'));};if(m.holdStop)m.held.push(flush);else queueMicrotask(flush);}
      }
      class AudioContext{
        state='running';destination={};stream=null;
        resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
        createMediaStreamSource(stream){this.stream=stream;return {connect(){}};}createBiquadFilter(){return {connect(){},frequency:{value:0}};}
        createAnalyser(){return {connect(){},frequencyBinCount:64,getByteFrequencyData(data){data.fill(0);},getByteTimeDomainData:data=>data.fill(this.stream?.getAudioTracks()[0].enabled?m.level:128)};}
      }
      class Utterance{constructor(text){this.text=text;}}
      window.MediaRecorder=Recorder;window.AudioContext=AudioContext;window.SpeechSynthesisUtterance=Utterance;
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{paused:false,getVoices:()=>[],resume(){},cancel(){},speak(utterance){m.utterances.push(utterance);queueMicrotask(()=>{utterance.onstart?.();utterance.onend?.();});}}});
      const original=window.fetch.bind(window);
      window.fetch=(url,init)=>String(url)==='/api/assistant/transcribe'?new Promise(resolve=>m.transcripts.push({audio:init.body.get('audio'),signal:init.signal,reply:(text,status=200)=>resolve(new Response(JSON.stringify({data:{text}}),{status,headers:{'content-type':'application/json'}}))})):original(url,init);
    },locale);
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/assistant/status',route=>route.fulfill({json:{success:true,data:{serverTextToSpeechReady:false}}}));
    const chats=[];
    await page.route('**/api/assistant/chat',route=>{chats.push(route.request().postDataJSON());return route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'delta',text:'HANDS_FREE_REPLY_'+chats.length})}\n\ndata: ${JSON.stringify({type:'done',model:'fixture'})}\n\n`});});
    await page.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await page.locator('[data-open]').click();await page.locator('[data-assistant-composer]').waitFor();
    const button=(fr,arabic)=>page.getByRole('button',{name:ar?arabic:fr,exact:true});
    const state=async value=>page.locator(`.editorial-voice[data-voice-state="${value}"]`).waitFor();
    const enter=async()=>{await button('Mode vocal','الوضع الصوتي').click();await state('listening');};
    const speak=async()=>{await page.evaluate(()=>handsfreeTest.level=168);await state('user_speaking');await page.waitForTimeout(200);await page.evaluate(()=>handsfreeTest.level=128);};
    const finish=async()=>{const index=await page.evaluate(()=>handsfreeTest.transcripts.length);await page.locator('.editorial-voice__talk').click();await page.waitForFunction(n=>handsfreeTest.transcripts.length===n+1,index);return index;};
    await enter();
    check(`${key}: actual Drawer enters hands-free listening`,await page.evaluate(()=>handsfreeTest.tracks[0].enabled&&handsfreeTest.recorders[0].state==='recording'));
    check(`${key}: component CSS is loaded`,await page.locator('.editorial-voice').evaluate(el=>getComputedStyle(el).display==='flex'));

    await page.evaluate(()=>{handsfreeTest.holdStop=true;window.oldError=handsfreeTest.recorders[0].onerror;window.oldData=handsfreeTest.recorders[0].ondataavailable;});
    await button('Couper le microphone','كتم الصوت').click();await state('muted');await button('Activer le microphone','إلغاء كتم الصوت').click();await state('listening');
    await page.evaluate(()=>{handsfreeTest.holdStop=false;handsfreeTest.held.splice(0).forEach(flush=>flush());oldError();oldData({data:new Blob([new Uint8Array(250).fill(99)])});});
    await state('listening');
    check(`${key}: late discarded recorder events cannot stop the new capture`,await page.evaluate(()=>!handsfreeTest.tracks[0].stopped&&handsfreeTest.recorders.at(-1).state==='recording'));
    await speak();await page.evaluate(()=>handsfreeTest.recorders.at(-1).chunk(300,42));let transcript=await finish();
    const bytes=await page.evaluate(async index=>Array.from(new Uint8Array(await handsfreeTest.transcripts[index].audio.arrayBuffer())),transcript);
    check(`${key}: upload keeps header, speech and final fragments without old bytes`,bytes.length===840&&bytes[0]===1&&bytes[180]===42&&bytes.at(-1)===3&&!bytes.includes(99),{length:bytes.length});
    check(`${key}: microphone stays disabled during transcription`,await page.evaluate(()=>!handsfreeTest.tracks.at(-1).enabled));
    await page.evaluate(index=>handsfreeTest.transcripts[index].reply('CURRENT_VOICE_TURN'),transcript);await state('listening');
    check(`${key}: a completed voice turn sends once and resumes listening`,chats.length===1&&JSON.stringify(chats[0]).includes('CURRENT_VOICE_TURN'));

    await speak();const before=await page.evaluate(()=>handsfreeTest.transcripts.length);
    await page.evaluate(()=>handsfreeTest.holdStop=true);await page.locator('.editorial-voice__talk').click();await state('transcribing');
    await button('Couper le microphone','كتم الصوت').click();await button('Activer le microphone','إلغاء كتم الصوت').click();await state('listening');
    await page.evaluate(()=>{handsfreeTest.holdStop=false;handsfreeTest.held.splice(0).forEach(flush=>flush());});
    check(`${key}: muting during final flush cancels rather than uploading partial audio`,await page.evaluate(n=>handsfreeTest.transcripts.length===n,before));
    check(`${key}: unmute does not get stuck in an obsolete transcribing state`,await page.locator('.editorial-voice').getAttribute('data-voice-state')==='listening');

    await speak();transcript=await finish();await button('Couper le microphone','كتم الصوت').click();
    await page.evaluate(index=>handsfreeTest.transcripts[index].reply('',503),transcript);await state('muted');
    check(`${key}: service failure preserves the microphone mute`,await page.evaluate(()=>!handsfreeTest.tracks.at(-1).enabled));
    await page.getByText(ar?'تعذّر تحويل هذا التسجيل إلى نص. أعد المحاولة.':'Impossible de transcrire cet enregistrement. Réessayez.',{exact:true}).waitFor();
    check(`${key}: service failure is localized without pretending there was no speech`,(await page.locator('body').innerText()).includes(ar?'تعذّر تحويل هذا التسجيل':'Impossible de transcrire cet enregistrement'));
    await button('Activer le microphone','إلغاء كتم الصوت').click();await state('listening');
    check(`${key}: unmute after failure creates a working new capture`,await page.evaluate(()=>handsfreeTest.recorders.at(-1).state==='recording'));

    await speak();transcript=await finish();await button('Fermer le mode vocal','إغلاق الوضع الصوتي').click();await page.locator('[data-assistant-composer]').waitFor();
    await page.evaluate(index=>handsfreeTest.transcripts[index].reply('OLD_CLOSED_TURN'),transcript);await page.waitForTimeout(60);
    check(`${key}: closing voice mode aborts transcription ownership`,await page.evaluate(index=>handsfreeTest.transcripts[index].signal.aborted,transcript));
    check(`${key}: ignored transport abort cannot send the old turn`,chats.length===1&&!await page.getByText('OLD_CLOSED_TURN',{exact:true}).count());
    check(`${key}: closing releases all microphone tracks`,await page.evaluate(()=>handsfreeTest.tracks.every(track=>track.stopped)));

    await enter();await page.evaluate(()=>handsfreeTest.recorders.at(-1).chunk(12*1024*1024+1,7));await state('error');
    check(`${key}: capture memory budget fails closed without an upload`,await page.evaluate(()=>handsfreeTest.tracks.at(-1).stopped)&&chats.length===1);
    check(`${key}: failed microphone cannot be falsely reactivated by a mute toggle`,await button('Couper le microphone','كتم الصوت').isDisabled());
    check(`${key}: resource-limit failure is localized and gives a recovery route`,(await page.locator('body').innerText()).includes(ar?'أعد فتح الوضع الصوتي':'Rouvrez le mode vocal'));
    await page.screenshot({path:`${output}/handsfree-${locale}-${width}.png`});
    await button('Fermer le mode vocal','إغلاق الوضع الصوتي').click();await page.locator('[data-assistant-composer]').waitFor();
    check(`${key}: text chat remains available after a capture failure`,await page.getByRole('textbox',{name:ar?'رسالتك':'Votre message',exact:true}).isVisible());
    await context.close();
  }
  check('No uncaught browser errors',errors.length===0,errors);
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally{fs.writeFileSync(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));await browser.close();console.log(`${checks.filter(c=>c.pass).length}/${checks.length} SONIM hands-free assertions passed`);}
