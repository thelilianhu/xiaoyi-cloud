// Decode SSE across arbitrary UTF-8 / network chunk boundaries.
export async function* completionDeltas(body) {
 const decoder=new TextDecoder();let buffer='',data=[],done=false;
 function parse(){const text=data.join('\n');data=[];if(!text)return null;if(text==='[DONE]'){done=true;return null;}const event=JSON.parse(text);if(event.error)throw Error('upstream_stream_error');const choice=event.choices?.[0];if(choice?.finish_reason==='stop')done=true;else if(choice?.finish_reason)throw Error('incomplete_stream');return choice?.delta?.content;}
 for await(const chunk of body){
  buffer+=decoder.decode(chunk,{stream:true});let index;
  while((index=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,index).replace(/\r$/,'');buffer=buffer.slice(index+1);
   if(line===''){const delta=parse();if(typeof delta==='string'&&delta)yield delta;if(done)return;}
   else if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
  }
 }
 throw Error('incomplete_stream');
}
