// Ground acknowledgements in the registered task; keep the fast path model-free.
function nextAction(tool, task) {
 const text=String(task.name||'')+' '+String(task.input||'');
 const app=text.match(/淘宝|京东|拼多多|小红书|美团|饿了么/)?.[0];
 const item=text.match(/牛奶|酸奶|咖啡|面包|水果|零食|鸡蛋|耳机|手机|运动鞋/)?.[0];
 if(/买|购买|下单|购物/.test(text))return `帮你${app?'去'+app:''}找${item?'款合适的'+item:'找合适的商品'}`;
 if(tool==='create_research_task')return '先查查相关资料，把有用的信息整理出来';
 if(/视频|短片|动画/.test(text))return '先理清视频的脚本和分镜';
 if(/ppt|幻灯|演示文稿/i.test(text))return '先搭好这份 PPT 的内容框架';
 if(/相册|照片|(?:查找|筛选|整理).*图片/.test(text))return '先筛选符合要求的照片';
 if(/图像|图片|海报|插画/.test(text))return '先梳理画面主题和构图';
 if(/邮件|邮箱|email/i.test(text))return '先看看邮件里有哪些需要处理的内容';
 if(/旅行|攻略|行程|日游/.test(text))return '先看看目的地有哪些值得去的地方，再安排行程';
 if(tool==='create_phone_task')return app?`去${app}看看，先找到需要的功能`:'先看看从哪里着手处理这件事';
 return '先整理内容，把重点梳理清楚';
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
  :[`好的，我${next}。`,`没问题，我${next}。`,`交给我吧，我${next}。`,`好呀，我${next}。`,`明白，我${next}。`];
 // Prefer the least recently used sentence opening, independent of task names.
 const shape=s=>String(s).replace(/“[^”]*”/g,'“任务”').split(/[，。]/)[0];
 const history=recent.map(shape);
 return options.reduce((best,item)=>history.lastIndexOf(shape(item))<history.lastIndexOf(shape(best))?item:best);
}
