import {Agent} from 'undici';
import {completionDeltas} from './stream.mjs';
const agent=new Agent({connect:{family:4,timeout:12000}});
for(const model of [process.env.MODEL_NAME,'gpt-6-luna']){
 const start=Date.now();let first=null,last=null,count=0,chars=0,maxGap=0;
 try{
  const response=await fetch(process.env.MODEL_BASE_URL+'/chat/completions',{dispatcher:agent,method:'POST',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.MODEL_API_KEY},body:JSON.stringify({model,stream:true,messages:[{role:'user',content:'请只回复四个字：连接正常'}]})});
  if(!response.ok){console.log(JSON.stringify({model,status:response.status}));continue;}
  for await(const text of completionDeltas(response.body)){const now=Date.now();first??=now-start;if(last)maxGap=Math.max(maxGap,now-last);last=now;count++;chars+=text.length;}
  console.log(JSON.stringify({model,complete:true,firstMs:first,totalMs:Date.now()-start,count,chars,maxGapMs:maxGap}));
 }catch(e){console.log(JSON.stringify({model,complete:false,error:e.cause?.code||e.name,firstMs:first,totalMs:Date.now()-start,count,chars,maxGapMs:maxGap}));}
}
await agent.close();
