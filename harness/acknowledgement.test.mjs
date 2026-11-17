import test from 'node:test';
import assert from 'node:assert/strict';
import {taskAcknowledgement as ack} from './acknowledgement.mjs';
test('acknowledgement reflects action and preserves simulation and failure boundaries',()=>{
 const t={name:'上海三日游攻略',status:'queued'};
 assert.match(ack('create_text_task',t),/目的地.*安排行程/);
 assert.match(ack('create_research_task',t),/查.*资料/);
 assert.match(ack('create_phone_task',t),/目的地.*安排行程/);
 assert.doesNotMatch(ack('create_phone_task',t),/演示一下|操作流程/);
 assert.match(ack('control_task',t,'update'),/按你刚才的要求调整/);
 assert.match(ack('control_task',{...t,status:'cancelled'}),/已经停下/);
 assert.doesNotMatch(ack('create_text_task',{...t,status:'failed'}),/交给我|做好了/);
});

test('success replies vary across recent tasks without claiming completion',()=>{
 const recent=[];
 for(let i=0;i<5;i++)recent.push(ack('create_text_task',{name:`文案${i}`,status:'queued'},undefined,recent));
 assert.equal(new Set(recent.map(s=>s.replace(/文案\d/g,'任务').split('，')[0])).size,5);
 assert.ok(recent.every(s=>! /已完成|已经做好|已发送/.test(s)));
 assert.match(ack('create_phone_task',{name:'旅行视频',status:'queued'}),/脚本和分镜/);
 assert.match(ack('create_phone_task',{name:'挑选相册照片',status:'queued'}),/筛选.*照片/);
});

 test('shopping acknowledgement is conversational and grounded in the requested app and item',()=>{
 const reply=ack('create_phone_task',{name:'淘宝购买牛奶',input:'去淘宝买牛奶',status:'queued'});
 assert.equal(reply,'好的，我帮你去淘宝找款合适的牛奶。');
 assert.doesNotMatch(reply,/往下处理|我来做|“|已购买|已下单/);
 assert.doesNotMatch(ack('create_phone_task',{name:'买牛奶',status:'queued'}),/淘宝/);
 });
