import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulatePhone} from './phone-simulator.mjs';
test('phone simulation reports sequential clicks without real purchase',async()=>{
 const events=[];const result=await simulatePhone({input:'淘宝买牛奶'},new AbortController().signal,e=>events.push(e),0);
 assert.equal(events.length,46);assert.deepEqual(events.filter(e=>e.type==='tool_result').map(e=>e.step),Array.from({length:23},(_,i)=>i+1));assert.ok(events.some(e=>e.name==='mock_phone.swipe'));assert.ok(events.some(e=>e.name==='mock_phone.wait'));
 assert.ok(events.filter(e=>e.result).every(e=>e.result.simulated&&!e.result.paymentMade&&!e.result.realOrderCreated));assert.match(result,/没有真实下单/);
});
test('cancelling interrupts pending click and prevents later steps',async()=>{
 const c=new AbortController();const events=[];
 await assert.rejects(simulatePhone({input:'买牛奶'},c.signal,e=>{events.push(e);c.abort();},20),{name:'AbortError'});
 assert.equal(events.length,1);
});

test('default phone step lasts approximately three seconds',async()=>{
 const c=new AbortController();let completed;
 await assert.rejects(simulatePhone({input:'买牛奶'},c.signal,e=>{if(e.type==='tool_result'){completed=e;c.abort();}}),{name:'AbortError'});
 assert.ok(completed.durationMs>=2900);assert.equal(completed.total,23);
});

test('media, slides and mail use relevant fallback steps',async()=>{
 for(const [input,label] of [['生成旅行视频','规划画面分镜'],['生成海报图片','设计主体构图'],['制作长沙PPT','构建内容大纲'],['处理邮件','分类筛选邮件'],['查找相册里的周末照片','查找相关照片'],['筛选旅行图片','按时间与主题筛选']]){
  const events=[];await simulatePhone({input},new AbortController().signal,e=>events.push(e),0);
  assert.ok(events.some(e=>e.label===label));
  assert.ok(events.filter(e=>e.result).every(e=>e.result.simulated));
 }
});

test('unknown named applications retain their name in simulation',async()=>{
 const events=[];await simulatePhone({input:'去星河应用整理收藏'},new AbortController().signal,e=>events.push(e),0);
 assert.equal(events[0].input.app,'星河');assert.ok(events.every(e=>e.simulated));
});
