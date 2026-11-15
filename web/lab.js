const $ = id => document.getElementById(id);
let token = localStorage.getItem('xiaoyi-lab-access-token') || '', sessionId = localStorage.getItem('xiaoyi-lab-session') || crypto.randomUUID();
let activeRun = null, busy = false, polling = false, retryRequest = null, currentMessage = null, epoch = 0;
const statuses = {queued:'排队中',running:'执行中',paused:'已暂停',succeeded:'已完成',failed:'失败',cancelled:'已取消',completed:'已回复',waiting_input:'等待补充'};
const toolNames = {list_tasks:'查看任务',get_task:'读取任务结果',create_text_task:'创建文字任务',control_task:'调整任务',ask_user:'确认必要信息'};
function saveSession(){localStorage.setItem('xiaoyi-lab-session',sessionId);$('session').textContent=sessionId;}
saveSession();
$('token').value=token;
async function api(path,body){
 const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok){const error=new Error(data.error || '连接失败');error.status=response.status;throw error;}return data;
}
function notice(message){$('notice').textContent=message;}
function message(role,text){
 $('messages').querySelector('.welcome')?.remove();
 const wrap=document.createElement('div');wrap.className='message '+role;
 const label=document.createElement('div');label.className='speaker';label.textContent=role==='user'?'你':'小艺';
 const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;
 wrap.append(label,bubble);$('messages').append(wrap);$('messages').scrollTop=$('messages').scrollHeight;return bubble;
}
function lock(value){busy=value;$('send').disabled=value;$('input').disabled=value;$('new').disabled=value;$('cancel').hidden=!activeRun;}
async function connect(){
 try{const health=await api('/health');$('connection').textContent=health.ready?'● 已连接 · '+(health.model||'模型服务'):'○ 模型未配置';
 if(!health.ready)notice('后台尚未配置模型，请完成配置后再试。');else notice('');
 const version=epoch;
 try{const history=await api('/agent/sessions/'+encodeURIComponent(sessionId));if(version!==epoch)return;$('messages').replaceChildren();for(const m of history.messages)message(m.role,m.content);if(history.lastRunId){const previous=await api('/agent/runs/'+history.lastRunId);if(version!==epoch)return;renderSteps(previous);}}catch(e){if(e.status!==404)throw e;}
 const stored=sessionStorage.getItem('xiaoyi-lab-run-'+sessionId);if(stored){activeRun=stored;currentMessage=message('assistant','恢复本轮执行状态…');lock(true);}
 await refreshLatency();await refresh();
 }catch(e){$('connection').textContent='○ 尚未连接';notice(e.message);if(e.status===401&&!$('config').open)$('config').showModal();}
}
$('settings').onclick=()=>{$('token').value=token;$('config').showModal();};$('close-config').onclick=()=>$('config').close();
$('connect').onsubmit=async e=>{e.preventDefault();token=$('token').value.trim();if(token)localStorage.setItem('xiaoyi-lab-access-token',token);else localStorage.removeItem('xiaoyi-lab-access-token');$('token').value='';$('config').close();await connect();};
$('new').onclick=()=>{epoch++;sessionId=crypto.randomUUID();activeRun=null;retryRequest=null;currentMessage=null;saveSession();$('messages').replaceChildren();$('events').replaceChildren();$('run-meta').textContent='';$('run-state').textContent='等待开始';taskSignature='';$('tasks').replaceChildren();notice('新对话已准备好。');renderLatency(null);$('latency-average').textContent='暂无历史统计';refresh();};
for(const button of document.querySelectorAll('.example'))button.onclick=()=>{$('input').value=button.textContent;$('input').focus();};
$('input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('composer').onsubmit=async e=>{
 e.preventDefault();if(busy)return;const text=$('input').value.trim();if(!text)return;
 const request=retryRequest?.message===text?retryRequest:{sessionId,requestId:crypto.randomUUID(),message:text};retryRequest=request;lock(true);notice('正在提交…');
 try{const run=await api('/agent/runs',request);message('user',text);$('input').value='';activeRun=run.id;renderSteps(run);sessionStorage.setItem('xiaoyi-lab-run-'+sessionId,activeRun);currentMessage=message('assistant','正在理解你的需求…');retryRequest=null;lock(true);await refresh();}
 catch(error){notice(error.message+' 可再次发送；相同内容将复用本次请求标识。');lock(false);}
};
$('cancel').onclick=async()=>{if(!activeRun)return;try{await api('/agent/runs/'+activeRun+'/cancel',{});await refresh();}catch(e){notice(e.message);}};
function taskCard(task){
 const card=document.createElement('article');card.className='task';
 const badge=document.createElement('span');badge.className='badge';badge.textContent=statuses[task.status]||task.status;
 const title=document.createElement('div');title.className='task-title';title.textContent=task.input;
 card.append(badge,title);
 if(task.result||task.error){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=task.result?'查看结果':'查看原因';const result=document.createElement('div');result.className='result';result.textContent=task.result||task.error;details.append(summary,result);card.append(details);}
 const actions=document.createElement('div');actions.className='task-actions';
 const options=task.status==='failed'?[['retry','重试']]:task.status==='paused'?[['resume','继续'],['cancel','取消']]:task.status==='queued'?[['pause','暂停'],['cancel','取消']]:task.status==='running'?[['cancel','取消']]:[];
 for(const [action,label] of options){const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await api('/tasks/'+task.id+'/'+action,{version:task.version});await refresh();}catch(e){notice(e.message);button.disabled=false;}};actions.append(button);}card.append(actions);return card;
}

