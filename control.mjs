import {resultSummary,completionReply} from './result-summary.mjs';
import {taskReferences} from './task-reference.mjs';
import {queryTrace} from './query-trace.mjs';
import {runLatency} from './harness/metrics.mjs';
const busy=new Set(['queued','running']);
export function controlSnapshot(harness,queue,sessionId,model,inbox) {
 const runs=Object.values(harness.store.data.runs).filter(r=>!sessionId||r.sessionId===sessionId);
 const tasks=queue.list(sessionId);
 const origins=new Map();
 for(const run of runs)for(const e of run.events){if(e.type==='tool_result'&&['create_text_task','create_research_task','create_phone_task','ask_user'].includes(e.name)&&e.result?.task?.id&&!origins.has(e.result.task.id))origins.set(e.result.task.id,run.id);}
 const decisions=runs.map(r=>{
  const tools=r.events.filter(e=>e.type==='tool_started').map(e=>e.name);
  const route=r.events.find(e=>e.type==='fast_route');
  const kind=(tools.includes('create_text_task')||tools.includes('create_phone_task')||tools.includes('create_research_task'))?'dispatch':tools.includes('control_task')?'control':tools.some(t=>['list_tasks','get_task'].includes(t))?'query':r.status==='waiting_input'?'clarify':route?'local':busy.has(r.status)?'routing':r.status==='failed'?'failed':'reply';
  return {id:r.id,sessionId:r.sessionId,input:r.input,status:r.status,output:r.output,error:r.error,createdAt:r.createdAt,kind,tools,steps:r.events.map(({type,at,step,name,durationMs})=>({type,at,step,name,durationMs})),latency:runLatency(r),taskIds:tasks.filter(t=>origins.get(t.id)===r.id).map(t=>t.id)};
 });
 const latestBySession=new Map(runs.map(r=>[r.sessionId,r]));
 const counts=Object.fromEntries(['queued','running','paused','succeeded','failed','cancelled','waiting_input'].map(s=>[s,tasks.filter(t=>t.status===s).length]));
 const totals=decisions.filter(r=>r.status==='completed'&&r.latency.totalMs!==null).map(r=>r.latency.totalMs);
 const triggers=inbox?.list(sessionId)||[];
 const references=taskReferences(runs,triggers);
 const alerts=[...tasks.filter(t=>t.status==='failed').map(t=>({kind:'task_failed',id:t.id})),...runs.filter(r=>busy.has(r.status)&&Date.now()-Date.parse(r.createdAt)>harness.timeoutMs).map(r=>({kind:'router_timeout',id:r.id}))];
 if(inbox?.closed)alerts.push({kind:'inbox_stopped'});
 const queries=triggers.map(t=>queryTrace(t,runs.find(r=>r.id===t.runId),tasks,harness.partials?.get(t.runId)||''));
 return {queries,triggers:triggers.reverse(),monitor:{mode:'rule-based',alerts},model,scope:sessionId||null,router:{active:runs.filter(r=>busy.has(r.status)).length,waiting:[...latestBySession.values()].filter(r=>r.status==='waiting_input').length,total:runs.length,averageMs:totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null},scheduler:{concurrency:queue.concurrency,occupied:queue.running.size,closed:queue.closed},counts,tasks:tasks.map(t=>({...t,resultSummary:resultSummary(t),completionReply:completionReply(t),source:references.get(t.id)||null,originRunId:origins.get(t.id)||null})).reverse(),decisions:decisions.reverse(),sessions:[...new Set([...runs.map(r=>r.sessionId),...tasks.map(t=>t.sessionId)])]};
}
