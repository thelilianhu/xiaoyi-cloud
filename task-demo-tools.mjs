// Local fixtures only: no network requests, files or external side effects.
export function demoToolContext(task, signal, report) {
 const fitness=/健身|训练|增肌|减脂/.test(task.input);
 const travel=/旅游|攻略|行程/.test(task.input);
 const category=fitness?'健身计划':travel?'旅行攻略':'文字创作';
 const invoke=(name,input,result)=>{
  signal.throwIfAborted();const start=Date.now();
  report({type:'tool_started',name,input,simulated:true});
  report({type:'tool_result',name,result:{simulated:true,...result},durationMs:Date.now()-start,simulated:true});
  return {tool:name,input,result:{simulated:true,...result}};
 };
 return [
  invoke('mock_template_lookup',{category,query:task.name||task.input.slice(0,80)},
   {source:'本地演示模板，不是实时查询',sections:fitness?['默认假设','训练安排','恢复与调整']:travel?['默认假设','按天行程','交通与预算提示']:['目标与假设','正文','总结'],note:'仅用于验证工具调用与返回流程，不代表用户真实资料或最新事实。'}),
  invoke('mock_requirement_check',{request:task.input},
   {requestReceived:true,externalActionsPerformed:false,checks:['保留明确要求','注明默认假设','不声称已联网或操作外部应用']})
 ];
}
