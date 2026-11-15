import {Agent} from 'undici';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Harness} from './runtime.mjs';
import {createModel} from './model.mjs';
import {toolRegistry} from './tools.mjs';
import {TaskQueue} from '../tasks.mjs';
const connection=new Agent({connect:{family:4,timeout:30000}});
const model=createModel({base:process.env.MODEL_BASE_URL,key:process.env.MODEL_API_KEY,model:process.env.MODEL_NAME,dispatcher:connection,timeoutMs:60000});
const report=[];
try{
 for(const fastAcknowledgements of [false,true]){
  const dir=mkdtempSync(join(tmpdir(),'xiaoyi-benchmark-'));let calls=0;const start=Date.now();
  // Real model; local task tool uses a placeholder executor so no second writing job is billed.
  const queue=new TaskQueue({file:join(dir,'tasks.json'),execute:async()=> '基准测试占位结果'});
  const harness=new Harness({file:join(dir,'harness.json'),registry:toolRegistry(queue),fastAcknowledgements,timeoutMs:60000,model:args=>{calls++;return model(args);}});
  try{
   const run=harness.submit({sessionId:'benchmark',requestId:'1',message:'请创建一个后台文字任务：写一段100字的产品介绍，产品叫小艺任务中心，面向新同事。资料已齐全，不用追问。提交后简短告知即可。'});
   let result;
   do{await new Promise(r=>setTimeout(r,100));result=harness.get(run.id);}while(['queued','running'].includes(result.status));
   const record={mode:fastAcknowledgements?'optimized':'baseline',status:result.status,totalMs:Date.now()-start,modelCalls:calls,modelMs:result.events.filter(e=>e.type==='model_completed').map(e=>e.durationMs),firstTokenMs:result.events.filter(e=>e.type==='first_token').map(e=>e.durationMs),directAcknowledgement:result.events.some(e=>e.type==='direct_acknowledgement')};
   report.push(record);console.log(JSON.stringify(record));
  }finally{harness.close();queue.close();rmSync(dir,{recursive:true,force:true});}
 }
 writeFileSync('/Users/lillian.hu/Documents/ChatGPT/小艺任务管理中心/output/耗时对比.json',JSON.stringify({note:'真实模型，同一输入；任务执行器使用占位结果，测量创建任务确认链路。单次配对，不代表稳定平均值。',samples:report},null,2));
}finally{await connection.close();}
