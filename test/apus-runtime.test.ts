import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createGuard } from '../dist/sdk/index.js';
import { createApusJudge } from '../src/decision/apus.js';
import { createJevJudge } from '../src/decision/jev.js';
import { captureAction } from '../src/decision/evidence.js';
import { decide } from '../src/decision/decide.js';
import { buildQuestions } from '../src/decision/questions.js';
import { currentFactReferences } from '../src/decision/assessment-contract.js';
import { ActionResolution } from '../src/runtime/resolved-action.js';
import { guardHarness } from './guard-harness.js';
import { APUS_MODEL, scriptedNative } from './apus-scripted.js';
import { policy } from './helpers.js';

const action = captureAction({ sessionId: 's', callId: 'c', toolName: 'fixture-only', arguments: { text: 'literal executable-looking data' } });
const base = { policy, action, cwd: '/fixture', deadlineMs: 5000 };
const options = { baseUrl: 'http://127.0.0.1:8088', model: APUS_MODEL };

for (const outcome of ['PASS', 'FAIL', 'UNKNOWN', 'APPROVAL_REQUIRED', 'NOT_APPLICABLE'] as const) test(`APUS and TypeSafe ${outcome} have identical canonical assessments and gates`, async () => {
  const questions = buildQuestions(policy) as Record<string, { criteria: Record<string,string> }>;
  const answers = Object.fromEntries(Object.entries(questions).map(([key,question]) => {
    const ids = Object.keys(question.criteria);
    const winner = key === 'rule_0_outcome' ? outcome : key.endsWith('_evidence') ? 'SUFFICIENT' : key.endsWith('_facts') ? 'NONE' : 'PASS';
    const weights = ids.map(id => Math.exp(id === winner ? 0 : -8.99)); const sum = weights.reduce((a,b)=>a+b,0);
    return [key,{type:'choice',choice:winner,confidence:1/sum,probabilities:Object.fromEntries(ids.map((id,i)=>[id,weights[i]!/sum]))}];
  }));
  const fake = scriptedNative({ winners: ['PASS','APPROVAL_REQUIRED','FAIL','UNKNOWN','NOT_APPLICABLE'].includes(outcome) ? ['ABCDE'[['PASS','APPROVAL_REQUIRED','FAIL','UNKNOWN','NOT_APPLICABLE'].indexOf(outcome)]!, 'A', 'A', 'A'] : undefined });
  const clock = { now:()=>0, schedule:()=>()=>{} };
  const apus = await decide({...base,clock,judge:createApusJudge({...options,fetch:fake.fetch})});
  const typesafe = await decide({...base,clock,judge:createJevJudge({apiKey:'offline-fixture',fetch:async()=>Response.json({model:APUS_MODEL,answers})})});
  assert.deepEqual(apus,typesafe); assert.ok(apus.assessment);
  if(outcome === 'NOT_APPLICABLE') { assert.equal(apus.decision,'BLOCK'); assert.ok(apus.diagnostics[0]!.gates.includes('applicability-unresolved')); }
});

test('authenticated-reference facts use inference; selected complete reference retains common applicability gates', async()=>{
  const resolution = new ActionResolution({id:'offline-resolver',version:'1',semantics:['file-read'],
    resolve:async({binding})=>({version:1,binding,integration:{id:'offline-resolver',version:'1'},resolverState:'1',coverage:'complete',limitations:[],
      operations:[{id:'read',semantics:'file-read',resources:[{requested:'/fixture',resolved:'/fixture',identity:'1',relation:'direct'}],content:[]}]}),revalidate:async()=>null});
  const resolved=await resolution.capture({host:'offline',contextId:'main',invocationId:'invocation',cwd:'/fixture',sessionId:'s',callId:'c',toolName:action.toolName,argumentDigest:action.argumentDigest},action.arguments,[],new AbortController().signal);
  const refs=currentFactReferences(resolved.evidence)!; assert.ok(refs);
  for(const winner of ['A','B']) {
    const fake=scriptedNative({winners:['E','A',winner,'A','A']}); const records:any[]=[];
    const result=await decide({...base,resolvedAction:resolved.evidence,judge:createApusJudge({...options,fetch:fake.fetch}),recording:(stage,data)=>records.push({stage,data})});
    assert.equal(fake.calls.filter(c=>c.path==='/completion').length,5);
    assert.equal(result.decision,winner==='B'?'ALLOW':'BLOCK');
    assert.equal(result.assessment!.rules[0]!.factReferences!.digest,winner==='B'?refs.digest:'NONE');
    assert.ok(!records.some(r=>r.data.value?.derivation==='sole-allowed-facts-selector'));
  }
});

