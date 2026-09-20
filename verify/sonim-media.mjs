import { chromium } from 'playwright';
import fs from 'node:fs';
const baseline = process.env.SONIM_MEDIA_BASELINE === '1';
const output = process.env.SONIM_MEDIA_OUTPUT || 'screenshots/editorial/sonim-media'; fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
function check(label, pass, details) { checks.push({ label, pass: Boolean(pass), details }); if (!pass && !baseline) throw new Error(label + ': ' + JSON.stringify(details)); }
const browser = await chromium.launch({ headless: true }); let page;
try {
  for (const [locale,width] of baseline ? [['fr',320]] : [['fr',320],['fr',390],['ar',320],['ar',390]]) {
    const ar=locale==='ar', key=`${locale}/${width}`;
    const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await ctx.addInitScript(locale=>{
      localStorage.setItem('ayrovi.locale.v1',locale);
      const realBitmap=window.createImageBitmap.bind(window), realFetch=window.fetch.bind(window), realNow=Date.now;
      window.mediaTest={holdImages:true,images:[],closedBitmaps:0,permissions:[],tracks:[],recorders:[],transcripts:[],abortedTranscripts:0,clock:0,holdStop:false,lateStops:[]};
      const m=window.mediaTest; Date.now=()=>realNow()+m.clock;
      window.createImageBitmap=async(...args)=>{const bitmap=await realBitmap(...args);const close=bitmap.close.bind(bitmap);bitmap.close=()=>{m.closedBitmaps++;close();};if(m.holdImages)return new Promise(resolve=>m.images.push(()=>resolve(bitmap)));return bitmap;};
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise((resolve,reject)=>{
        const track={enabled:true,stopped:false,stop(){this.stopped=true;}}; m.tracks.push(track);
        m.permissions.push({grant:()=>resolve({getTracks:()=>[track],getAudioTracks:()=>[track]}),deny:()=>reject(new DOMException('Denied','NotAllowedError'))});
      })}});
      class Recorder {
        static isTypeSupported(){return true;} state='inactive';mimeType='audio/webm';onstop=null;onerror=null;ondataavailable=null;
        constructor(){m.recorders.push(this);} start(){this.state='recording';} stop(){this.state='inactive';const stop=this.onstop,data=this.ondataavailable;const fire=()=>{data?.({data:new Blob([new Uint8Array(400)],{type:this.mimeType})});stop?.();};if(m.holdStop)m.lateStops.push(fire);else queueMicrotask(fire);}
      }
      window.MediaRecorder=Recorder;
      window.fetch=(url,options)=>{
        if(String(url)!=='/api/assistant/transcribe')return realFetch(url,options);
        options.signal?.addEventListener('abort',()=>m.abortedTranscripts++);
        return new Promise(resolve=>m.transcripts.push({signal:options.signal,reply:(text,status=200)=>resolve(new Response(JSON.stringify({data:{text}}),{status,headers:{'content-type':'application/json'}}))}));
      };
    },locale);
    page=await ctx.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/assistant/status',route=>route.fulfill({json:{success:true,data:{voiceReady:false,serverTextToSpeechReady:false}}}));
    const chats=[];
    await page.route('**/api/assistant/chat',route=>{chats.push(route.request().postDataJSON());return route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'delta',text:'MEDIA_REPLY_'+chats.length})}\n\ndata: ${JSON.stringify({type:'done',model:'fixture'})}\n\n`});});
    const button=(fr,arabic)=>page.getByRole('button',{name:ar?arabic:fr,exact:true});
    const menu=()=>page.getByRole('dialog',{name:ar?'قائمة SONIM':'Menu SONIM',exact:true});
    const sheet=()=>page.getByRole('dialog',{name:ar?'إضافة إلى المحادثة':'Ajouter au chat',exact:true});
    const composer=()=>page.locator('[data-assistant-composer]');
    const box=()=>page.getByRole('textbox',{name:ar?'رسالتك':'Votre message',exact:true});
    const open=async()=>{if(!await composer().count())await page.locator('[data-open]').click();await composer().waitFor();await page.locator('[data-assistant-messages]').waitFor();};
    const reset=async()=>{await button('Menu','القائمة').click();await menu().getByRole('button',{name:ar?'محادثة جديدة':'Nouvelle conversation',exact:true}).click();await menu().waitFor({state:'hidden'});};
    const photo=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;canvas.getContext('2d').fillRect(0,0,20,20);return canvas.toDataURL().split(',')[1];});
    const file=name=>({name,mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    const pick=async(name)=>{if(!await sheet().count())await button('Ajouter au chat','إضافة إلى المحادثة').click();const n=await page.evaluate(()=>mediaTest.images.length);await sheet().locator('input[type=file]').first().setInputFiles(file(name));await page.waitForFunction(n=>mediaTest.images.length===n+1,n);return n;};
    const release=async index=>{await page.evaluate(index=>mediaTest.images[index](),index);await page.waitForTimeout(100);};
    const escape=async()=>{await page.keyboard.press('Escape');await page.waitForTimeout(70);};
    const requestMic=async()=>{const index=await page.evaluate(()=>mediaTest.permissions.length);await button('Enregistrer un message vocal','تسجيل صوتي').click();await page.waitForFunction(index=>mediaTest.permissions.length===index+1,index);return index;};
    const grant=async index=>{await page.evaluate(index=>mediaTest.permissions[index].grant(),index);await button('Terminer l’enregistrement','إنهاء التسجيل').waitFor();};
    const finish=async()=>{const index=await page.evaluate(()=>mediaTest.transcripts.length);await page.evaluate(()=>mediaTest.clock+=1000);await button('Terminer l’enregistrement','إنهاء التسجيل').click();await page.waitForFunction(index=>mediaTest.transcripts.length===index+1,index);return index;};
    const reply=async(index,text,status=200)=>{await page.evaluate(({index,text,status})=>mediaTest.transcripts[index].reply(text,status),{index,text,status});await page.waitForTimeout(100);};
    await page.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await open();

    let image=await pick('OLD_CONVERSATION.png');await escape();await reset();await release(image);
    check(`${key}: delayed image neither enters a new conversation nor closes SONIM`,await composer().count()===1&&await composer().locator('img').count()===0);
    if(baseline&&!await composer().count())await open();
    await reset();image=await pick('LAYER_OWNER.png');await escape();await button('Menu','القائمة').click();await release(image);
    check(`${key}: image completion cannot dismiss an unrelated menu`,await menu().count()===1);
    if(await menu().count())await escape();await reset();

    let permission=await requestMic();await grant(permission);let transcript=await finish();const before=chats.length;await reset();await reply(transcript,'STALE_TRANSCRIPT');
    check(`${key}: stale transcription cannot send after reset`,chats.length===before,{before,after:chats.length});
    check(`${key}: stale transcription cannot rewrite the new conversation`,!(await page.locator('[data-assistant-messages]').innerText()).includes('STALE_TRANSCRIPT'));
    if(baseline){await ctx.close();continue;}

    // Two reservations, a rejected third, and out-of-order completion.
    await reset();await box().fill('DRAFT_WITH_IMAGES');const first=await pick('FIRST.png');const second=await pick('SECOND.png');
    await sheet().locator('input[type=file]').first().setInputFiles(file('THIRD.png'));await page.waitForTimeout(80);
    check(`${key}: pending reservations count toward the two-image cap`,await page.evaluate(()=>mediaTest.images.length)===second+1);
    check(`${key}: pending image preparation is disclosed`,await sheet().locator('[data-media-pending=images]').count()===1);
    await escape();check(`${key}: sending waits for images`,await button('Envoyer','إرسال').isDisabled());
    await box().press('Enter');check(`${key}: Enter cannot send a partial attachment set`,chats.length===before);
    await release(second);check(`${key}: send still waits for the first image`,await button('Envoyer','إرسال').isDisabled());
    await release(first);check(`${key}: selection order survives inverted decode order`,(await composer().innerText()).indexOf('FIRST.png')<(await composer().innerText()).indexOf('SECOND.png'));
    await button('Envoyer','إرسال').click();await page.getByText('MEDIA_REPLY_'+(before+1),{exact:true}).waitFor();
    const uploaded=chats.at(-1).messages.at(-1).attachments;check(`${key}: both complete images reach the real API adapter`,uploaded.length===2&&uploaded.every(image=>image.type==='image/png'&&image.dataUrl.startsWith('data:image/png;base64,')),{count:uploaded.length});
    check(`${key}: sending clears the submitted attachments`,await composer().locator('img').count()===0);

    image=await pick('CANCELLED.png');await sheet().getByRole('button',{name:ar?'إلغاء تجهيز الصور':'Annuler la préparation des images',exact:true}).click();await release(image);
    check(`${key}: explicit image cancellation cannot append later`,await composer().locator('img').count()===0);await escape();
    await button('Ajouter au chat','إضافة إلى المحادثة').click();await sheet().locator('input[type=file]').first().setInputFiles({name:'corrupt.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')});await page.waitForTimeout(100);
    check(`${key}: corrupt image is rejected without attachment`,await composer().locator('img').count()===0 && (await page.locator('body').innerText()).includes(ar?'الصورة غير معروفة':'Image non reconnue'));await escape();

    permission=await requestMic();check(`${key}: permission waiting has a visible cancellable state`,await composer().locator('[data-media-pending=permission]').count()===1);
    await button('Annuler la demande de microphone','إلغاء طلب الميكروفون').click();await page.evaluate(index=>mediaTest.permissions[index].grant(),permission);await page.waitForTimeout(70);
    check(`${key}: cancelling permission immediately stops a later grant`,await page.evaluate(index=>mediaTest.tracks[index].stopped,permission));
    check(`${key}: cancelled permission never starts recording`,await button('Terminer l’enregistrement','إنهاء التسجيل').count()===0);

    permission=await requestMic();await page.evaluate(index=>mediaTest.permissions[index].deny(),permission);await page.waitForTimeout(70);
    check(`${key}: permission failure is localized`,(await page.locator('body').innerText()).includes(ar?'اسمح باستعمال الميكروفون':'Autorisez le microphone'));
    permission=await requestMic();await grant(permission);transcript=await finish();await button('Annuler la transcription','إلغاء تحويل الصوت إلى نص').click();const sent=chats.length;await reply(transcript,'CANCELLED_TRANSCRIPT');
    check(`${key}: transcription cancel aborts transport`,await page.evaluate(index=>mediaTest.transcripts[index].signal.aborted,transcript));
    check(`${key}: ignored transport abort still cannot send`,chats.length===sent);

    permission=await requestMic();await grant(permission);transcript=await finish();await reply(transcript,'',503);
    check(`${key}: service failure is not misreported as empty speech`,(await page.locator('body').innerText()).includes(ar?'تعذّر تحويل هذا التسجيل':'Impossible de transcrire cet enregistrement'));
    await box().fill('KEEP_TYPED_DRAFT');permission=await requestMic();await grant(permission);transcript=await finish();await reply(transcript,'VALID_SPOKEN_TEXT');await page.getByText('MEDIA_REPLY_'+(sent+1),{exact:true}).waitFor();
    check(`${key}: successful dictation sends exactly once`,chats.length===sent+1);
    check(`${key}: dictation does not discard an unrelated typed draft`,await box().inputValue()==='KEEP_TYPED_DRAFT');
    check(`${key}: dictation uses the latest conversation messages`,JSON.stringify(chats.at(-1)).includes('DRAFT_WITH_IMAGES')&&JSON.stringify(chats.at(-1)).includes('VALID_SPOKEN_TEXT'));

    // Old queued recorder callbacks must not control the new stream.
    await page.evaluate(()=>mediaTest.holdStop=true);permission=await requestMic();await grant(permission);await button('Annuler l’enregistrement','إلغاء التسجيل').click();
    const nextPermission=await requestMic();await grant(nextPermission);await page.evaluate(()=>{mediaTest.lateStops.splice(0).forEach(fn=>fn());mediaTest.holdStop=false;});
    check(`${key}: stale recorder stop cannot terminate a new recording`,!await page.evaluate(index=>mediaTest.tracks[index].stopped,nextPermission)&&await button('Terminer l’enregistrement','إنهاء التسجيل').count()===1);
    await button('Annuler l’enregistrement','إلغاء التسجيل').click();

    // Selecting and deleting the active history item are separate transitions.
    await reset();permission=await requestMic();await grant(permission);transcript=await finish();
    const beforeSelection=chats.length;await button('Menu','القائمة').click();await menu().getByRole('button',{name:/^DRAFT_WITH_IMAGES/}).click();await menu().waitFor({state:'hidden'});await reply(transcript,'OLD_SELECTION_TRANSCRIPT');
    check(`${key}: selecting another conversation cancels transcription`,chats.length===beforeSelection&&!(await page.locator('[data-assistant-messages]').innerText()).includes('OLD_SELECTION_TRANSCRIPT'));
    permission=await requestMic();await grant(permission);transcript=await finish();await button('Menu','القائمة').click();await menu().getByRole('button',{name:(ar?'حذف ':'Supprimer ')+'DRAFT_WITH_IMAGES',exact:true}).click();await escape();await reply(transcript,'DELETED_TRANSCRIPT');
    check(`${key}: deleting the active conversation cancels transcription`,chats.length===beforeSelection&&!(await page.locator('[data-assistant-messages]').innerText()).includes('DELETED_TRANSCRIPT'));
    permission=await requestMic();await grant(permission);transcript=await finish();await button('Fermer SONIM','إغلاق SONIM').click();await composer().waitFor({state:'hidden'});await open();await reply(transcript,'UNMOUNTED_TRANSCRIPT');
    check(`${key}: unmount and reopen cannot receive an old transcript`,chats.length===beforeSelection&&!(await page.locator('[data-assistant-messages]').innerText()).includes('UNMOUNTED_TRANSCRIPT'));

    // Actual component unmount, not a visually hidden drawer.
    permission=await requestMic();await button('Fermer SONIM','إغلاق SONIM').click();await composer().waitFor({state:'hidden'});await page.evaluate(index=>mediaTest.permissions[index].grant(),permission);await open();
    check(`${key}: unmount cancels outstanding microphone permission ownership`,await page.evaluate(index=>mediaTest.tracks[index].stopped,permission));
    image=await pick('ACCOUNT_OLD.png');await escape();await page.evaluate(()=>window.sonimSetScope('account-b'));await release(image);
    check(`${key}: changing account cancels pending images`,await composer().locator('img').count()===0);
    permission=await requestMic();await grant(permission);transcript=await finish();const count=chats.length;await page.evaluate(()=>window.sonimSetScope('account-c'));await reply(transcript,'ACCOUNT_OLD_TRANSCRIPT');
    check(`${key}: changing account suppresses old transcription`,chats.length===count&&!await page.getByText('ACCOUNT_OLD_TRANSCRIPT',{exact:true}).count());

    // Same image pipeline from the hands-free surface, cancelled across account changes.
    await button('Mode vocal','الوضع الصوتي').click();const voice=page.locator('.editorial-voice');await voice.waitFor();
    const voiceImage=await page.evaluate(()=>mediaTest.images.length);await voice.locator('input[type=file]').setInputFiles(file('VOICE_OLD.png'));await page.waitForFunction(n=>mediaTest.images.length===n+1,voiceImage);
    check(`${key}: voice attachment preparation is disclosed`,await voice.locator('[data-media-pending=images]').count()===1);
    await page.evaluate(()=>window.sonimSetScope('account-d'));await release(voiceImage);
    check(`${key}: account change exits hands-free mode and discards its pending photo`,await voice.count()===0&&await composer().locator('img').count()===0);
    await page.evaluate(()=>mediaTest.permissions.at(-1).grant());await page.waitForTimeout(50);
    check(`${key}: late hands-free permission is released`,await page.evaluate(()=>mediaTest.tracks.at(-1).stopped));

    await button('Mode vocal','الوضع الصوتي').click();await voice.waitFor();
    const transferringImage=await page.evaluate(()=>mediaTest.images.length);await voice.locator('input[type=file]').setInputFiles(file('SAME_THREAD_TRANSFER.png'));await page.waitForFunction(n=>mediaTest.images.length===n+1,transferringImage);
    await button('Fermer le mode vocal','إغلاق الوضع الصوتي').click();await composer().waitFor();await release(transferringImage);
    check(`${key}: switching from voice to text retains same-conversation photo preparation`,await composer().getByText('SAME_THREAD_TRANSFER.png',{exact:true}).count()===1);
    await button('Retirer SAME_THREAD_TRANSFER.png','إزالة SAME_THREAD_TRANSFER.png').click();
    await page.evaluate(()=>mediaTest.permissions.at(-1).grant());

    const longName=(ar?'اسم الصورة كامل دون اقتطاع ':'Nom complet de la photo sans troncature ').repeat(3)+'END.png';
    image=await pick(longName);await release(image);await sheet().waitFor({state:'hidden'});
    await page.screenshot({path:`${output}/media-normal-${locale}-${width}.png`});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');image=await pick('WAITING_ZOOM.png');await escape();
    check(`${key}: empty composer placeholder is not vertically clipped at enlarged text`,await box().evaluate(el=>el.scrollHeight<=el.clientHeight+1));
    const geometry=await composer().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));
    check(`${key}: long filenames and pending controls do not overflow at enlarged text`,geometry.scroll<=geometry.width+1,geometry);
    check(`${key}: complete filename remains available without ellipsis`,await composer().getByText(longName,{exact:true}).evaluate(el=>getComputedStyle(el).textOverflow!=='ellipsis'));
    await page.screenshot({path:`${output}/media-${locale}-${width}.png`});
    await composer().getByRole('region',{name:ar?'صور جاهزة للإرسال':'Images prêtes à envoyer',exact:true}).focus();
    check(`${key}: overflowing filename region is keyboard reachable`,await composer().getByRole('region').evaluate(el=>document.activeElement===el));
    await composer().getByRole('button',{name:ar?'إلغاء تجهيز الصور':'Annuler la préparation des images',exact:true}).click();await release(image);
    check(`${key}: cancellation remains reachable at enlarged text`,await composer().locator('[data-media-pending]').count()===0);
    await ctx.close();
  }
  check('No uncaught browser errors',errors.length===0,errors);
} catch(error) {if(page&&!page.isClosed())await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally {fs.writeFileSync(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));await browser.close();console.log(`${checks.filter(c=>c.pass).length}/${checks.length} SONIM media assertions passed`);if(checks.some(c=>!c.pass))process.exitCode=1;}
