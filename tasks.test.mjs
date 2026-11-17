import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TaskQueue} from './tasks.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(t, execute, concurrency = 2) {
 const dir = mkdtempSync(join(tmpdir(), 'xiaoyi-tasks-'));
 const options = {file: join(dir, 'tasks.json'), execute, concurrency};
 const queue = new TaskQueue(options);
 t.after(() => {queue.close(); rmSync(dir, {recursive: true, force: true});});
 return {queue, options};
}
const payload = (requestId = 'one') => ({input: '写一段介绍', sessionId: 'session', requestId});
test('persisted completion and duplicate request safety', async t => {
 let calls = 0;
 const {queue, options} = setup(t, async () => {calls++; return '完成的介绍';});
 const first = queue.create(payload());
 assert.equal(queue.create(payload()).id, first.id);
 assert.throws(() => queue.create({...payload(), input: 'other'}), {status:409});
 await tick();
 assert.equal(calls, 1);
 assert.equal(queue.get(first.id).status, 'succeeded');
 const restored = new TaskQueue(options); t.after(() => restored.close());
 assert.equal(restored.get(first.id).result, '完成的介绍');
 assert.deepEqual(restored.get(first.id).events.map(e => e.status), ['queued','running','succeeded']);
});
test('cancel prevents late result overwriting terminal state', async t => {
 let finish;
 const {queue} = setup(t, () => new Promise(resolve => {finish = resolve;}));
 const first = queue.create(payload()); await tick();
 queue.action(first.id, 'cancel', {version:queue.get(first.id).version});
 finish('late'); await tick();
 assert.equal(queue.get(first.id).status, 'cancelled');
 assert.equal(queue.get(first.id).result, null);
});
test('failure retry, optimistic version and queued editing', async t => {
 let calls = 0;
 const {queue} = setup(t, async () => {if (++calls === 1) throw Error('failure'); return 'ok';});
 const first = queue.create(payload());
 queue.action(first.id, 'pause', {version: first.version});
 await tick(); assert.equal(calls, 0);
 assert.throws(() => queue.action(first.id, 'resume', {version:first.version}), {status:409});
 queue.action(first.id, 'update', {version:queue.get(first.id).version, input:'改写内容'});
 queue.action(first.id, 'resume', {version:queue.get(first.id).version});
 await tick(); assert.equal(queue.get(first.id).status,'failed');
 queue.action(first.id, 'retry', {version:queue.get(first.id).version});
 await tick(); assert.equal(queue.get(first.id).status,'succeeded');
 assert.equal(queue.get(first.id).attempts, 2);
});
test('restart marks interrupted work failed; queued work is recovered', async t => {
 const {queue, options} = setup(t, () => new Promise(() => {}), 1);
 const a = queue.create(payload('a')); const b = queue.create(payload('b')); await tick();
 queue.close();
 const restored = new TaskQueue({...options, execute:async () => 'recovered'}); t.after(() => restored.close());
 await tick();
 assert.equal(restored.get(a.id).status,'failed');
 assert.equal(restored.get(b.id).status,'succeeded');
});
test('completed task revisions keep identity and history and execute the new input', async t => {
 const {queue,options}=setup(t,async task=>'结果：'+task.input);
 const first=queue.create(payload());await tick();
 const done=structuredClone(queue.get(first.id));
 const revised=queue.action(first.id,'update',{version:done.version,input:'改为三日游'});
 assert.equal(revised.id,first.id);assert.equal(revised.status,'queued');assert.equal(revised.result,null);
 assert.equal(revised.revisions[0].result,done.result);
 assert.throws(()=>queue.action(first.id,'update',{version:done.version,input:'重复修改'}),{status:409});
 await tick();assert.equal(queue.get(first.id).result,'结果：改为三日游');assert.equal(queue.list().length,1);
 const restored=new TaskQueue(options);t.after(()=>restored.close());
 assert.equal(restored.get(first.id).revisions[0].input,done.input);
 assert.equal(restored.get(first.id).name,'改为三日游');assert.equal(restored.get(first.id).revisions[0].name,done.name);
});
test('editing running work aborts old attempt and ignores its late result and steps', async t=>{
 const calls=[];
 const {queue}=setup(t,(task,signal,report)=>new Promise(resolve=>calls.push({task,signal,report,resolve})),2);
 const first=queue.create(payload());await tick();
 const edited=queue.action(first.id,'update',{version:queue.get(first.id).version,input:'新版需求'});
 assert.equal(calls[0].signal.aborted,true);assert.equal(edited.status,'queued');
 queue.pump();await tick();assert.equal(calls.length,1);
 calls[0].report({type:'first_token'});calls[0].resolve('旧结果');await tick();
 assert.equal(calls.length,2);assert.equal(calls[1].task.input,'新版需求');
 assert.equal(queue.get(first.id).result,null);assert.deepEqual(queue.get(first.id).steps.map(s=>s.type),['intent_updated']);assert.equal(queue.get(first.id).steps[0].label,'更新任务要求');
 calls[1].resolve('新结果');await tick();assert.equal(queue.get(first.id).result,'新结果');
 assert.equal(queue.list().length,1);assert.equal(queue.get(first.id).revisions[0].input,first.input);
});
test('failed and cancelled tasks accept revised input on the same task',async t=>{
 const {queue}=setup(t,async task=>{if(task.input==='写一段介绍')throw Error('failure');return task.input;});
 const failed=queue.create(payload('failed'));await tick();
 queue.action(failed.id,'update',{version:queue.get(failed.id).version,input:'修订失败任务'});await tick();
 assert.equal(queue.get(failed.id).result,'修订失败任务');
 const cancelled=queue.create(payload('cancelled'));queue.action(cancelled.id,'cancel',{version:cancelled.version});
 queue.action(cancelled.id,'update',{version:queue.get(cancelled.id).version,input:'恢复并修改'});await tick();
 assert.equal(queue.get(cancelled.id).result,'恢复并修改');
});
test('four independent tasks run concurrently and queued work starts as a slot frees',async t=>{
 const calls=[];const {queue}=setup(t,(task)=>new Promise(resolve=>calls.push({id:task.id,resolve})),4);
 const tasks=Array.from({length:5},(_,i)=>queue.create(payload('parallel-'+i)));
 await tick();assert.equal(calls.length,4);assert.equal(queue.running.size,4);assert.equal(queue.get(tasks[4].id).status,'queued');
 calls[1].resolve('second finishes first');await tick();assert.equal(calls.length,5);assert.equal(queue.running.size,4);
 assert.equal(queue.get(tasks[0].id).status,'running');assert.equal(queue.get(tasks[4].id).status,'running');
 for(const call of calls)call.resolve('done');await tick();assert.ok(queue.list().every(t=>t.status==='succeeded'));
});
test('clearing tasks backs up records and aborts any running work',async t=>{
 let controller;
 const {queue,options}=setup(t,(_task,signal)=>new Promise(()=>{controller=signal;}));
 queue.create(payload());await tick();
 const result=queue.clear();
 assert.equal(result.cleared,1);assert.equal(queue.list().length,0);assert.equal(controller.aborted,true);
 assert.deepEqual(JSON.parse(readFileSync(options.file,'utf8')),[]);
 assert.ok(readFileSync(result.backup,'utf8').includes('写一段介绍'));
});

