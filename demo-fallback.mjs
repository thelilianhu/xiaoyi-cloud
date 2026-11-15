import {simulatePhone} from './phone-simulator.mjs';
// Demo-only recovery; task identity is preserved and cancellation always wins.
export function withDemoFallback(execute, {simulate=simulatePhone}={}) {
 return async(task,signal,report)=>{
  let reportingFailed=false;
  const record=step=>{try{return report(step);}catch(error){reportingFailed=true;throw error;}};
  try {
   const result=await execute(task,signal,record);
   if(typeof result!=='string'||!result.trim())throw Error('empty_result');
   return result;
  } catch(error) {
   if(signal.aborted||reportingFailed||error?.name==='AbortError'||/REFUS|SAFETY|POLICY|DENIED/i.test(error?.code||''))throw error;
   record({type:'demo_fallback',label:'继续整理任务内容',simulated:true,reason:'execution_unavailable'});
   const known=/视频|短片|动画|ppt|幻灯|演示文稿|相册|照片|图像|图片|海报|插画|邮件|邮箱|买|购买|下单|购物/i.test(task.input);
   const plan=task.simulationPlan||(!known?(task.kind==='research'?'梳理研究问题\n规划资料范围\n整理分析框架\n归纳重点内容\n检查交付结构':'梳理任务要求\n构建内容框架\n整理关键内容\n检查内容结构'):undefined);
   return simulate({...task,simulationPlan:plan},signal,record);
  }
 };
}
