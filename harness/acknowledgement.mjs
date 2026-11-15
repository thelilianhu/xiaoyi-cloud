// Ground acknowledgements in the registered task; keep the fast path model-free.
function nextAction(tool, task) {
 const text=String(task.name||'')+' '+String(task.input||'');
 if(tool==='create_research_task')return '先查资料，把有用的信息整理出来';
 if(/视频|短片|动画/.test(text))return '先理清脚本和分镜';
 if(/ppt|幻灯|演示文稿/i.test(text))return '先把内容框架搭起来';
 if(/相册|照片|(?:查找|筛选|整理).*图片/.test(text))return '先按你的要求筛选照片';
 if(/图像|图片|海报|插画/.test(text))return '先梳理画面和构图';
 if(/邮件|邮箱|email/i.test(text))return '先梳理要处理的内容';
 if(tool==='create_phone_task')return '按你的要求往下处理';
 return '先整理一版内容';
}
export function taskAcknowledgement(tool, task, action, recent=[]) {
 const name=String(task.name||'这件事').replace(/[\r\n]+/g,' ').trim();
 if(task.status==='failed')return `“${name}”这次没能处理好，我把问题留在任务里了。`;
 if(task.status==='cancelled')return `好，“${name}”已经停下了。`;
 if(task.status==='paused')return `好，“${name}”先暂停。`;
 if(task.status==='waiting_input')return `“${name}”还需要你补充一点信息，才能继续。`;
 if(task.status==='succeeded')return `“${name}”已经做好了，结果放在对话里。`;
 const next=nextAction(tool,task);
 const options=tool==='control_task'
  ?action==='update'?[`收到，“${name}”我按你刚才的要求调整。`,`明白，我会把新要求补进“${name}”里。`,`那“${name}”就按这个方向改。`,`“${name}”的要求更新了，我接着处理。`]
   :[`好，“${name}”我接着处理。`,`“${name}”交给我继续。`,`收到，我继续处理“${name}”。`]
  :[`好，“${name}”交给我，我${next}。`,`“${name}”我来处理，${next}。`,`收到，我会${next}，推进“${name}”。`,`可以，我来做“${name}”，${next}。`,`那我就从“${name}”开始，${next}。`];
 // Prefer the least recently used sentence opening, independent of task names.
 const shape=s=>String(s).replace(/“[^”]*”/g,'“任务”').split(/[，。]/)[0];
 const history=recent.map(shape);
 return options.reduce((best,item)=>history.lastIndexOf(shape(item))<history.lastIndexOf(shape(best))?item:best);
}
