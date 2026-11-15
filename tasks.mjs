import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function taskName(input, name) {
 if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 60)) throw new TaskError(400, '任务名称需为 1–60 字。');
 const clean = value => value.replace(/（(?:模拟|演示|后台|异步)[^）]*）|\((?:模拟|演示|后台|异步)[^)]*\)/g,'').replace(/异步|后台执行|后台任务|模拟|演示/g,'').replace(/^[\s:：·-]+|[\s:：·-]+$/g,'').trim();
 if (name !== undefined && clean(name)) return clean(name);
 const text = clean(input.replace(/^(?:异步|模拟)?演示[：:]\s*/, '')).replace(/^(?:请|帮我|请帮我)?(?:撰写|写|制作|做|生成|整理)(?:一份|一个|一句)?/, '').replace(/^[「“《](.*?)[」”》]/, '$1').split(/[，。；：\n]/)[0].trim();
 return [...(text || '文字任务')].slice(0,24).join('');
}

export class TaskError extends Error {
 constructor(status, message) { super(message); this.status = status; }
}
// Single-process store. Each accepted transition is persisted before publication.
export class TaskQueue {
 constructor({file, execute, concurrency = 2}) {
  this.file = file; this.execute = execute; this.concurrency = concurrency;
  this.running = new Map(); this.closed = false;
  try { this.tasks = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; this.tasks = []; }
  let namesAdded = false;
  for (const task of this.tasks) {
   const normalizedName=taskName(task.input,task.name||undefined);
   if(task.name!==normalizedName){task.name=normalizedName;namesAdded=true;}
   if (task.status === 'running') this.change(task, 'failed', {error: '服务重启中断了执行，请重试。'});
  }
  if (namesAdded) this.persist();
  queueMicrotask(() => this.pump());
 }
 persist() {
  mkdirSync(dirname(this.file), {recursive: true, mode: 0o700});
  writeFileSync(this.file + '.tmp', JSON.stringify(this.tasks), {mode: 0o600});
  renameSync(this.file + '.tmp', this.file);
 }
 change(task, status, fields = {}) {
  const previous = structuredClone(task);
  Object.assign(task, fields, {status, updatedAt: new Date().toISOString(), version: task.version + 1});
  task.events.push({id: task.version, status, at: task.updatedAt});
  try { this.persist(); } catch (error) { Object.assign(task, previous); throw error; }
  return structuredClone(task);
 }
 get(id) {
  const task = this.tasks.find(t => t.id === id);
  if (!task) throw new TaskError(404, '任务不存在。');
  return task;
 }
 list(sessionId) { return this.tasks.filter(t => !sessionId || t.sessionId === sessionId).map(t => structuredClone(t)); }
 clear() {
  const cleared = this.tasks.length;
  const backup = this.file + '.backup-' + Date.now() + '.json';
  if (cleared) copyFileSync(this.file, backup);
  for (const controller of this.running.values()) controller.abort();
  this.running.clear();
  const previous = this.tasks;
  this.tasks = [];
  try { this.persist(); } catch (error) { this.tasks = previous; throw error; }
  return {cleared, backup: cleared ? backup : null};
 }
 create({input, name, sessionId, requestId, searchQuery, simulationPlan, kind = 'text'}) {
  if (!['text','phone_simulation','research'].includes(kind)) throw new TaskError(400,'任务类型无效。');
  if (typeof input !== 'string' || !input.trim() || input.length > 12000) throw new TaskError(400, '请提供 1–12000 字的任务内容。');
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128) throw new TaskError(400, '缺少有效的 sessionId。');
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128) throw new TaskError(400, '缺少有效的 requestId。');
  if(searchQuery!==undefined&&(typeof searchQuery!=='string'||!searchQuery.trim()||searchQuery.length>400))throw new TaskError(400,'搜索词无效');
  const old = this.tasks.find(t => t.sessionId === sessionId && t.requestId === requestId);
  if (old) {
   if ((old.originalInput ?? old.input) !== input) throw new TaskError(409, 'requestId 已用于不同的任务内容。');
   return structuredClone(old);
  }
  const task = {id: randomUUID(), sessionId, requestId, name: taskName(input, name), input, originalInput: input, kind, searchQuery, simulationPlan:typeof simulationPlan==='string'?simulationPlan.slice(0,2000):null, status: 'queued', version: 0, attempts: 0, createdAt: new Date().toISOString(), events: [], result: null, error: null};
  this.tasks.push(task);
  try { this.change(task, 'queued'); } catch (error) { this.tasks.pop(); throw error; }
  queueMicrotask(() => this.pump());
  return structuredClone(task);
 }
 ask(id, question, runId) {
  const task=this.get(id);
  const existing=(task.questions||[]).find(q=>q.runId===runId);
  if(existing)return structuredClone(task);
  const result=this.change(task,'waiting_input',{questions:[...(task.questions||[]),{runId,question,at:new Date().toISOString(),answer:null}],pendingQuestion:question});
  this.running.get(id)?.abort();return result;
 }
 action(id, action, {input, name, version, plan} = {}) {
  const task = this.get(id);
  if (!Number.isInteger(version) || version !== task.version) throw new TaskError(409, '任务已更新，请获取最新版本后重试。');
  if (action === 'cancel') {
   if (!['queued', 'running', 'paused', 'waiting_input'].includes(task.status)) throw new TaskError(409, '当前状态不可取消。');
   const result = this.change(task, 'cancelled');
   this.running.get(id)?.abort();
   return result;
  }
  if (action === 'pause') {
   if (task.status !== 'queued') throw new TaskError(409, '仅排队中的任务可以暂停。');
   return this.change(task, 'paused');
  }
  if (action === 'update') {
   if (typeof input !== 'string' || !input.trim() || input.length > 12000) throw new TaskError(400, '任务内容无效。');
   const fields = {input, name: taskName(input, name)};
   if(task.kind==='phone_simulation')fields.simulationPlan=typeof plan==='string'?plan.slice(0,2000):null;
   if(task.kind==='research')fields.searchQuery=input.slice(0,400);
   if(task.pendingQuestion){fields.pendingQuestion=null;fields.questions=(task.questions||[]).map(q=>q.answer===null?{...q,answer:input,answeredAt:new Date().toISOString()}:q);}
   if (!['queued','paused'].includes(task.status)) {
    fields.revisions = [...(task.revisions || []), {input:task.input, name:task.name, result:task.result, completedAt:task.updatedAt, status:task.status, version:task.version}];
    fields.result = null; fields.error = null;
    const result = this.change(task, 'queued', fields);
    this.running.get(id)?.abort();
    queueMicrotask(() => this.pump());
    return result;
   }
   return this.change(task, task.status, fields);
  }
  if ((action === 'retry' && task.status === 'failed') || (action === 'resume' && task.status === 'paused')) {
   const result = this.change(task, 'queued', {error: null, result: null});
   queueMicrotask(() => this.pump()); return result;
  }
  throw new TaskError(409, '不支持此操作或当前任务状态不允许。');
 }
 pump() {
  if (this.closed) return;
  for (const task of this.tasks) {
   if (this.running.size >= this.concurrency) break;
   if (task.status !== 'queued' || this.running.has(task.id)) continue;
   const controller = new AbortController();
   try { this.change(task, 'running', {attempts: task.attempts + 1}); }
   catch { this.closed = true; return; }
   this.running.set(task.id, controller);
   const execution=structuredClone(task);
   Promise.resolve().then(() => this.execute(execution, controller.signal, step => {
    if(task.status !== 'running' || controller.signal.aborted) return;
    const previous=task.steps;
    task.steps=[...(previous||[]), {...step,at:new Date().toISOString(),attempt:task.attempts}];
    try {this.persist();} catch(error) {task.steps=previous;throw error;}
   })).then(result => {
    if (task.status !== 'running' || controller.signal.aborted) return;
    if (typeof result !== 'string' || !result.trim()) throw Error('empty');
    this.change(task, 'succeeded', {result, error: null});
   }).catch(() => {
    if (task.status === 'running' && !controller.signal.aborted) this.change(task, 'failed', {error: '任务执行失败或超时，请稍后重试。'});
   }).catch(() => { this.closed = true; }).finally(() => { this.running.delete(task.id); this.pump(); });
  }
 }
 close() { this.closed = true; for (const controller of this.running.values()) controller.abort(); }
}

