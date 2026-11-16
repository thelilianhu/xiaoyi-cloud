import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Harness} from './runtime.mjs';
import {toolRegistry} from './tools.mjs';
import {TaskQueue} from '../tasks.mjs';
const tick = () => new Promise(r=>setImmediate(r));
const call = (name,args, id='call-1') => ({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const tool = (...calls) => ({role:'assistant',content:null,tool_calls:calls});
const say = content => ({role:'assistant',content});
function setup(t,model, options={}) {
 const dir=mkdtempSync(join(tmpdir(),'xiaoyi-harness-'));
 const queue=new TaskQueue({file:join(dir,'tasks.json'),execute:async()=> '实际生成内容'});
 const config={file:join(dir,'harness.json'),model,registry:toolRegistry(queue),...options};
 const harness=new Harness(config);
 t.after(()=>{harness.close();queue.close();rmSync(dir,{recursive:true,force:true});});
 return {harness,queue,config};
}
const input = (message='帮我写介绍',requestId='r1',sessionId='s1')=>({message,requestId,sessionId});
async function done(harness,id) {
 for(let i=0;i<40;i++){await tick();const run=harness.get(id);if(!['running','queued'].includes(run.status))return run;}
 throw Error('run never finished');
}
test('natural-language turn calls tools, persists history and deduplicates submission',async t=>{
 let step=0;
 const {harness,queue}=setup(t,async({messages})=>{
  if(step++===0)return tool(call('create_text_task',{input:'写一份介绍'}));
  assert.equal(messages.at(-1).role,'tool');assert.ok(JSON.parse(messages.at(-1).content).task.id);
  return say('已提交文字任务。');
 });
 const run=harness.submit(input());
 assert.equal(harness.submit(input()).id,run.id);
 assert.throws(()=>harness.submit(input('不同内容')), {status:409});
 const result=await done(harness,run.id);
 assert.equal(result.status,'completed');assert.equal(queue.list('s1').length,1);
 assert.equal(queue.list('s1')[0].status,'succeeded');
 assert.ok(harness.session('s1').messages.at(-1).content.includes(queue.list('s1')[0].name));assert.equal(step,1);
 assert.ok(result.events.some(e=>e.type==='tool_result'));
 assert.equal(result.events.find(e=>e.type==='tool_started').input.input,'写一份介绍');
 assert.equal(result.events.find(e=>e.type==='model_completed').step,1);
 assert.ok(result.events.find(e=>e.type==='tool_result').durationMs>=0);
 assert.equal(harness.session('s1').lastRunId,run.id);
});
test('clarification is persisted and next turn receives the answer',async t=>{
 let step=0;
 const {harness}=setup(t,async({messages})=>{
  if(step++===0)return tool(call('ask_user',{question:'介绍面向谁？'}));
  assert.deepEqual(messages.slice(-3).map(m=>m.content),['帮我写介绍','介绍面向谁？','面向新同事']);
  return say('收到。');
 });
 assert.equal((await done(harness,harness.submit(input()).id)).status,'waiting_input');
 assert.equal((await done(harness,harness.submit(input('面向新同事','r2')).id)).status,'completed');
});
test('invalid, unknown and cross-session tools cannot mutate tasks',async t=>{
 const {harness,queue}=setup(t,async()=>say('ok'));
 const registry=toolRegistry(queue);
 const task=queue.create({input:'别的会话任务',sessionId:'other',requestId:'1'});
 const context={sessionId:'s1',runId:'run'};
 assert.throws(()=>registry.execute(call('control_task',{taskId:task.id,action:'cancel',version:task.version}),context),{status:404});
 assert.throws(()=>registry.execute(call('shell',{command:'rm'}),context),{status:400});
 assert.throws(()=>registry.execute(call('create_text_task',{input:'text',extra:true}),context),{status:400});
 assert.throws(()=>harness.session('__proto__'),{status:404});
 assert.throws(()=>harness.submit(input('text','r','__proto__')),{status:400});
 const a=registry.execute(call('create_text_task',{input:'same'},'a'),context);
 const b=registry.execute(call('create_text_task',{input:'same'},'b'),context);
 assert.equal(a.task.id,b.task.id);
});
test('tool failures return to model for correction without fake success',async t=>{
 let step=0;
 const {harness}=setup(t,async({messages})=>{
  if(step++===0)return tool(call('unknown',{}));
  assert.match(JSON.parse(messages.at(-1).content).error,/未授权/);return say('此能力尚未接入。');
 });
 assert.equal((await done(harness,harness.submit(input()).id)).output,'此能力尚未接入。');
});
test('loop budget, session serialization and cancellation stop late tool effects',async t=>{
 const looping=setup(t,async()=>tool(call('list_tasks',{})),{maxSteps:2});
 assert.equal((await done(looping.harness,looping.harness.submit(input()).id)).status,'failed');
 let finish;
 const {harness,queue}=setup(t,()=>new Promise(r=>{finish=r;}));
 const run=harness.submit(input());await tick();
 assert.throws(()=>harness.submit(input('下一条','r2')),{status:409});
 harness.cancel(run.id);finish(tool(call('create_text_task',{input:'迟到创建'})));await tick();
 assert.equal(harness.get(run.id).status,'cancelled');assert.equal(queue.list().length,0);
});
test('restart does not replay uncertain tool effects',async t=>{
 const {harness,config}=setup(t,()=>new Promise(()=>{}));
 const run=harness.submit(input());await tick();
 const restored=new Harness({...config,model:async()=>say('new')});t.after(()=>restored.close());
 assert.equal(restored.get(run.id).status,'failed');
 assert.match(restored.get(run.id).error,/服务重启/);
 assert.equal(restored.submit(input()).id,run.id);
});
test('ask-user mixed with mutations is rejected before any tool executes',async t=>{
 const {harness,queue}=setup(t,async()=>tool(call('create_text_task',{input:'text'},'a'),call('ask_user',{question:'谁？'},'b')));
 assert.equal((await done(harness,harness.submit(input()).id)).status,'failed');
 assert.equal(queue.list().length,0);
});

test('exact greetings and scoped list queries avoid model; ambiguous messages still use it',async t=>{
 let calls=0;const {harness,queue}=setup(t,async()=>{calls++;return say('模型回复');});
 const greeting=await done(harness,harness.submit(input('你好')).id);
 assert.equal(calls,0);assert.ok(greeting.events.some(e=>e.type==='fast_route'));
 queue.create({input:'本会话任务',sessionId:'s1',requestId:'q1'});
 queue.create({input:'其他会话秘密',sessionId:'other',requestId:'q2'});
 const listed=await done(harness,harness.submit(input('查看任务','r2')).id);
 assert.match(listed.output,/本会话任务/);assert.doesNotMatch(listed.output,/其他会话秘密/);assert.equal(calls,0);
 await done(harness,harness.submit(input('你好，帮我写介绍','r3')).id);assert.equal(calls,1);
});
test('answers to clarification must not enter fast route',async t=>{
 let calls=0;const {harness}=setup(t,async()=>++calls===1?tool(call('ask_user',{question:'要写哪个词？'})):say('收到'));
 await done(harness,harness.submit(input('帮我写一个词')).id);
 await done(harness,harness.submit(input('你好','r2')).id);assert.equal(calls,2);
});
test('task clarification creates a waiting task and answer continues that same task',async t=>{
 let step=0;let taskId;
 const {harness,queue}=setup(t,async({messages})=>{
  if(step++===0)return tool(call('ask_user',{question:'请提供待总结的原文。',input:'总结用户提供的文章',name:'文章总结'}));
  assert.ok(messages.some(m=>m.role==='system'&&m.content.includes(taskId)));
  const task=queue.get(taskId);
  return tool(call('control_task',{taskId,action:'update',version:task.version,input:'总结以下原文：今天我们完成了产品测试。'}));
 });
 const first=await done(harness,harness.submit(input('总结文章')).id);
 assert.equal(first.status,'waiting_input');assert.equal(queue.list('s1').length,1);
 const task=queue.list('s1')[0];taskId=task.id;assert.equal(task.status,'waiting_input');assert.equal(task.attempts,0);
 assert.equal(task.pendingQuestion,'请提供待总结的原文。');
 await done(harness,harness.submit(input('今天我们完成了产品测试。','r2')).id);await tick();
 assert.equal(queue.list('s1').length,1);assert.equal(queue.get(taskId).status,'succeeded');
 assert.equal(queue.get(taskId).pendingQuestion,null);assert.match(queue.get(taskId).questions[0].answer,/产品测试/);
 const registry=toolRegistry(queue);
 assert.throws(()=>registry.execute(call('ask_user',{taskId,question:'跨会话问题'}),{sessionId:'other',runId:'other'}),{status:404});
});
test('submission claims without a tool receipt are repaired into a real task',async t=>{
 let calls=0;
 const {harness,queue}=setup(t,async()=>++calls===1?say('已提交，先按默认范围调研。'):tool(call('create_text_task',{name:'Personal AI 调研',input:'调研 Personal AI 的产品形态与机会'})));
 const run=await done(harness,harness.submit(input('帮我深度调研下personal AI')).id);
 assert.equal(run.status,'completed');assert.equal(queue.list('s1').length,1);assert.equal(calls,2);
 assert.ok(run.events.some(e=>e.type==='submission_check'));
});
test('repeated false submission cannot finish successfully',async t=>{
 const {harness,queue}=setup(t,async()=>say('已创建任务。'));
 const run=await done(harness,harness.submit(input('帮我做行业分析')).id);
 assert.equal(run.status,'failed');assert.equal(queue.list('s1').length,0);
});
test('task clarification survives unrelated conversation and updates the original task',async t=>{
 let taskId;let step=0;
 const {harness,queue}=setup(t,async({messages})=>{
  step++;
  if(step===1)return tool(call('ask_user',{question:'PPT 做几页？',input:'制作旅行 PPT',name:'旅行 PPT'}));
  if(step===2)return say('天气问题需要具体城市。');
  assert.ok(messages.some(m=>m.role==='system'&&m.content.includes(taskId)&&m.content.includes('PPT 做几页')));
  return tool(call('control_task',{taskId,action:'update',version:queue.get(taskId).version,input:'制作旅行 PPT，共 10 页',name:'旅行 PPT'}));
 });
 await done(harness,harness.submit(input('制作旅行 PPT')).id);taskId=queue.list('s1')[0].id;
 await done(harness,harness.submit(input('天气怎么样','r2')).id);
 assert.equal(queue.get(taskId).status,'waiting_input');
 await done(harness,harness.submit(input('刚才那个做10页','r3')).id);await tick();
 assert.equal(queue.list('s1').length,1);assert.equal(queue.get(taskId).pendingQuestion,null);assert.match(queue.get(taskId).input,/10 页/);
});

test('device location reaches tool only for the submitting turn',async t=>{
 let response;
 const {harness}=setup(t,async({messages})=>{
  if(messages.at(-1).role==='tool'){response=JSON.parse(messages.at(-1).content);return say('位置查询已处理。');}
  return tool(call('get_current_location',{}));
 });
 const first=harness.submit({...input('我在哪里'),location:{available:true,latitude:28.2,longitude:112.9,accuracy:100,timestamp:Date.now(),city:'长沙'}});
 await done(harness,first.id);assert.equal(response.city,'长沙');assert.equal(harness.get(first.id).input,'我在哪里');
 await done(harness,harness.submit(input('再查我的位置','r2')).id);assert.equal(response.available,false);
});