for(const [name,winners,reason] of [
  ['integrity prohibition',['A','A','C','A'],'policy-integrity'],
  ['invalid integrity approval',['A','A','B','A'],'invalid-response'],
  ['insufficient evidence',['A','B','A','A'],'insufficient-evidence'],
] as const) test(`native ${name} cannot authorize`,async()=>{
  const fake=scriptedNative({winners:[...winners]}); const result=await decide({...base,judge:createApusJudge({...options,fetch:fake.fetch})});
  assert.equal(result.decision,'BLOCK');assert.equal(result.reason,reason);
});

async function owner(work:(home:string,cwd:string)=>Promise<void>) {
  const home=await realpath(await mkdtemp('/tmp/tenet-apus-owner-')); const previous=process.env.HOME; const priorFetch=globalThis.fetch;
  process.env.HOME=home; const cwd=join(home,'project');await mkdir(cwd); await writeFile(join(cwd,'TENET.md'),'Rule; Keep work local.');
  await mkdir(join(home,'.tenet'),{mode:0o700}); await writeFile(join(home,'.tenet/config.json'),JSON.stringify({version:1,judge:{provider:'apus-llamacpp',...options},decision:{deadlineMs:5000}}),{mode:0o600});
  try { await work(home,cwd); } finally {globalThis.fetch=priorFetch;if(previous===undefined)delete process.env.HOME;else process.env.HOME=previous;await rm(home,{recursive:true,force:true});}
}
const identity={sessionId:'s',contextId:'main'};
const call=(callId='c')=>({callId,toolName:'inert-fixture',input:{text:'literal data'}});

test('compiled SDK selects APUS lazily without credentials, captures only on opt-in, and never submits off/dormant work',async()=>owner(async(home,cwd)=>{
  const fake=scriptedNative();globalThis.fetch=fake.fetch;
  const records:{stage:string;data:any}[]=[];
  const g=createGuard({host:'offline',env:{TENET_MODE:'enforce',TENET_RECORDING:'off'},controlPath:join(home,'.tenet/control.json'),bindRecording:()=>((stage,data)=>records.push({stage,data}))});
  try {
    const s=g.openSession(identity,cwd);assert.equal((await s.ready).state,'ready');assert.equal(fake.calls.length,0);
    assert.deepEqual(g.status().judge,{provider:'apus-llamacpp',requestedModel:APUS_MODEL,availability:'ready',experimental:true,connectivity:'unverified'});
    const c=call();const result=await s.beforeTool({...c,current:()=>({...identity,...c})});assert.equal(result.permission,'released');assert.equal(result.assessment.status,'completed');assert.equal(result.execution,'unknown');
    assert.ok(records.some(r=>r.stage==='request'));assert.ok(records.some(r=>r.data.value?.derivation==='sole-allowed-facts-selector'));
    assert.equal(records.find(r=>r.stage==='assessment')!.data.requestedProvider,'apus-llamacpp');
    assert.ok(!(await readdir(join(home,'.tenet'))).includes('recordings'));
    const count=fake.calls.length;await g.setActivation('off');const c2=call('off');assert.equal((await s.beforeTool({...c2,current:()=>({...identity,...c2})})).bypassReason,'off');
    const dormant=join(home,'dormant');await mkdir(dormant);const d=g.openSession({sessionId:'d',contextId:'main'},dormant);assert.equal((await d.ready).state,'dormant');
    assert.equal(fake.calls.length,count);
  } finally {await g.close();}
  const off=createGuard({host:'offline',env:{TENET_MODE:'enforce',TENET_RECORDING:'off'},controlPath:join(home,'fresh/control.json')});
  try {const s=off.openSession(identity,cwd);await s.ready;const c=call();assert.equal((await s.beforeTool({...c,current:()=>({...identity,...c})})).assessment.status,'completed');assert.equal(off.status().capture.kind,'disabled');
    assert.ok(!(await readdir(join(home,'.tenet'))).includes('recordings'));} finally{await off.close();}
}));

