// Exact whole-message matches only. Never infer mutations or drop extra requests.
export function fastRoute(input,waitingForInput=false) {
 if(waitingForInput)return null;
 const text=input.trim().toLowerCase().replace(/[！!。？?，,\s]+$/u,'');
 if(['你好','您好','嗨','hi','hello'].includes(text))return {kind:'greeting',text:'你好！可以和我聊聊，或交给我一个文字任务。'};
 if(['查看任务','查看任务列表','看看当前有哪些任务','当前有哪些任务','列出任务','任务列表'].includes(text))return {kind:'list_tasks'};
 return null;
}
export function taskListReply(tasks){
 const labels={queued:'排队中',running:'执行中',paused:'已暂停',waiting_input:'等待补充',succeeded:'已完成',failed:'失败',cancelled:'已取消'};
 return tasks.length?'当前会话最近的任务：\n'+tasks.map((t,i)=>`${i+1}. ${t.input}（${labels[t.status]||t.status}）`).join('\n'):'当前会话还没有任务。你可以告诉我想完成什么。';
}
