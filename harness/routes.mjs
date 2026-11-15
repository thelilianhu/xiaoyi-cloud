import {TaskError} from '../tasks.mjs';
export async function harnessRoutes(req,res,harness) {
 const url = new URL(req.url,'http://localhost');
 if (!url.pathname.startsWith('/agent/')) return false;
 const send = (status,data) => {res.writeHead(status);res.end(JSON.stringify(data));};
 try {
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'GET' && parts[1] === 'sessions' && parts.length === 4 && parts[3] === 'latency') {send(200,harness.latency(parts[2]));return true;}
  if (req.method === 'GET' && parts[1] === 'sessions' && parts.length === 3) {send(200,harness.session(parts[2]));return true;}
  if (req.method === 'GET' && parts[1] === 'runs' && parts.length === 3) {send(200,harness.get(parts[2]));return true;}
  if (req.method === 'GET' && parts[1] === 'runs' && parts.length === 4 && parts[3] === 'events') {
   const after = Number(url.searchParams.get('after') || 0);
   if (!Number.isSafeInteger(after) || after < 0) throw new TaskError(400,'事件游标无效。');
   const run = harness.get(parts[2]);
   send(200,{status:run.status,events:run.events.filter(e=>e.id>after),cursor:run.events.length});return true;
  }
  if (req.method === 'POST' && parts[1] === 'runs' && parts.length === 4 && parts[3] === 'cancel') {send(200,harness.cancel(parts[2]));return true;}
  if (req.method !== 'POST' || parts[1] !== 'runs' || parts.length !== 2) throw new TaskError(404,'接口不存在。');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {bytes+=chunk.length;if(bytes>65536)throw new TaskError(413,'消息过长。');chunks.push(chunk);}
  let data; try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new TaskError(400,'请求格式无效。');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TaskError(400,'请求格式无效。');
  send(202,harness.submit(data));
 } catch(error) {send(error.status || 500,{error:error.status ? error.message : '运行记录暂时不可用。'});}
 return true;
}
