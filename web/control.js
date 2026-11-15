const $=id=>document.getElementById(id);
const labels={queued:'排队中',running:'执行中',paused:'已暂停',succeeded:'已交付',failed:'失败',cancelled:'已取消',completed:'已回复',waiting_input:'等待补充'};
const kinds={dispatch:'分发 Task',control:'调整 Task',query:'查询任务',clarify:'请求补充',local:'本地回复',routing:'路由中',failed:'路由失败',reply:'直接回复'};
const eventLabels={submission_check:'校验任务登记并重试',started:'Router 开始处理',model_started:'模型开始处理',first_token:'收到首字',model_completed:'模型返回',tool_started:'调用工具',tool_result:'工具返回',direct_acknowledgement:'任务即时确认',fast_route:'本地快速通道',completed:'回复完成',waiting_input:'等待补充',failed:'失败',cancelled:'已取消'};
// A personal setup fragment is consumed locally; it is never sent to the server.
const setupAccess=new URLSearchParams(location.hash.slice(1)).get('access');
if(setupAccess){
 history.replaceState(null,'',location.pathname+location.search);
 localStorage.setItem('xiaoyi-lab-access-token',setupAccess);
}
let token=localStorage.getItem('xiaoyi-lab-access-token')||'';
const sessionId='control-router';
$('scope').value='all';
$('command-scope').textContent='Enter 发送 · Shift + Enter 换行';
let voiceSession=null;
let sending=false,routerHighlightUntil=0,returnFlowUntil=0,snapshot=null,refreshing=false,signature='',retryRequest=null,detailSelection=null;
const seconds=ms=>Number.isFinite(ms)?(ms/1000).toFixed(2)+' 秒':'—';
const time=value=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;};
function linkedText(node,text){
 node.replaceChildren();const pattern=/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>）]+)/g;let end=0;
 for(const m of text.matchAll(pattern)){node.append(document.createTextNode(text.slice(end,m.index)));const a=el('a',m[1]||m[3]);a.href=m[2]||m[3];a.target='_blank';a.rel='noopener noreferrer';node.append(a);end=m.index+m[0].length;}node.append(document.createTextNode(text.slice(end)));
 return node;
}
function button(text,action,className){const b=el('button',text,className);b.type='button';b.onclick=action;return b;}
function badge(status){return el('span',labels[status]||status,'status '+status);}
function notice(text){$('notice').textContent=text;}
async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let d;try{d=await r.json();}catch{throw new Error('后台连接暂时中断，正在重连…');}if(!r.ok){const e=new Error(d.error||'请求失败');e.status=r.status;throw e;}return d;}
function setBusy(){ $('submit').disabled=false;$('input').disabled=false;}
function actions(task){return task.status==='queued'?[['pause','暂停'],['cancel','取消']]:task.status==='running'?[['cancel','取消']]:task.status==='waiting_input'?[['cancel','取消']]:task.status==='paused'?[['resume','继续'],['cancel','取消']]:task.status==='failed'?[['retry','重试']]:[];}
async function act(task,action,b){b.disabled=true;try{await api('/tasks/'+task.id+'/'+action,{version:task.version});notice('Task 操作已提交。');signature='';await refresh();}catch(e){notice(e.message);b.disabled=false;signature='';await refresh();}}
function renderTasks(){
 if(!snapshot)return;
 const q=$('search').value.trim().toLowerCase(),status=$('filter').value;
 const filtered=snapshot.tasks.filter(t=>(status==='all'||t.status===status)&&(!q||(t.name+' '+t.input+' '+t.id).toLowerCase().includes(q))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 $('task-table').replaceChildren(...filtered.map(t=>{
  const tr=el('tr'),title=el('td');title.append(button(t.name||t.input,()=>showTask(t.id),'task-title'),el('small','Task '+t.id.slice(0,8)+' · 尝试 '+t.attempts+' 次'));
  const state=el('td');state.append(badge(t.status));
  const origin=el('td');if(t.originRunId)origin.append(button('Router ↗',()=>showRun(t.originRunId)));else origin.textContent='直接提交';
  const date=el('td',time(t.createdAt));const ops=el('td');ops.append(button('详情',()=>showTask(t.id)));ops.append(button('修改',()=>editTask(t)));if(!['running','queued','waiting_input'].includes(t.status))ops.append(button('模拟工具重跑',()=>simulateTask(t)));
  for(const [action,label]of actions(t)){const b=button(label,()=>act(t,action,b));ops.append(b);}
  tr.append(title,state,origin,date,ops);return tr;
 }));$('task-empty').hidden=filtered.length>0;$('task-empty').textContent=snapshot.tasks.length?'没有匹配的 Task。':'当前范围暂无 Task。发送一个文字任务后，执行过程会出现在这里。';
}
function render(){
 $('inbox-count').textContent='待路由 '+snapshot.triggers.filter(t=>t.status==='queued').length+' 条 · 正在路由 '+snapshot.triggers.filter(t=>t.status==='routing').length+' 条';
 $('monitor-status').textContent=snapshot.monitor.alerts.length?'发现 '+snapshot.monitor.alerts.length+' 项异常，请查看任务与路由记录。':'当前未发现规则覆盖的异常';
 $('triggers').replaceChildren(...snapshot.triggers.slice(0,20).map(t=>{const row=el('article',null,'decision');row.append(el('span',t.status==='routing'?'路由中':labels[t.status]||t.status,'kind'),el('p',t.message),t.runId?button('追溯',()=>showRun(t.runId)):el('small',time(t.createdAt)));return row;}));
 if(!snapshot.triggers.length)$('triggers').append(el('p','暂无事件。从中控入口提交的需求会先记录在这里。','empty'));
 const s=snapshot;$('router-active').textContent=s.router.active;$('task-running').textContent=s.counts.running;$('task-queued').textContent=s.counts.queued;$('attention').textContent=s.counts.failed+s.router.waiting;$('task-done').textContent=s.counts.succeeded;
 $('capacity').textContent=`全局执行位 ${s.scheduler.occupied} / ${s.scheduler.concurrency}`;$('average').textContent='成功 Router 平均 '+seconds(s.router.averageMs);$('router-model').textContent=s.model||'模型未配置';$('load').textContent=s.scheduler.closed?'调度已停止':`${s.scheduler.occupied}/${s.scheduler.concurrency} 执行位`;
 renderConversation();renderFlow();renderTaskNodes();
 renderTasks();
 $('decisions').replaceChildren(...s.decisions.slice(0,30).map(r=>{const row=el('article',null,'decision');const body=el('div');body.append(el('p',r.input),el('small',`${time(r.createdAt)} · ${labels[r.status]} · ${seconds(r.latency.totalMs)} · 模型 ${r.latency.modelCalls} 次`));row.append(el('span',kinds[r.kind],'kind'),body,button('追溯 ↗',()=>showRun(r.id)));return row;}));
 if(!s.decisions.length)$('decisions').append(el('p','尚无路由记录。可以在上方提交一个需求。','empty'));
 if(detailSelection?.type==='task')renderTaskDetail(detailSelection.id);
}
const chatNodes=new Map();
let dispatchFlowUntil=0,inputFlowUntil=0,returnArrowUntil=0;
let selectedQuery=sessionStorage.getItem('xiaoyi-selected-query');
function flowSelection(next, previous, selected) {
 const queries=next.queries||[];
 const before=new Map((previous?.queries||[]).map(q=>[q.id,q]));
 const changed=queries.filter(q=>{
  const old=before.get(q.id);
  return !old||q.status!==old.status||q.reply!==old.reply||q.error!==old.error||JSON.stringify(q.tasks)!==JSON.stringify(old.tasks);
 });
 const newest=list=>[...list].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
 return newest(changed)?.id||queries.find(q=>q.id===selected)?.id||newest(queries)?.id||null;
}
function selectQuery(id){selectedQuery=id;sessionStorage.setItem('xiaoyi-selected-query',id);renderConversation();renderFlow();renderTaskNodes();}
function friendlyStep(e){
 const states={queued:'等待开始',running:'正在处理',paused:'已暂停',succeeded:'已完成',completed:'回复已准备好',waiting_input:'等待你补充信息',failed:'未能完成，请稍后重试',cancelled:'已停止'};
 const stages={started:'正在理解你的需求',model_started:'正在思考和整理内容',first_token:'正在生成回复',model_completed:'内容已生成',direct_acknowledgement:'已安排处理',fast_route:'正在回应你的消息',submission_check:'正在确认任务是否已创建'};
 if(e.type==='tool_started'||e.type==='tool_result'){
  const done=e.type==='tool_result';
  if(e.result?.error)return '这一步未能完成，请稍后重试';
  const actions={web_search:['正在搜索网页','已找到相关网页'],list_tasks:['正在查看已有任务','已查看已有任务'],get_task:['正在查看任务详情','已查看任务详情'],create_text_task:['正在创建任务','已创建任务'],create_research_task:['正在安排资料调研','已安排资料调研'],create_phone_task:['正在安排手机操作演示','已安排手机操作演示'],control_task:['正在更新任务','任务已更新'],ask_user:['正在确认需要补充的信息','等待你补充信息'],mock_template_lookup:['正在查找参考模板','已找到参考模板'],mock_requirement_check:['正在核对你的要求','已核对你的要求']};
  if(e.name?.startsWith('mock_phone.'))return (done?'已完成：':'正在进行：')+(e.label||'手机操作');
  return actions[e.name]?.[done?1:0]||(done?'这一步已完成':'正在处理这一步');
 }
 return stages[e.type]||states[e.type]||states[e.status]||'进度已更新';
}
function friendlyStepDetail(e){
 if(e.result?.error)return '本次操作未成功，可稍后重试。';
 if(e.name==='web_search')return e.result?.results?'找到 '+e.result.results.length+' 条相关网页，可在回复中查看来源。':e.input?.query?'搜索内容：'+e.input.query:'';
 if(e.name?.startsWith('mock_phone.'))return e.result?'当前页面：'+(e.result.screen||'演示页面')+'。仅为模拟，没有真实下单或付款。':e.input?.target?'操作位置：'+e.input.target:'';
 if(e.result?.task)return '任务：'+(e.result.task.name||'当前任务')+' · '+(labels[e.result.task.status]||'已更新');
 if(e.result?.tasks)return '找到 '+e.result.tasks.length+' 个任务。';
 return '';
}
function stepInfo(events, status){
 const box=el('div',null,'step-info');box.append(el('strong','Step info'));
 const list=el('ol');list.className='step-list';
 for(const e of events.slice(-3)){const text=friendlyStep(e);const row=el('li');const line=el('div',null,'step-line');line.append(el('time',e.at?new Date(e.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'—','step-time'),el('span',(e.simulated?'[模拟] ':'')+text));row.append(line);if(e.durationMs!=null)row.append(el('small','耗时 '+seconds(e.durationMs)));const detail=friendlyStepDetail(e);if(detail){const d=el('details');d.onclick=event=>event.stopPropagation();d.append(el('summary','查看说明'),el('div',detail,'step-data'));row.append(d);}list.append(row);}
 if(!events.length)list.append(el('li','等待执行记录'));
 if(['running','queued'].includes(status))box.classList.add('steps-live');
 box.append(list);return box;
}
function taskSteps(t){return [...(t.events||[]).filter((e,i,a)=>i===0||a[i-1].status!==e.status),...(t.steps||[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
let newestTaskId=null;let visibleRunningTaskId=null;
function renderTaskNodes(){
 const selected=snapshot.queries?.find(q=>q.id===selectedQuery);const ids=new Set(selected?.tasks.map(t=>t.id)||[]);
 const nodes=[...snapshot.tasks].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
 $('load').textContent=nodes.length+' 个 Task · '+(snapshot.scheduler.closed?'调度已停止':`并行 ${snapshot.scheduler.occupied}/${snapshot.scheduler.concurrency} · 排队 ${snapshot.counts.queued}`);
 $('task-nodes').replaceChildren(...nodes.map(t=>{const b=el('article',null,'task-node'+(t.status==='running'?' task-running is-flowing':t.status==='waiting_input'?' task-waiting':t.status==='cancelled'?' task-cancelled':''));b.dataset.taskId=t.id;b.append(button(t.name||t.input,()=>showTask(t.id),'task-card-title'),badge(t.status));if(t.kind==='phone_simulation'){const latest=(t.steps||[]).at(-1);b.append(el('div','📱 模拟手机 · '+(latest?.step?'第 '+latest.step+'/'+latest.total+' 步 · ':'')+(latest?.label||'等待打开应用')+' · '+(t.status!=='running'?(labels[t.status]||t.status):latest?.type==='tool_started'?'执行中':latest?.screen||'每步约 3 秒'),'phone-preview'));}b.append(stepInfo(taskSteps(t),t.status));return b;}));
 if(nodes[0]?.id!==newestTaskId){newestTaskId=nodes[0]?.id||null;$('task-nodes').scrollLeft=0;}
 const runningId=nodes.find(t=>t.status==='running')?.id||nodes.find(t=>t.status==='waiting_input')?.id||null;if(runningId!==visibleRunningTaskId){visibleRunningTaskId=runningId;if(runningId){const card=[...$('task-nodes').children].find(n=>n.dataset.taskId===runningId);if(card)$('task-nodes').scrollLeft=card.offsetLeft-$('task-nodes').offsetLeft;}}
 if(!nodes.length)$('task-nodes').append(el('div','暂无 Task，等待 Router 分发。','empty'));
}
function renderFlow(){
 const q=snapshot?.queries?.find(q=>q.id===selectedQuery);
 const replyText=q?.tasks?.find(t=>t.result)?.result||q?.reply||q?.error||q?.tasks?.find(t=>t.pendingQuestion)?.pendingQuestion||'';
 const replyRun=snapshot.decisions.find(r=>r.id===q?.runId);
 const streaming=Boolean(q?.reply&&['queued','running'].includes(replyRun?.status));
 const returning=streaming||Date.now()<returnFlowUntil;
 // Router 是全局单例：即使当前没有选中刚提交的那条对话，也必须反映真实的处理中状态。
 const routerBusy=sending||Date.now()<routerHighlightUntil||Boolean(snapshot?.router?.active)||snapshot?.triggers?.some(t=>t.status==='routing')||snapshot?.decisions?.some(r=>['queued','running'].includes(r.status));
 for(const stage of ['input','router','task','return']){
  const node=$('flow-'+stage);
  const selectedActive=Boolean(q?.stages.includes(stage));
  node.classList.toggle('flow-active',stage==='router'?routerBusy||selectedActive:stage==='return'?returning:selectedActive);
  node.classList.toggle('flow-visited',Boolean(q?.visited.includes(stage)));
  node.classList.toggle('flow-error',Boolean(q?.stages.includes(stage)&&['failed','cancelled'].includes(q.status)));
 }
 const run=snapshot.decisions.find(r=>r.id===q?.runId);$('router-steps').replaceChildren(stepInfo(run?.steps||[],run?.status));
 const thinking=routerBusy||Boolean(run&&['queued','running'].includes(run.status));$('router-state').textContent=thinking?'思考中…':run?.status==='waiting_input'?'等待你的补充':run?.status==='failed'?'处理失败':run?.status==='cancelled'?'已停止':run?'处理完成':'等待消息';$('router-state').classList.toggle('thinking-indicator',thinking);
 const moving=Boolean(q&&['queued','running'].includes(q.status));
 for(const stage of ['input','router','task','return'])$('flow-'+stage).classList.toggle('is-flowing',stage==='router'?routerBusy||moving&&q?.stages.includes(stage):moving&&q.stages.includes(stage));
 const taskLink=$('link-router-task');
 const tasksExecuting=snapshot.tasks.some(t=>['queued','running'].includes(t.status));
 const arrowReturning=returning&&Date.now()<returnArrowUntil;
 const taskReturning=arrowReturning&&Boolean(q?.tasks?.some(t=>t.result||t.error));
 const dispatching=tasksExecuting&&Date.now()<dispatchFlowUntil;
 taskLink.classList.toggle('link-active',dispatching&&!taskReturning);
 taskLink.classList.toggle('link-idle',!dispatching&&!taskReturning);
 taskLink.classList.toggle('link-visited',Boolean(q?.visited.some(stage=>stage==='router'||stage==='task')));
 // 回传箭头只在真实状态刚刚完成切换的短暂窗口内移动；历史记录只保留静态路径。
 taskLink.classList.toggle('link-returning',taskReturning);
 $('link-input-router').classList.toggle('link-returning',arrowReturning);
 $('link-input-router').classList.toggle('link-idle',!arrowReturning&&Date.now()>=inputFlowUntil);
 const activeTasks=snapshot.tasks.filter(t=>t.status==='running');const waitingTasks=snapshot.tasks.filter(t=>t.status==='waiting_input');
 $('flow-task').classList.remove('flow-active');
 $('flow-task').classList.remove('is-flowing');
 
 const stateHasReply=returning&&Boolean(replyText);
 $('flow-state').classList.toggle('state-live',stateHasReply);
 $('flow-state').classList.remove('flow-active');
 $('state-summary').textContent=stateHasReply?'本轮结果已归档，可随时继续修改':'任务、步骤与结果自动保存';
 $('reply-preview').textContent=replyText?replyText.replace(/\s+/g,' ').slice(0,96)+(replyText.length>96?'…':''):'等待 Router 回复';
 $('flow-services').hidden=!returning;
 $('router-steps').hidden=returning;
 $('flow-reply').classList.toggle('flow-active',returning&&Boolean(replyText));
 $('flow-reply').classList.remove('flow-visited');
 $('flow-reply').classList.toggle('is-flowing',returning&&Boolean(replyText));
 const currentStep=returning&&q?`当前步骤 · ${q.label}：Router 已读取记录并已回复对话`:'等待新的状态流转';
 $('query-focus').textContent=activeTasks.length?'后台正在执行 '+activeTasks.length+' 个任务 · '+activeTasks.map(t=>t.name||'任务').join('、')+(waitingTasks.length?' · '+waitingTasks.length+' 个等待补充':''):waitingTasks.length?waitingTasks.length+' 个任务等待你补充信息':currentStep;
}
function renderConversation(){
 const queries=(snapshot?.queries||[]).filter(q=>q.sessionId===sessionId);
 if(!selectedQuery||!snapshot.queries.some(q=>q.id===selectedQuery))selectedQuery=flowSelection(snapshot,null,null);
 const container=$('conversation'),atBottom=container.scrollHeight-container.clientHeight-container.scrollTop<60;
 const ids=new Set(queries.map(q=>q.id));for(const [id,n]of chatNodes)if(!ids.has(id)){n.root.remove();chatNodes.delete(id);}
 container.querySelector('.chat-empty')?.remove();
 for(const q of queries){
  let n=chatNodes.get(q.id);
  if(!n){const root=el('article',null,'chat-turn');const user=el('div',q.input,'chat-bubble chat-user');user.tabIndex=0;user.setAttribute('role','button');user.setAttribute('aria-label','查看这条消息的处理流程');user.onclick=()=>selectQuery(q.id);user.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectQuery(q.id);}};const assistant=el('div',null,'chat-bubble chat-assistant');const results=el('div',null,'chat-results');const thinking=el('div','思考中…','thinking-indicator');thinking.setAttribute('role','status');thinking.hidden=true;root.append(user,thinking,assistant,results);container.append(root);n={root,thinking,assistant,results,resultSignature:''};chatNodes.set(q.id,n);}
  const thinking=q.status==='running'&&q.stages.includes('router');n.thinking.hidden=!thinking;
  const delivered=q.tasks.some(t=>t.result||t.pendingQuestion||t.error);
  const text=q.error||(q.tasks.length?'已收到，我来处理。':q.reply)||(q.status==='queued'?'已收到，稍等一下…':'正在回复…');
  n.assistant.hidden=delivered||(thinking&&!q.reply&&!q.error); if(n.assistant.dataset.content!==text){n.assistant.dataset.content=text;linkedText(n.assistant,text);}
  const resultSignature=JSON.stringify(q.tasks);if(n.resultSignature!==resultSignature){n.resultSignature=resultSignature;n.results.replaceChildren(...q.tasks.filter(t=>t.result||t.pendingQuestion||t.error).map(t=>{const card=el('section',null,'chat-task-result');if(q.tasks.length>1)card.append(el('strong',t.name||'回复'));card.append(linkedText(el('div',null,'chat-result-text'),t.pendingQuestion||t.result||t.error));return card;}));}

 }
 if(!queries.length)container.append(el('p','你好，有什么可以帮你？','chat-empty'));
 if(atBottom)container.scrollTop=container.scrollHeight;
}

function openDetail(type,id,title){detailSelection={type,id};$('detail-title').textContent=title;if(!$('detail').open)$('detail').showModal();}
async function simulateTask(t){try{const updated=await api('/tasks/'+t.id+'/update',{input:t.input,version:t.version});if(updated.status==='paused')await api('/tasks/'+t.id+'/resume',{version:updated.version});notice('已提交模拟工具执行。');signature='';await refresh();}catch(e){notice(e.message);}}
function editTask(t){
 openDetail('edit',t.id,'修改 · '+(t.name||'Task'));
 const input=el('textarea');input.value=t.input;input.rows=8;input.style.width='100%';input.setAttribute('aria-label','修改后的任务要求');
 const error=el('p');const save=button(['queued','paused'].includes(t.status)?'保存修改':'保存并重新执行',async()=>{
  if(!input.value.trim()){error.textContent='请填写任务要求。';return;}
  save.disabled=true;try{await api('/tasks/'+t.id+'/update',{input:input.value.trim(),version:t.version});$('detail').close();detailSelection=null;signature='';await refresh();notice('任务已更新。');}catch(e){error.textContent=e.message;save.disabled=false;}
 });
 $('detail-body').replaceChildren(el('p','填写完整的新要求。执行中任务会停止旧执行并重跑；已结束任务重新执行，旧结果保留。暂停中的任务保存后仍保持暂停。'),input,error,save);
}
function showTask(id){openDetail('task',id,'Task 详情');renderTaskDetail(id);}
function renderTaskDetail(id){const t=snapshot?.tasks.find(t=>t.id===id);if(!t){$('detail-body').replaceChildren(el('p','此 Task 不在当前观察范围。'));return;}
 $('detail-title').textContent=t.name||'Task 详情';
 const body=$('detail-body');body.replaceChildren(badge(t.status),el('p',t.id+' · 会话 '+t.sessionId,'detail-meta'),el('h3','任务需求'),el('div',t.input,'detail-text'));
 body.append(button('修改任务',()=>editTask(t)));
 for(const q of t.questions||[]){body.append(el('h3','任务追问'),el('div',q.question,'detail-text'));if(q.answer)body.append(el('div','补充后的要求：'+q.answer,'detail-text'));}
 for(const r of [...(t.revisions||[])].reverse()){const d=el('details');d.append(el('summary','修改前记录 · '+time(r.completedAt)),el('div',r.result||r.input,'detail-text'));body.append(d);}
 if(t.originRunId)body.append(button('查看 Router 来源 ↗',()=>showRun(t.originRunId)));
 if(t.result||t.error)body.append(el('h3',t.result?'交付结果':'失败原因'),linkedText(el('div',null,'detail-text'),t.result||t.error));
 body.append(stepInfo(taskSteps(t),t.status));
 const list=el('ol',null,'timeline');for(const e of t.events)list.append(el('li',time(e.at)+' · '+(labels[e.status]||e.status)));body.append(el('h3','执行时间线'),list);
}
async function showRun(id){openDetail('run',id,'Router 路由详情');$('detail-body').replaceChildren(el('p','读取执行记录…'));
 try{const r=await api('/agent/runs/'+id);if(detailSelection?.id!==id||detailSelection?.type!=='run')return;
 const body=$('detail-body');body.replaceChildren(badge(r.status),el('p',r.id,'detail-meta'),el('h3','输入'),el('div',r.input,'detail-text'));
 body.append(el('p',`总耗时 ${seconds(r.latency?.totalMs)} · 首字 ${seconds(r.latency?.firstTextMs)} · 模型 ${seconds(r.latency?.modelMs)} · 工具 ${seconds(r.latency?.toolMs)}`,'detail-meta'));
 if(r.output||r.error||r.partial)body.append(el('h3','回复 / 当前输出'),el('div',r.output||r.error||r.partial,'detail-text'));
 const list=el('ol',null,'timeline');for(const e of r.events){const item=el('li',`${time(e.at)} · ${eventLabels[e.type]||e.type}${e.name?' · '+e.name:''}${e.durationMs!=null?' · '+seconds(e.durationMs):''}`);if(e.input||e.result){const d=el('details');d.append(el('summary','输入与返回'),el('pre',JSON.stringify({input:e.input,result:e.result},null,2),'detail-text'));item.append(d);}list.append(item);}body.append(el('h3','Step info'),list);
 }catch(e){$('detail-body').replaceChildren(el('p',e.message));}}
async function refresh(){
 if(refreshing)return;refreshing=true;const scope=$('scope').value;
 try{
 const s=await api('/control/state'+(scope==='current'?'?sessionId='+encodeURIComponent(sessionId):''));if(scope!==$('scope').value)return;
 if(snapshot){
  const knownQueries=new Set((snapshot.queries||[]).map(q=>q.id));
  const knownTasks=new Set(snapshot.tasks.map(t=>t.id));
  if(s.queries?.some(q=>!knownQueries.has(q.id)))inputFlowUntil=Date.now()+5000;
  if(s.tasks.some(t=>!knownTasks.has(t.id)))dispatchFlowUntil=Date.now()+5000;
 }
 selectedQuery=flowSelection(s,snapshot,selectedQuery);
 const previous=snapshot?.queries?.find(q=>q.id===selectedQuery);
 const nextQuery=s.queries?.find(q=>q.id===selectedQuery);
 const previousTaskStates=new Map((previous?.tasks||[]).map(t=>[t.id,t.status]));
 const runReturned=Boolean(snapshot&&nextQuery&&nextQuery.status==='completed'&&(!previous||['queued','running'].includes(previous.status)));
 const taskReturned=Boolean(nextQuery?.tasks?.some(t=>previousTaskStates.get(t.id)==='running'&&['succeeded','failed','cancelled'].includes(t.status)));
 const replyChanged=Boolean(snapshot&&nextQuery&&((nextQuery.reply&&nextQuery.reply!==previous?.reply)||(nextQuery.error&&nextQuery.error!==previous?.error)||nextQuery.tasks?.some(t=>(t.result&&t.result!==previous?.tasks?.find(old=>old.id===t.id)?.result)||(t.pendingQuestion&&t.pendingQuestion!==previous?.tasks?.find(old=>old.id===t.id)?.pendingQuestion))));
 if(runReturned||taskReturned||(replyChanged&&!previous?.reply))returnArrowUntil=Date.now()+5000;
 if(runReturned||taskReturned||replyChanged){returnFlowUntil=Date.now()+3500;setTimeout(()=>{if(snapshot)renderFlow();},3550);}
 snapshot=s;
 if(/访问口令|连接暂时中断|连接不上|Unexpected token|not valid JSON/.test($('notice').textContent))notice('');
 $('connection').textContent='● 已连接 · '+(s.model||'模型未配置');$('scope-note').textContent=scope==='current'?'只看本页对话创建的任务':'查看全部会话的任务';$('updated').textContent='更新于 '+new Date().toLocaleTimeString();
 const next=JSON.stringify(s);if(next!==signature){signature=next;render();}else{renderFlow();}
 if(!presenceConnected)$('flow-input').classList.toggle('voice-active',Boolean(voiceSession||s.inputActive));
 $('link-input-router').classList.toggle('link-active',Date.now()<inputFlowUntil);

 }catch(e){notice(e.status?e.message:'后台暂时连接不上，正在重试…');$('connection').textContent='○ 连接异常';if(e.status===401){$('connection').textContent='○ 请在设置中更新访问口令';}}finally{refreshing=false;}
}
let composing=false;
$('input').addEventListener('compositionstart',()=>{composing=true;});
$('input').addEventListener('compositionend',()=>{composing=false;});
$('input').addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.shiftKey||e.isComposing||composing||e.keyCode===229)return;
 e.preventDefault();
 if(!e.repeat&&!sending)$('command').requestSubmit();
});
$('command').onsubmit=async e=>{e.preventDefault();if(sending||voiceSession)return;const message=$('input').value.trim();if(!message)return;
 const request=retryRequest?.message===message?retryRequest:{sessionId,requestId:crypto.randomUUID(),message};retryRequest=request;sending=true;routerHighlightUntil=Date.now()+1200;$('submit').disabled=true;$('input').disabled=true;if(snapshot)renderFlow();setTimeout(()=>{if(snapshot)renderFlow();},1250);
 try{const run=await api('/control/triggers',request);selectedQuery=run.id;sessionStorage.setItem('xiaoyi-selected-query',run.id);retryRequest=null;sending=false;$('input').value='';if(snapshot){snapshot.queries=snapshot.queries||[];if(!snapshot.queries.some(q=>q.id===run.id))snapshot.queries.push({id:run.id,sessionId,input:message,createdAt:run.createdAt,status:'queued',label:'等待 Router',stages:['input'],visited:['input'],tasks:[],reply:''});renderConversation();renderFlow();} notice('');setBusy();await refresh();}catch(error){sending=false;notice(error.message+' 可重试发送，相同内容不会重复创建。');setBusy();}};
$('settings').onclick=()=>{$('token').value=token;$('config').showModal();};$('close-config').onclick=()=>$('config').close();$('connect').onsubmit=e=>{e.preventDefault();token=$('token').value.trim();if(token)localStorage.setItem('xiaoyi-lab-access-token',token);else localStorage.removeItem('xiaoyi-lab-access-token');$('token').value='';$('config').close();notice('');refresh();};
$('close-detail').onclick=()=>{$('detail').close();detailSelection=null;};$('detail').onclose=()=>{detailSelection=null;};
$('search').oninput=renderTasks;$('filter').onchange=renderTasks;$('scope').onchange=()=>{signature='';refresh();};
$('clear-tasks').onclick=async()=>{
 if(!snapshot?.tasks.length){notice('当前没有可清空的任务。');return;}
 if(!window.confirm('确定清空全部任务吗？运行中的任务会停止，任务数据会自动备份。'))return;
 $('clear-tasks').disabled=true;
 try{const result=await api('/tasks/clear',{});signature='';await refresh();notice('已清空 '+result.cleared+' 个任务，已自动备份。');}
 catch(error){notice(error.message);}
 finally{$('clear-tasks').disabled=false;}
};
async function loadDefaultAccess(){if(token){refresh();return;}try{const r=await fetch('/control/local-access',{cache:'no-store'});if(r.ok){const d=await r.json();if(d.accessToken){token=d.accessToken;localStorage.setItem('xiaoyi-lab-access-token',token);$('token').value=token;}}}catch{}finally{refresh();}}
setBusy();loadDefaultAccess();setInterval(()=>{if(!document.hidden&&!$('config').open)refresh();},500);

function setChatVisible(visible){
 $('chat-panel').hidden=!visible;
 document.querySelector('.control-workspace').classList.toggle('chat-collapsed',!visible);
 $('toggle-chat').textContent=visible?'隐藏对话':'显示对话';
 $('toggle-chat').setAttribute('aria-expanded',String(visible));
 localStorage.setItem('celia-chat-visible',String(visible));
}
$('toggle-chat').onclick=()=>setChatVisible($('chat-panel').hidden);
setChatVisible(false);

const SpeechRecognitionAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
const voiceButton=$('hold-to-talk');
function voiceHint(text){$('voice-status').textContent=text;}
function finishVoice(session,send){
 if(voiceSession!==session)return;
 clearTimeout(session.timer);voiceSession=null;
 $('flow-input').classList.remove('voice-active');voiceButton.classList.remove('recording');voiceButton.textContent='按住说话';voiceButton.setAttribute('aria-pressed','false');
 $('input').disabled=false;$('submit').disabled=false;
 if(send&&session.finalText.trim()){
  $('input').value=[session.draft,session.finalText.trim()].filter(Boolean).join(' ');
  voiceHint('识别完成，正在发送…');$('command').requestSubmit();
 }else{ $('input').value=session.draft;voiceHint(session.error||'没有识别到完整语音，请重新按住说话。'); }
}
function cancelVoice(reason){const s=voiceSession;if(!s)return;s.error=reason;finishVoice(s,false);try{s.recognition.abort();}catch{}}
function beginVoice(){
 if(sending||voiceSession)return;
 if(!SpeechRecognitionAPI||!window.isSecureContext){voiceHint('当前浏览器无法使用网页语音，请使用支持语音的浏览器及 HTTPS 地址，或键盘输入。');return;}
 const recognition=new SpeechRecognitionAPI();const s={recognition,draft:$('input').value,finalText:'',held:true,started:false,ended:false,error:''};voiceSession=s;
 recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
 $('flow-input').classList.add('voice-active');voiceButton.classList.add('recording');voiceButton.textContent='松开发送';voiceButton.setAttribute('aria-pressed','true');$('input').disabled=true;$('submit').disabled=true;voiceHint('正在开启麦克风…');
 s.timer=setTimeout(()=>cancelVoice('录音已结束，请重新按住说话。'),60000);
 recognition.onstart=()=>{if(voiceSession!==s)return;s.started=true;voiceHint(s.held?'正在听，松开发送…':'正在识别…');if(!s.held)recognition.stop();};
 recognition.onresult=e=>{if(voiceSession!==s)return;let finalText='',interim='';for(const r of Array.from(e.results)){if(r.isFinal)finalText+=r[0].transcript;else interim+=r[0].transcript;}s.finalText=finalText;$('input').value=[s.draft,finalText+interim].filter(Boolean).join(' ');};
 recognition.onerror=e=>{if(voiceSession!==s)return;s.error=({'not-allowed':'麦克风权限未开启，请允许后重试。','audio-capture':'无法使用麦克风，请检查设备。','network':'语音识别连接失败，请稍后重试。','no-speech':'没有听清，请重新按住说话。'})[e.error]||'语音识别失败，请重试。';finishVoice(s,false);try{recognition.abort();}catch{}};
 recognition.onend=()=>{if(voiceSession!==s)return;s.ended=true;if(!s.held)finishVoice(s,true);else voiceHint('录音已结束，松手发送已识别的内容。');};
 try{recognition.start();}catch{cancelVoice('无法启动语音识别，请使用键盘输入或更换浏览器。');}
}
function releaseVoice(){const s=voiceSession;if(!s||!s.held)return;s.held=false;voiceButton.textContent='识别中…';voiceHint('正在识别，完成后发送…');clearTimeout(s.timer);s.timer=setTimeout(()=>cancelVoice('识别超时，请重试。'),12000);if(s.ended)finishVoice(s,true);else if(s.started){try{s.recognition.stop();}catch{cancelVoice('语音识别未完成，请重试。');}}}
voiceButton.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();voiceButton.setPointerCapture(e.pointerId);beginVoice();});
voiceButton.addEventListener('pointerup',e=>{e.preventDefault();releaseVoice();});
voiceButton.addEventListener('pointercancel',()=>cancelVoice('已取消录音，没有发送。'));
voiceButton.addEventListener('lostpointercapture',()=>{if(voiceSession?.held)cancelVoice('已取消录音，没有发送。');});
voiceButton.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)beginVoice();}if(e.key==='Escape')cancelVoice('已取消录音，没有发送。');});
voiceButton.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();releaseVoice();}});
voiceButton.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{if(voiceSession?.held)cancelVoice('已取消录音，没有发送。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&voiceSession)cancelVoice('已取消录音，没有发送。');});
if(!SpeechRecognitionAPI||!window.isSecureContext)voiceHint('此环境暂不支持网页语音，可用手机键盘语音转文字后点击发送。');

// Input presence is pushed separately from the heavier task snapshot.
let presenceConnected=false,presenceController=null,presenceKey='',presenceRetryAt=0;
async function ensurePresence(){
 const scope=$('scope').value==='current'?sessionId:'';
 const key=token+'|'+scope;
 if(presenceController&&presenceKey===key)return;
 if(Date.now()<presenceRetryAt)return;
 presenceController?.abort();
 const controller=new AbortController();presenceController=controller;presenceKey=key;
 try{
  const r=await fetch('/control/presence-stream'+(scope?'?sessionId='+encodeURIComponent(scope):''),{headers:{Authorization:'Bearer '+token},signal:controller.signal,cache:'no-store'});
  if(!r.ok||!r.headers.get('content-type')?.includes('application/x-ndjson'))throw Error('offline');
  presenceConnected=true;
  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(!controller.signal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.trim()){const event=JSON.parse(line);$('flow-input').classList.toggle('voice-active',Boolean(voiceSession||event.active));}}}
 }catch{}finally{if(presenceController===controller){presenceConnected=false;presenceController=null;presenceRetryAt=Date.now()+1500;}}
}
setInterval(()=>{if(!document.hidden)ensurePresence();},500);
ensurePresence();
