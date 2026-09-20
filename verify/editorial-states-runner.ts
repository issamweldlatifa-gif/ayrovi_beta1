import express from 'express';
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
async function run(){
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:':memory:',CUSTOMER_AUTH_SECRET:'editorial-states-test-only-secret-01234567890123456789',ADMIN_EMAIL:'states@example.test',ADMIN_PASSWORD:'States-test-only-123!',MAIL_PROVIDER:'',MAIL_API_KEY:'',MAIL_FROM:'',GOOGLE_CLIENT_ID:'',FACEBOOK_APP_ID:'',APPLE_CLIENT_ID:'',CUSTOMER_OTP_PROVIDER:'console',ANTHROPIC_API_KEY:'',OPENAI_API_KEY:'',GROQ_API_KEY:'',GEMINI_API_KEY:'',GOOGLE_API_KEY:'',SERPAPI_KEY:'',SCRAPERAPI_KEY:'',AYROVIX_AI_WEB_SEARCH:'false'});
 mkdirSync('.cache',{recursive:true});
 await build({entryPoints:['verify/editorial-state-fixture.tsx'],outfile:'.cache/editorial-state-fixture.js',bundle:true,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const {app,db}=await import('../src/server');
 const wrapper=express();
 const styles=[...readFileSync('public/index.html','utf8').matchAll(/href="([^\"]+\.css)"/g)].map(m=>`<link rel="stylesheet" href="${m[1]}">`).join('');
 wrapper.get('/__verify/states',(_req,res)=>res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<link rel="stylesheet" href="/__verify/states.css"></head><body><div id="state-root"></div><script src="/__verify/states.js"></script></body></html>`));
 wrapper.get('/__verify/states.js',(_req,res)=>res.sendFile(path.resolve('.cache/editorial-state-fixture.js')));
 wrapper.get('/__verify/states.css',(_req,res)=>res.sendFile(path.resolve('.cache/editorial-state-fixture.css')));
 wrapper.use(app);
 const server=wrapper.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const child=spawn(process.execPath,['verify/editorial-states.mjs'],{env:{...process.env,AYROVI_BASE_URL:`http://127.0.0.1:${(server.address() as any).port}`},stdio:'inherit'});
  const timer=setTimeout(()=>child.kill('SIGTERM'),180_000);
  try{const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});if(code)throw new Error(`Editorial state checks failed (${code})`);}finally{clearTimeout(timer);}
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
