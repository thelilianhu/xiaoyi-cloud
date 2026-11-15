// Bind to a successful creation/update, never to intervening chat or status queries.
export function taskReferences(runs,triggers){
 const sources=new Map();
 for(const run of [...runs].sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''))){
  const trigger=triggers.find(t=>t.runId===run.id&&t.sessionId===run.sessionId);
  if(!trigger)continue;
  for(const e of run.events||[]){
   if(e.type!=='tool_result'||!e.result?.task?.id||e.result.error)continue;
   const start=(run.events||[]).find(s=>s.type==='tool_started'&&s.callId===e.callId&&s.name===e.name);
   const creation=['create_text_task','create_research_task','create_phone_task'].includes(e.name)||(e.name==='ask_user'&&start?.input?.input&&!start.input.taskId);
   const modification=e.name==='control_task'&&start?.input?.action==='update';
   if(creation||modification)sources.set(e.result.task.id,{queryId:trigger.id,text:trigger.message,kind:modification?'update':'original'});
  }
 }
 return sources;
}
