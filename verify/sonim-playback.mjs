import { chromium } from 'playwright';
import fs from 'node:fs';
const output='screenshots/editorial/sonim-playback';fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];let page;
const check=(label,pass,details)=>{checks.push({label,pass:Boolean(pass),details});if(!pass)throw new Error(label+': '+JSON.stringify(details));};
const browser=await chromium.launch({headless:true});
try {
  for(const locale of ['fr','ar']) for(const width of [320,390]) {
    const ar=locale==='ar',key=`${locale}/${width}`;
    const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
    await context.addInitScript(locale=>{
      localStorage.setItem('ayrovi.locale.v1',locale);
      const m=window.playbackTest={requests:[],decodes:[],sources:[],utterances:[],events:[],results:[],cancels:0};
      const original=window.fetch.bind(window);
      window.fetch=(url,init)=>String(url)==='/api/assistant/voice/tts'
        ?new Promise(resolve=>m.requests.push({signal:init.signal,body:JSON.parse(init.body),reply:status=>resolve(new Response(new Uint8Array(128),{status,headers:{'content-type':'audio/wav'}}))}))
        :original(url,init);
      class Context {
        state='running';destination={};
        createAnalyser(){return {connect(){},frequencyBinCount:64,getByteFrequencyData(data){data.fill(12);}};}
        createBufferSource(){const source={start(){this.started=true;},stop(){this.stopped=true;},connect(){},disconnect(){},onended:null,started:false,stopped:false};m.sources.push(source);return source;}
        decodeAudioData(){return new Promise(resolve=>m.decodes.push(()=>resolve({duration:1})));}
        resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
      }
      class Utterance {constructor(text){this.text=text;}}
      window.AudioContext=Context;window.SpeechSynthesisUtterance=Utterance;
      Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{paused:false,resume(){},cancel(){m.cancels++;},speak(utterance){m.utterances.push(utterance);},getVoices(){return ['fr-FR','ar-SA'].flatMap(lang=>[{lang,name:'Device female voice'},{lang,name:'Device male voice'}]);}}});
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(()=>{})}});
    },locale);
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/assistant/status',route=>route.fulfill({json:{success:true,data:{serverTextToSpeechReady:false}}}));
    await page.goto(process.env.AYROVI_BASE_URL+'/__verify/sonim');await page.locator('[data-open]').waitFor();
    const start=async({text=ar?'السعر {30 TND} item_code\n\nhttps://example.test/p#size':'Prix {30 TND} item_code\n\nhttps://example.test/p#size',server=true,settings={voiceId:'Puck',gender:'male',rate:.9}}={})=>{
      await page.evaluate(({text,server,settings,locale})=>{
        window.playback?.dispose();window.playback=new window.sonimTestVoiceOutput();
        playback.setServerTtsAvailable(server);playback.configure(settings);playbackTest.events=[];playbackTest.results=[];
        window.playbackPromise=playback.speak(text,locale,{onStart:()=>playbackTest.events.push(['start']),onEnd:result=>playbackTest.events.push(['end',result]),onError:message=>playbackTest.events.push(['error',message])}).then(result=>playbackTest.results.push(result));
      },{text,server,settings,locale});
    };
    await start();await page.evaluate(()=>playbackTest.requests.at(-1).reply(200));await page.waitForFunction(()=>playbackTest.decodes.length===1);
    await page.evaluate(()=>playback.stop());await page.waitForFunction(()=>playbackTest.results.length===1);
    check(`${key}: cancelling a decoder settles without native completion`,await page.evaluate(()=>playbackTest.results[0]==='cancelled'&&!playback.busy&&!playback.playing));
    await page.evaluate(()=>playbackTest.decodes[0]());await page.waitForTimeout(40);
    check(`${key}: late decode creates no ghost source or fallback`,await page.evaluate(()=>playbackTest.sources.length===0&&playbackTest.utterances.length===0));

    await start();const sent=await page.evaluate(()=>playbackTest.requests.at(-1).body);
    await page.evaluate(()=>{playback.configure({voiceId:'Kore',gender:'female',rate:1.25});playbackTest.requests.at(-1).reply(503);});
    await page.waitForFunction(()=>playbackTest.utterances.length===1);
    check(`${key}: server request keeps financial and URL content`,sent.text.includes('{30 TND}')&&sent.text.includes('item_code\n\nhttps://example.test/p#size'));
    check(`${key}: fallback keeps the original voice/rate snapshot`,await page.evaluate(()=>playbackTest.utterances[0].rate===.9&&playbackTest.utterances[0].voice.name==='Device male voice'&&playback.getSettings().rate===1.25));
    check(`${key}: queued utterance is busy but not playing`,await page.evaluate(()=>playback.busy&&!playback.playing));
    check(`${key}: fallback is not prematurely reported as error or completion`,await page.evaluate(()=>playbackTest.events.length===0));
    await page.evaluate(()=>{const u=playbackTest.utterances[0];window.oldStart=u.onstart;window.oldError=u.onerror;u.onstart();u.onstart();});
    check(`${key}: actual start changes playing exactly once`,await page.evaluate(()=>playback.playing&&playbackTest.events.filter(e=>e[0]==='start').length===1));
    await page.evaluate(()=>playbackTest.utterances[0].onend());await page.waitForFunction(()=>playbackTest.results.length===1);
    await page.evaluate(()=>{oldStart();oldError({error:'not-allowed'});});
    check(`${key}: end and late events produce one final result`,await page.evaluate(()=>playbackTest.events.filter(e=>e[0]==='end').length===1&&playbackTest.events.filter(e=>e[0]==='error').length===0&&!playback.busy&&!playback.playing));

    await start({text:ar?'صوت الخادم':'Voix serveur'});await page.evaluate(()=>playbackTest.requests.at(-1).reply(200));await page.waitForFunction(()=>playbackTest.decodes.length===2);await page.evaluate(()=>playbackTest.decodes[1]());await page.waitForFunction(()=>playbackTest.sources.length===1);
    check(`${key}: server playback waits for decode and starts one source`,await page.evaluate(()=>playbackTest.sources[0].started&&playback.playing&&playbackTest.results.length===0));
    await page.evaluate(()=>{window.lateEnd=playbackTest.sources[0].onended;playback.stop();});await page.waitForFunction(()=>playbackTest.results.length===1);
    check(`${key}: stop releases the running server source`,await page.evaluate(()=>playbackTest.sources[0].stopped&&playbackTest.results[0]==='cancelled'));
    await start({server:false});await page.evaluate(()=>lateEnd());
    check(`${key}: stale server end cannot settle the replacement`,await page.evaluate(()=>playback.busy&&playbackTest.results.length===0));
    await page.evaluate(()=>{const u=playbackTest.utterances.at(-1);u.onstart();u.onend();});await page.waitForFunction(()=>playbackTest.results.length===1);
    check(`${key}: replacement completes normally`,await page.evaluate(()=>playbackTest.results[0]==='ended'));

    await page.evaluate(()=>{window.savedSpeech=window.speechSynthesis;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});});
    await start({server:false});await page.waitForFunction(()=>playbackTest.results.length===1);
    const failure=await page.evaluate(()=>playbackTest.events);
    check(`${key}: unavailable output has one localized error`,failure.filter(e=>e[0]==='error').length===1&&failure.find(e=>e[0]==='error')[1].includes(ar?'تعذّر إخراج الرد':'Impossible de lire'));
    check(`${key}: unavailable output still completes once`,failure.filter(e=>e[0]==='end'&&e[1]==='unavailable').length===1);
    await page.evaluate(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:savedSpeech}));

    // The real Drawer and real nested voice-settings surface, not a static recreation.
    await page.locator('[data-open]').click();await page.locator('[data-assistant-composer]').waitFor();
    await page.getByRole('button',{name:ar?'الوضع الصوتي':'Mode vocal',exact:true}).click();
    await page.getByRole('button',{name:ar?'خيارات الوضع الصوتي':'Options du mode vocal',exact:true}).click();
    const settings=page.locator('.editorial-voice__settings');await settings.waitFor();
    check(`${key}: lazy component styles are actually loaded`,await settings.evaluate(el=>getComputedStyle(el).display==='flex'&&getComputedStyle(el.querySelector('.voice-choices')).display==='grid'));
    const caption=await settings.locator('.voice-caption').innerText();
    check(`${key}: settings disclose next-reading timing`,caption.includes(ar?'القراءة التالية':'prochaine lecture')&&!caption.includes(ar?'مباشرةً':'immédiatement'));
    check(`${key}: settings disclose the possible device-voice difference`,caption.includes(ar?'قد يختلف صوت الجهاز':'voix de l’appareil peut être différente'));
    await settings.getByRole('button',{name:/^Puck/}).click();await settings.getByRole('button',{name:'0.9x',exact:true}).click();
    check(`${key}: selected preset and rate match the controls`,await settings.locator('.voice-choices [aria-pressed=true]').innerText().then(text=>text.includes('Puck'))&&await settings.locator('.voice-rates [aria-pressed=true]').innerText()==='0.9x');
    // Wait for the inherited color transition too, not merely aria-pressed.
    await page.waitForFunction(()=>{const button=document.querySelector('.voice-rates [aria-pressed=true]');return button&&getComputedStyle(button).backgroundColor==='rgb(32, 32, 32)'&&getComputedStyle(button.firstElementChild).color==='rgb(255, 255, 255)';});
    check(`${key}: selected rate settles on readable action contrast`,await settings.locator('.voice-rates [aria-pressed=true]').evaluate(el=>getComputedStyle(el).color===getComputedStyle(el.firstElementChild).color));
    await page.screenshot({path:`${output}/settings-${locale}-${width}.png`});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    const bounds=await settings.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    check(`${key}: disclosure and controls fit enlarged phone text`,bounds.scroll<=bounds.client+1,bounds);
    await settings.getByRole('button',{name:ar?'تم':'Terminé',exact:true}).click();
    check(`${key}: settings completion remains reachable at 200 percent`,await settings.count()===0);
    await page.evaluate(()=>playback.dispose());await context.close();
  }
  check('No uncaught browser errors',errors.length===0,errors);
} catch(error){if(page&&!page.isClosed())await page.screenshot({path:`${output}/failure.png`,fullPage:true});throw error;}
finally{fs.writeFileSync(`${output}/checks.json`,JSON.stringify({checks,errors},null,2));await browser.close();console.log(`${checks.filter(c=>c.pass).length}/${checks.length} SONIM playback assertions passed`);}
