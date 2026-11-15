import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {TaskError} from './tasks.mjs';
// Durable intake. Each session routes one event at a time; Task execution is independent.
export class TriggerInbox {
 constructor({file,harness}){this.file=file;this.harness=harness;this.clearingSessions=new Set();this.closed=false;try{this.items=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.items=[];}this.timer=setInterval(()=>this.pump(),250);this.timer.unref();queueMicrotask(()=>this.pump());}
 persist(){mkdirSync(dirname(this.file),{recursive:true,mode:0o700});writeFileSync(this.file+'.tmp',JSON.stringify(this.items),{mode:0o600});renameSync(this.file+'.tmp',this.file);}
 accept({sessionId,requestId,message}){
  for(const [value,max] of [[sessionId,128],[requestId,128],[message,12000]])if(typeof value!=='string'||!value.trim()||value.length>max||['__proto__','constructor','prototype'].includes(value))throw new TaskError(400,'事件参数无效。');
  if(this.clearingSessions.has(sessionId))throw new TaskError(409,"会话正在清空，请稍后重试。");
  const old=this.items.find(i=>i.sessionId===sessionId&&i.requestId===requestId);if(old){if(old.message!==message)throw new TaskError(409,'请求标识已用于其他内容。');return structuredClone(old);}
  if(this.closed)throw new TaskError(503,'事件入口已停止。');
  if(this.items.filter(i=>['queued','routing'].includes(i.status)).length>=100)throw new TaskError(429,'事件队列已满，请稍后重试。');
  const item={id:randomUUID(),sessionId,requestId,message,source:'web',status:'queued',createdAt:new Date().toISOString(),runId:null,error:null};this.items.push(item);
  try{this.persist();}catch(e){this.items.pop();throw e;}queueMicrotask(()=>this.pump());return structuredClone(item);
 }
 cancel(id,sessionId){
  const item=this.items.find(i=>i.id===id&&i.sessionId===sessionId);
  if(!item)throw new TaskError(404,"输入不存在。");
  if(item.runId){const run=this.harness.get(item.runId);if(["queued","running"].includes(run.status))this.harness.cancel(run.id);else return structuredClone(item);}
  item.status="cancelled";item.finishedAt=new Date().toISOString();this.persist();return structuredClone(item);
 }
 list(sessionId){return structuredClone(this.items.filter(i=>!sessionId||i.sessionId===sessionId));}
 pump(){if(this.closed)return;let changed=false;
 try{
 for(const item of this.items){
  if(item.status==='routing'){
   const run=this.harness.get(item.runId);if(!['queued','running'].includes(run.status)){item.status=run.status;item.finishedAt=new Date().toISOString();item.error=run.error;changed=true;}
  }
  if(item.status!=='queued')continue;
  try{const run=this.harness.submit({sessionId:item.sessionId,requestId:'trigger-'+item.id,message:item.message});item.runId=run.id;item.status='routing';changed=true;}
  catch(e){if([409,429,503].includes(e.status))continue;item.status='failed';item.error='事件路由失败，请检查 Router 状态。';changed=true;}
 }
 if(changed)this.persist();
 }catch{this.closed=true;clearInterval(this.timer);}
 }
 close(){this.closed=true;clearInterval(this.timer);}
}
export async function inboxRoutes(req,res,inbox){
 const cancelMatch=req.url.match(/^\/control\/triggers\/([^/]+)\/cancel$/);
 if(req.method!=='POST'||(req.url!=='/control/triggers'&&!cancelMatch))return false;
 const send=(status,data)=>res.writeHead(status).end(JSON.stringify(data));
 try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw new TaskError(413,'事件内容过长。');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new TaskError(400,'事件格式无效。');}if(!body||typeof body!=='object'||Array.isArray(body))throw new TaskError(400,'事件格式无效。');send(cancelMatch?200:202,cancelMatch?inbox.cancel(cancelMatch[1],body.sessionId):inbox.accept(body));}catch(e){send(e.status||500,{error:e.status?e.message:'事件保存失败，请稍后重试。'});}return true;
}