export async function taskRoutes(req, res, queue) {
 const url = new URL(req.url, 'http://localhost');
 if (url.pathname !== '/tasks' && !url.pathname.startsWith('/tasks/')) return false;
 const send = (status, data) => {res.writeHead(status); res.end(JSON.stringify(data));};
 try {
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'GET' && parts.length === 1) { send(200, {tasks: queue.list(url.searchParams.get('sessionId'))}); return true; }
  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'clear') { send(200, queue.clear()); return true; }
  if (req.method === 'GET' && parts.length === 2) { send(200, queue.get(parts[1])); return true; }
  if (req.method === 'GET' && parts.length === 3 && parts[2] === 'events') {
   const after = Number(url.searchParams.get('after') || 0);
   if (!Number.isSafeInteger(after) || after < 0) throw new TaskError(400, '事件游标无效。');
   const task = queue.get(parts[1]);
   send(200, {events: task.events.filter(e => e.id > after), cursor: task.version, status: task.status}); return true;
  }
  if (req.method !== 'POST' || ![1, 3].includes(parts.length)) throw new TaskError(404, '接口不存在。');
  const chunks = []; let bytes = 0; for await (const chunk of req) {bytes += chunk.length; if (bytes > 65536) throw new TaskError(413, '请求过长。'); chunks.push(chunk);}
  const body = Buffer.concat(chunks).toString('utf8');
  let data; try {data = JSON.parse(body);} catch {throw new TaskError(400, '请求格式无效。');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TaskError(400, '请求格式无效。');
  const result = parts.length === 1 ? queue.create(data) : queue.action(parts[1], parts[2], data);
  send(parts.length === 1 ? 202 : 200, result);
 } catch (error) {send(error.status || 500, {error: error.status ? error.message : '任务存储暂时不可用。'});}
 return true;
}
