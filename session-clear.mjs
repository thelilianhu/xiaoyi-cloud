export async function clearSession(sessionId,{inbox,harness,tasks}) {
 if(typeof sessionId!=='string'||!sessionId.trim()||sessionId.length>128||['__proto__','constructor','prototype'].includes(sessionId))throw Error('无效会话标识');
 if(inbox.clearingSessions.has(sessionId))throw Error('会话正在清空');
 inbox.clearingSessions.add(sessionId);
 try {
  inbox.items=inbox.items.filter(i=>i.sessionId!==sessionId);inbox.persist();
  const runs=Object.values(harness.store.data.runs).filter(r=>r.sessionId===sessionId);
  for(const run of runs)if(['queued','running'].includes(run.status))harness.cancel(run.id);
  for(const t of tasks.tasks.filter(t=>t.sessionId===sessionId)){
   tasks.running.get(t.id)?.abort();
   if(['queued','running','paused','waiting_input'].includes(t.status))tasks.change(t,'cancelled');
  }
  await new Promise(r=>setTimeout(r,0)); // Let already queued router callbacks observe cancellation before deleting runs.
  const deadline=Date.now()+10000;
  while(runs.some(r=>harness.controllers.has(r.id))){if(Date.now()>deadline)throw Error('任务仍在停止，请稍后重试清空');await new Promise(r=>setTimeout(r,25));}
  // Re-scan after the router has stopped, including tasks created during cancellation.
  for(const t of tasks.tasks.filter(t=>t.sessionId===sessionId)){tasks.running.get(t.id)?.abort();t.status='cancelled';}
  tasks.tasks=tasks.tasks.filter(t=>t.sessionId!==sessionId);tasks.persist();
  harness.store.commit(data=>{for(const [id,run] of Object.entries(data.runs))if(run.sessionId===sessionId)delete data.runs[id];delete data.sessions[sessionId];});
  return {ok:true,sessionId};
 } finally {inbox.clearingSessions.delete(sessionId);}
}