function renderLatency(run){
 const m=run?.latency;
 const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' 秒':'—';
 for(const [id,key] of [['first','firstTextMs'],['total','totalMs'],['model','modelMs'],['tool','toolMs']])$('latency-'+id).textContent=seconds(m?.[key]);
 $('latency-calls').textContent=m?`${m.running?'计时中':'本轮结束'} · 模型 ${m.modelCalls} 次 · 工具 ${m.toolCalls} 次`:'发送消息后开始计时';
}
async function refreshLatency(){
 const version=epoch;
 const stats=await api('/agent/sessions/'+encodeURIComponent(sessionId)+'/latency');
 if(version!==epoch)return;
 const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' 秒':'—';
 $('latency-average').textContent=`最近 20 个已结束轮次：成功 ${stats.sampleCount} 轮，失败/取消 ${stats.excludedCount} 轮。平均总耗时 ${seconds(stats.total.ms)}（${stats.total.count} 轮）；平均首字 ${seconds(stats.firstText.ms)}（${stats.firstText.count} 轮）。`;
}
function renderSteps(run){
 renderLatency(run);
 const signature=run.id+':'+run.events.length+':'+run.status;
 if($('events').dataset.signature===signature)return;
 const opened=new Set([...$('events').querySelectorAll('details[open]')].map(d=>d.dataset.key));
 $('events').dataset.signature=signature;
 $('run-state').textContent=statuses[run.status]||run.status;
 $('run-meta').textContent='本轮 '+run.id.slice(0,8)+' · '+new Date(run.createdAt).toLocaleTimeString();
 const elements=[];
 const append=(event,title,state,duration,fields)=>{
  const li=document.createElement('li');li.className='step-card';
  const heading=document.createElement('div');heading.className='step-title';heading.textContent=title;
  const meta=document.createElement('div');meta.className='step-meta';meta.textContent=state+' · '+new Date(event.at).toLocaleTimeString()+(duration!=null?' · '+(duration/1000).toFixed(2)+' 秒':'');
  li.append(heading,meta);
  for(const [label,value] of fields){if(value==null)continue;const details=document.createElement('details');details.dataset.key=run.id+':'+event.id+':'+label;details.open=opened.has(details.dataset.key);const summary=document.createElement('summary');summary.textContent=label;const pre=document.createElement('pre');pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);details.append(summary,pre);li.append(details);}
  elements.push(li);
 };
 const terminal=!['queued','running'].includes(run.status);
 for(const event of run.events){
  if(event.type==='fast_route'){
   append(event,'本地快速通道','未调用模型',null,[['处理方式',event.route==='greeting'?'独立问候直接回复':'查询当前会话真实任务列表']]);
  }else if(event.type==='model_started'){
   const end=run.events.find(e=>e.type==='model_completed'&&e.step===event.step);
   append(event,'Step '+event.step+' · 模型处理',end?'已返回':terminal?(statuses[run.status]||'已结束'):'执行中',end?.durationMs,end?[['首字等待',end.firstTokenMs!=null?(end.firstTokenMs/1000).toFixed(2)+' 秒':null],['处理结果',end.toolCount?'请求调用 '+end.toolCount+' 个工具':'生成对话回复']]:[]);
  }else if(event.type==='tool_started'){
   const end=run.events.find(e=>e.type==='tool_result'&&e.callId===event.callId);
   append(event,(event.step?'Step '+event.step+' · ':'')+(toolNames[event.name]||event.name),end?(end.result?.error?'执行失败':'已返回'):terminal?'已中断':'执行中',end?.durationMs,[['工具',event.name],['输入参数',event.input],['返回结果',end?.result]]);
  }else if(event.type==='direct_acknowledgement'){
   append(event,'任务状态即时确认','已确认',null,[['任务 ID',event.taskId]]);
  }else if(['completed','waiting_input','failed','cancelled'].includes(event.type)){
   append(event,statuses[event.type]||event.type,statuses[event.type],null,[[event.error?'失败原因':'回复内容',event.error||event.text]]);
  }
 }
 if(!elements.length){const li=document.createElement('li');li.textContent='等待后台开始处理…';elements.push(li);}
 $('events').replaceChildren(...elements);
}

let taskSignature='',lastTasksAt=0;
async function refresh(){
 if(polling)return;polling=true;const version=epoch;
 try{
  if(activeRun){const run=await api('/agent/runs/'+activeRun);if(version!==epoch)return;
   renderSteps(run);
   if(['queued','running'].includes(run.status)){if(run.partial && currentMessage)currentMessage.textContent=run.partial;notice('小艺正在处理，可以停止本轮。');}
   else{currentMessage.textContent=run.output||run.error||'本轮已结束';sessionStorage.removeItem('xiaoyi-lab-run-'+sessionId);activeRun=null;lock(false);await refreshLatency();if(version!==epoch)return;notice(run.status==='waiting_input'?'请在下方补充信息。':run.status==='failed'?'本轮未完成，可查看执行过程。':'');}
  }
  if(activeRun && Date.now()-lastTasksAt<2000)return;
  lastTasksAt=Date.now();
  const {tasks}=await api('/tasks?sessionId='+encodeURIComponent(sessionId));if(version!==epoch)return;
  const signature=JSON.stringify(tasks);if(signature!==taskSignature){taskSignature=signature;$('tasks').replaceChildren(...tasks.slice().reverse().map(taskCard));if(!tasks.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='还没有任务，把想完成的事告诉小艺吧。';$('tasks').append(empty);}}
 }catch(e){notice(e.message);if(e.status===401)$('connection').textContent='○ 请填写访问口令';}
 finally{polling=false;}
}
$('refresh').onclick=()=>refresh();setInterval(()=>{if(!document.hidden && (activeRun || Date.now()-lastTasksAt>=2000))refresh();},250);connect();
