export function resultSummary(task){
 if(task.status!=='succeeded')return null;
 if((task.kind==='phone_simulation'||task.steps?.some(s=>s.type==='demo_fallback')))return /买|购买|下单|购物/.test(task.input||'')?'选购记录已整理，可查看商品选择与订单确认步骤。':'处理记录已整理，点击查看。';
 const lines=String(task.result||'').split('\n').map(s=>s.replace(/^\s*[#>*-]+\s*/,'').replace(/\*\*/g,'').trim()).filter(s=>s&&!/^【模拟|^模拟工具|^参考来源|^https?:/.test(s));
 return lines.join(' ').slice(0,160)||'暂无可展示的结果内容。';
}

export function completionReply(task){
 if(task.status!=='succeeded')return null;
 const name=String(task.name||'这件事').replace(/[\r\n]+/g,' ');
 if((task.kind==='phone_simulation'||task.steps?.some(s=>s.type==='demo_fallback'))){
  return `“${name}”的内容整理好了，放在下面的卡片里。你可以点开看看，也可以继续告诉我要调整哪里。`;
 }
 const summary=resultSummary(task);
 return `“${name}”整理好了。${summary||''}${summary&&!/[。！？]$/.test(summary)?'。':''}完整内容放在下面的卡片里，你看看是否符合你的想法。`;
}
