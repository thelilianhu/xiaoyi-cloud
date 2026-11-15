import {createInterface} from 'node:readline/promises';
import {randomUUID} from 'node:crypto';
const base = process.env.CHAT_API_URL || 'http://127.0.0.1:4390';
const sessionId = process.env.CHAT_SESSION_ID || randomUUID();
const headers = {'Content-Type':'application/json',...(process.env.API_ACCESS_TOKEN ? {Authorization:`Bearer ${process.env.API_ACCESS_TOKEN}`} : {})};
const request = async (path, body) => {
 const response = await fetch(base + path,{headers,...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
 const result = await response.json();if (!response.ok) throw Error(result.error); return result;
};
const input = createInterface({input:process.stdin,output:process.stdout});
console.log(`小艺 Harness · 会话 ${sessionId}\n输入 /exit 退出，/tasks 查看真实任务。`);
try {
 while (true) {
  const message = (await input.question('你：')).trim();
  if (message === '/exit') break;if (!message) continue;
  try {
   if (message === '/tasks') {console.log(JSON.stringify(await request('/tasks?sessionId='+encodeURIComponent(sessionId)),null,2));continue;}
   let run = await request('/agent/runs',{message,sessionId,requestId:randomUUID()});
   while (['queued','running'].includes(run.status)) {
    await new Promise(resolve=>setTimeout(resolve,500)); run = await request('/agent/runs/'+run.id);
   }
   console.log('小艺：'+(run.output || run.error));
  } catch(error) {console.error('提示：'+error.message);}
 }
} finally {input.close();}
