import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toolRegistry} from './tools.mjs';
const call=(name,args)=>({function:{name,arguments:JSON.stringify(args)}});
for(const status of ['succeeded','failed','cancelled'])test(`ended ${status} tasks cannot be reopened by Router`,()=>{
 const task={id:'old',sessionId:'s',status,version:2};let mutated=false;
 const registry=toolRegistry({get:()=>task,action:()=>{mutated=true},ask:()=>{mutated=true}});
 for(const action of ['update','retry'])assert.throws(()=>registry.execute(call('control_task',{taskId:'old',action,version:2,input:'新的需求'}),{sessionId:'s'}),/新建任务/);
 assert.throws(()=>registry.execute(call('ask_user',{taskId:'old',question:'补充什么？'}),{sessionId:'s'}),/新任务/);
 assert.equal(mutated,false);
});
test('waiting task supplements keep their identity',()=>{
 const task={id:'same',sessionId:'s',status:'waiting_input',version:2};let updated;
 const registry=toolRegistry({get:()=>task,action:(id,action,args)=>{updated={id,action,args};return {...task,input:args.input}}});
 registry.execute(call('control_task',{taskId:'same',action:'update',version:2,input:'原要求和补充'}),{sessionId:'s'});
 assert.equal(updated.id,'same');assert.equal(updated.action,'update');
});