test('compiled SDK native approval stays invocation-local and cannot release a changed call',async()=>owner(async(home,cwd)=>{
  globalThis.fetch=scriptedNative({winners:Array(3).fill(['B','A','A','A']).flat()}).fetch;
  const g=createGuard({host:'offline',capabilities:['interception','argument-stability','lifecycle-invalidation','trusted-approval'],env:{TENET_MODE:'enforce',TENET_RECORDING:'off'},controlPath:join(home,'.tenet/control.json')});
  try {const s=g.openSession(identity,cwd);await s.ready;let approvals=0;
    for(const id of ['one','two']) {const c=call(id);const result=await s.beforeTool({...c,current:()=>({...identity,...c}),approve:async r=>{assert.equal(await r.valid(),true);approvals++;return 'approved';}});assert.equal(result.permission,'released');assert.equal(result.assessment.wouldDecision,'ASK');}
    assert.equal(approvals,2);const c=call('changed');let current={...identity,...c};
    const changed=await s.beforeTool({...c,current:()=>current,approve:async()=>{current={...current,input:{text:'changed'}};return 'approved';}});assert.equal(changed.permission,'blocked');
  } finally {await g.close();}
}));

for(const mode of ['observe','enforce'] as const) for(const interruption of (mode === 'observe' ? ['invalidate','off','close'] : ['invalidate','off','close','cancel']) as ('invalidate'|'off'|'close'|'cancel')[]) test(`native ${mode} ${interruption} discards noncooperative late transport and stops submissions`,async()=>owner(async(home,cwd)=>{
  let started!:()=>void,late!:(v:Response)=>void;const ready=new Promise<void>(r=>{started=r;});let calls=0;let signal:AbortSignal|undefined;
  globalThis.fetch=async(_url,init)=>{calls++;signal=init!.signal!;started();return new Promise(r=>{late=r;});};
  const events:any[]=[];const records:any[]=[];
  const g=createGuard({host:'offline',env:{TENET_MODE:mode,TENET_RECORDING:'off'},controlPath:join(home,'.tenet/control.json'),onOwnerEvent:e=>events.push(e),bindRecording:()=>((stage,data)=>records.push({stage,data}))});
  try {const s=g.openSession(identity,cwd);await s.ready;const c=call();const controller=new AbortController();const pending=s.beforeTool({...c,signal:controller.signal,current:()=>({...identity,...c})});await ready;
    if(mode==='observe'){assert.equal((await pending).permission,'released');}
    if(interruption==='invalidate')s.invalidate('offline-race');else if(interruption==='off')await g.setActivation('off');else if(interruption==='close')await g.close();else controller.abort();
    const result=await pending;if(mode==='enforce')assert.equal(result.permission,'blocked');assert.equal(signal!.aborted,true);
    late(Response.json({object:'list',data:[]}));await new Promise(r=>setTimeout(r,15));assert.equal(calls,1);
    assert.ok(!events.some(e=>e.assessment?.status==='completed'));assert.ok(!records.some(r=>r.stage==='validation'&&r.data.valid===true));
  } finally {await g.close();}
}));

