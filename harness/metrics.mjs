const terminal = new Set(['completed','waiting_input','failed','cancelled']);
const elapsed = (start,end) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) ? Math.max(0,Date.parse(end)-Date.parse(start)) : null;
export function runLatency(run,now=new Date().toISOString()) {
 const events=run.events||[];
 const end=events.find(e=>terminal.has(e.type));
 const first=events.find(e=>e.type==='first_token');
 const sum=type=>{const values=events.filter(e=>e.type===type&&Number.isFinite(e.durationMs));return values.length?values.reduce((n,e)=>n+e.durationMs,0):null;};
 return {totalMs:elapsed(run.createdAt,end?.at||(terminal.has(run.status)?null:now)),firstTextMs:first?elapsed(run.createdAt,first.at):null,modelMs:sum('model_completed'),toolMs:sum('tool_result'),modelCalls:events.filter(e=>e.type==='model_started').length,toolCalls:events.filter(e=>e.type==='tool_started').length,running:!terminal.has(run.status)};
}
export function sessionLatency(runs) {
 const recent=runs.filter(r=>terminal.has(r.status)).slice(-20);
 const success=recent.filter(r=>['completed','waiting_input'].includes(r.status)).map(r=>runLatency(r));
 const average=key=>{const values=success.map(r=>r[key]).filter(Number.isFinite);return {ms:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};};
 return {sampleCount:success.length,excludedCount:recent.length-success.length,total:average('totalMs'),firstText:average('firstTextMs')};
}
