import {readCompletionStream} from './stream.mjs';
export class ModelError extends Error {
 constructor(code, message) {super(message); this.code = code;}
}
// The only provider-specific boundary. Never return provider bodies or keys to clients.
export function createModel({base, key, model, dispatcher, timeoutMs = 180000, thinking}) {
 if(thinking && thinking!=='disabled')throw Error('仅支持显式关闭思考模式，启用思考需要适配推理历史。');
 const deepseek=new URL(base).hostname==='api.deepseek.com';
 return async ({messages, tools, signal, onText, reasoningEffort}) => {
  if (!key || !model) throw new ModelError('MODEL_UNCONFIGURED', '请先配置模型服务。');
  let response;
  for (let attempt=0; attempt<2; attempt++) {
  try { response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
   dispatcher, method:'POST', signal:AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
   headers:{'Content-Type':'application/json', Authorization:`Bearer ${key}`},
   body:JSON.stringify({model, messages, stream:Boolean(onText), max_tokens:1600,
    ...(thinking ? {thinking:{type:thinking}} : {}),
    ...(reasoningEffort ? {reasoning_effort:reasoningEffort} : {}),
    ...(tools?.length ? {tools, tool_choice:'auto', ...(!deepseek?{parallel_tool_calls:false}:{})} : {})})
  });
  } catch (error) {
   const code = error.cause?.code || error.code || error.name;
   if (signal.aborted) throw error;
   if (attempt === 0 && ['UND_ERR_SOCKET','ECONNRESET','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT'].includes(code)) continue;
   const messages = {
    UND_ERR_CONNECT_TIMEOUT:'连接模型平台超时，请检查网络后重试。',
    UND_ERR_HEADERS_TIMEOUT:'等待模型平台响应超时，请稍后重试。',
    UND_ERR_SOCKET:'与模型平台的连接中断，请重试。',
    ECONNRESET:'与模型平台的连接中断，请重试。',
    ENOTFOUND:'无法解析模型平台地址，请检查网络设置。',
    EAI_AGAIN:'模型平台地址解析暂时失败，请重试。',
    TimeoutError:'等待模型回复超时，请稍后重试。'
   };
   throw new ModelError('MODEL_NETWORK_ERROR', messages[code] || '连接模型平台失败，请检查网络后重试。');
  }
  break;
  }
  if (!response.ok) throw new ModelError('MODEL_HTTP_ERROR', `模型请求失败（HTTP ${response.status}）。请检查额度及工具调用兼容性。`);
  let payload;
  try {payload = response.headers?.get('content-type')?.includes('text/event-stream') ? await readCompletionStream(response.body,onText || (()=>{})) : await response.json();}
  catch {throw new ModelError('MODEL_FORMAT','模型平台返回了无效数据，请稍后重试。');}
  const choice = payload.choices?.[0];
  if (!choice || !['stop','tool_calls'].includes(choice.finish_reason)) throw new ModelError('MODEL_INCOMPLETE', '模型回复不完整，未继续执行。');
  const message = choice.message;
  if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw new ModelError('MODEL_FORMAT', '模型回复格式无效。');
  return {role:'assistant', content:message.content ?? null, ...(message.tool_calls?.length ? {tool_calls:message.tool_calls} : {})};
 };
}
