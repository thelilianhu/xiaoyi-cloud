// Assemble both text and function-call deltas; incomplete calls never reach tools.
export async function readCompletionStream(body, onText) {
 const decoder=new TextDecoder();let buffer='',content='',finish=null;const calls=new Map();
 function line(raw){
  if(!raw.startsWith('data:'))return;
  const text=raw.slice(5).trim();if(!text||text==='[DONE]')return;
  const data=JSON.parse(text);if(data.error)throw Error('provider_stream_error');
  const choice=data.choices?.[0];if(!choice)return;
  if(choice.finish_reason)finish=choice.finish_reason;
  const delta=choice.delta||{};
  if(typeof delta.content==='string'){content+=delta.content;onText(delta.content);}
  for(const part of delta.tool_calls||[]){
   if(!Number.isInteger(part.index)||part.index<0)throw Error('invalid_tool_index');
   const call=calls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}};
   if(part.id)call.id=part.id;if(part.type)call.type=part.type;
   if(part.function?.name)call.function.name+=part.function.name;
   if(part.function?.arguments)call.function.arguments+=part.function.arguments;
   calls.set(part.index,call);
  }
 }
 for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){line(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);}}
 buffer+=decoder.decode();if(buffer.trim())line(buffer);
 if(!['stop','tool_calls'].includes(finish))throw Error('incomplete_stream');
 return {choices:[{finish_reason:finish,message:{content,tool_calls:[...calls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call)}}]};
}
