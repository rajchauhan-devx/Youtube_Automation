import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const previousKey=process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY='fixture';
const {llmRouter}=await import('../dist/routes/llm.js');
const originalFetch=globalThis.fetch;
let mode, calls, cancelled, entered;
globalThis.fetch=async (url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url,options);
  calls++;
  if(mode==='cancel') return new Promise((_resolve,reject)=>{
    entered=true;
    options.signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('Cancelled','AbortError'));},{once:true});
  });
  if(mode==='daily'||(mode==='minute'&&calls===1)) return Response.json({error:{message:'Quota exceeded',details:[{quotaId:mode==='daily'?'GenerateRequestsPerDayPerProject':'GenerateRequestsPerMinutePerProject'},{retryDelay:'0.01s'}]}},{status:429});
  const payload=JSON.parse(options.body);
  assert.equal(payload.generationConfig.responseMimeType,'application/json');
  assert.equal(payload.generationConfig.responseJsonSchema.properties.greeting.type,'string');
  return new Response(`data: ${JSON.stringify({candidates:[{content:{parts:[{text:'{"greeting":"Hello"}'}]},finishReason:'STOP'}]})}\n\n`);
};
const app=express();app.use(express.json());app.use('/llm',llmRouter);
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const request=signal=>originalFetch(`http://127.0.0.1:${server.address().port}/llm/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model:'gemini-3.1-flash-lite',messages:[{role:'user',content:'Hello'}],jsonSchema:{type:'object',properties:{greeting:{type:'string'}},required:['greeting']}})});
test.after(async()=>{globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});

test('temporary Gemini rate limits retry the same structured request and preserve its output',async()=>{
  mode='minute';calls=0;
  const response=await request();const text=await response.text();
  assert.equal(calls,2);assert.match(text,/Hello/);assert.match(text,/STOP/);assert.ok(!text.includes('error'));
});
test('daily Gemini quota exhaustion fails without repeated paid requests',async()=>{
  mode='daily';calls=0;
  const text=await(await request()).text();assert.equal(calls,1);assert.match(text,/Gemini API error 429/);
});
test('disconnecting the browser aborts upstream Gemini work',async()=>{
  mode='cancel';calls=0;cancelled=false;entered=false;
  const controller=new AbortController();const response=await request(controller.signal);
  for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(entered);controller.abort();await response.text().catch(()=>{});
  for(let i=0;!cancelled&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(cancelled);assert.equal(calls,1);
});