test('Pi selected-provider success, capture-off and failures remain owner-only',async()=>owner(async()=>{
  for(const fail of [false,true]) {
    const fake=scriptedNative({mutate:(v,c)=>fail&&c.path==='/completion'?new Response('private-error-canary',{status:503}):v});globalThis.fetch=fake.fetch;
    const h=await guardHarness({judge:null});
    try {await h.start();assert.equal(fake.calls.length,0);await h.call();const status=await h.assessed();assert.equal(status.status,fail?'unavailable':'completed');
      assert.equal(fake.calls.filter(c=>c.path==='/completion').length,fail?1:4);
      assert.match(h.notifications.join('\n'),/APUS llama.cpp experimental/);assert.equal(h.prompts.length,0);
      assert.ok(!h.records.some(r=>r.stage==='request'||r.stage==='response'||r.stage==='message'));
      assert.ok(!JSON.stringify(h.records).includes('private-error-canary'));assert.ok(!JSON.stringify(h.records).includes('<|im_start|>'));
    } finally {await h.close();}
  }
}));


for (const mode of ['observe','enforce'] as const) test(`compiled SDK ${mode} partial native failure keeps requested identity without returned model or fallback`, async()=>owner(async(home,cwd)=>{
  let scores=0;
  const fake=scriptedNative({mutate:(v,c)=>c.path==='/completion'&&++scores===2?new Response('private-error-canary',{status:503}):v});
  globalThis.fetch=fake.fetch;
  const records:any[]=[];const events:any[]=[];
  const g=createGuard({host:'offline',env:{TENET_MODE:mode,TENET_RECORDING:'off',TYPESAFE_API_KEY:'offline-must-not-forward'},controlPath:join(home,'.tenet/control.json'),
    bindRecording:()=>((stage,data)=>records.push({stage,data})),onOwnerEvent:e=>events.push(e)});
  try {
    const s=g.openSession(identity,cwd);await s.ready;const c=call();const result=await s.beforeTool({...c,current:()=>({...identity,...c})});
    assert.equal(result.permission,mode==='observe'?'released':'blocked');
    for(let i=0;mode==='observe'&&!events.some(e=>e.type==='assessment'&&e.assessment.status==='unavailable')&&i<100;i++)await new Promise(r=>setTimeout(r,5));
    const record=records.find(r=>r.stage==='assessment')!.data;
    assert.equal(record.requestedModel,APUS_MODEL);assert.equal(record.requestedProvider,'apus-llamacpp');assert.equal(record.assessment,null);
    assert.equal(record.returnedModel,undefined);assert.equal(record.model,undefined);
    assert.equal(scores,2);assert.equal(fake.calls.at(-1)!.path,'/completion');
    assert.ok(!JSON.stringify(records).includes('private-error-canary'));assert.ok(!JSON.stringify(fake.calls).includes('offline-must-not-forward'));
    assert.ok(!records.some(r=>r.stage==='validation'&&r.data.valid===true));
    if(mode==='observe')assert.equal(events.find(e=>e.type==='assessment'&&e.assessment.status==='unavailable').assessment.wouldDecision,undefined);
  } finally {await g.close();}
}));

test('pre-cancelled SDK native invocation sends no provider request', async()=>owner(async(home,cwd)=>{
  const fake=scriptedNative();globalThis.fetch=fake.fetch;
  const g=createGuard({host:'offline',env:{TENET_MODE:'enforce',TENET_RECORDING:'off'},controlPath:join(home,'.tenet/control.json')});
  try {const s=g.openSession(identity,cwd);await s.ready;const c=call();const controller=new AbortController();controller.abort();
    assert.equal((await s.beforeTool({...c,signal:controller.signal,current:()=>({...identity,...c})})).permission,'blocked');assert.equal(fake.calls.length,0);
  } finally {await g.close();}
}));