test('latest task input or explicit title updates its name without creating another task',async t=>{
 const {queue}=setup(t,async()=> '完成');const t1=queue.create({...payload(),name:'上海三日游'});await tick();
 queue.action(t1.id,'update',{version:queue.get(t1.id).version,input:'请写一份杭州五日游攻略，包含交通',name:'杭州五日游攻略'});await tick();
 assert.equal(queue.get(t1.id).name,'杭州五日游攻略');
 queue.action(t1.id,'update',{version:queue.get(t1.id).version,input:'请写一份苏州两日游攻略，包含交通'});await tick();
 assert.equal(queue.get(t1.id).name,'苏州两日游攻略');assert.equal(queue.list().length,1);
 assert.equal(queue.get(t1.id).revisions[0].name,'上海三日游');
});

test('editing travel intent records a visible milestone without creating another task',async t=>{
 const {queue}=setup(t,()=>new Promise(()=>{}));
 const task=queue.create({...payload(),input:'珠海三日旅行攻略',name:'珠海三日游'});await tick();
 const result=queue.action(task.id,'update',{version:queue.get(task.id).version,input:'改为长沙两日旅行攻略',name:'长沙两日游'});
 assert.equal(result.id,task.id);assert.equal(result.steps.at(-1).label,'调整旅行行程');assert.equal(result.steps.at(-1).type,'intent_updated');assert.equal(queue.list().length,1);
});
