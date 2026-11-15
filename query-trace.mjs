const active=new Set(['queued','running']);
export function queryTrace(trigger,run,tasks=[],partial=''){
 const linked=tasks.filter(t=>(run?.events||[]).some(e=>e.type==='tool_result'&&['create_text_task','create_research_task','create_phone_task','control_task','ask_user'].includes(e.name)&&e.result?.task?.id===t.id));
 const stages=[];const visited=['input'];if(run)visited.push('router');if(linked.length)visited.push('task');
 let status,label;
 // Trigger 已被 Router 取走、但运行记录尚未落库时，路径已经到达 Router。
 // 这一小段状态不能只停留在“对话入口”，否则界面会漏掉关键高亮。
 if(!run&&trigger.status==='routing'){stages.push('input','router');status='running';label='Router 处理中';}
 else if(!run){stages.push('input');status=['failed','cancelled'].includes(trigger.status)?trigger.status:'queued';label=status==='cancelled'?'本轮已取消':status==='failed'?'入口失败':'等待 Router';}
 else if(active.has(run.status)){stages.push('router');status='running';label='Router 处理中';}
 else if(run.status==='waiting_input'){stages.push(linked.length?'task':'router');status='waiting_input';label=linked.length?'Task 等待补充':'等待你的补充';}
 else if(['failed','cancelled'].includes(run.status)){stages.push('router');status=run.status;label=run.status==='failed'?'Router 失败':'本轮已取消';}
 if(!stages.length&&linked.some(t=>t.status==='waiting_input')){stages.push('task');status='waiting_input';label='Task 等待补充';}
 const executing=linked.filter(t=>active.has(t.status));
 if(executing.length){stages.push('task');if(!status||status==='completed'){status='running';label='Task 执行中';}else label+=' · Task 执行中';}
 if(!stages.length&&linked.some(t=>['failed','cancelled','paused'].includes(t.status))){stages.push('task');status=linked.some(t=>t.status==='failed')?'failed':linked.some(t=>t.status==='paused')?'paused':'cancelled';label=status==='failed'?'Task 失败':status==='paused'?'Task 已暂停':'Task 已取消';}
 if(!stages.length){stages.push('return');status='completed';label=linked.length?'Task 已完成':'回复已返回';}
 if(run?.output||linked.some(t=>t.result))visited.push('return');
 return {id:trigger.id,runId:run?.id||null,sessionId:trigger.sessionId,input:trigger.message,createdAt:trigger.createdAt,status,label,stages:[...new Set(stages)],visited,reply:run?.output||partial||'',error:run?.error||trigger.error||null,tasks:linked.map(t=>({id:t.id,name:t.name,status:t.status,input:t.input,result:t.result,error:t.error,pendingQuestion:t.pendingQuestion}))};
}
