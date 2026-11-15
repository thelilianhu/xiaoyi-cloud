import {setTimeout as delay} from 'node:timers/promises';
// In-memory simulation only. This module has no device, network or payment API.
export async function simulatePhone(task, signal, report, stepMs=3000) {
 const app=task.input.match(/淘宝|小红书|京东|美团|饿了么|拼多多|微信|支付宝/)?.[0]||'任务工作区';
 const shopping=/买|购买|下单|牛奶|购物/.test(task.input);
 const defaultSteps=shopping?[
  ['open_app','打开应用',app,'应用启动页'],
  ['wait','等待首页加载','首页内容','首页'],
  ['swipe','向上滑动浏览首页','从屏幕下方向上滑动','首页推荐区'],
  ['swipe','返回首页顶部','从屏幕上方向下滑动','首页顶部'],
  ['tap','点击搜索框','顶部搜索框','搜索输入页'],
  ['wait','等待键盘展开','模拟输入键盘','键盘已展开'],
  ['type','输入商品关键词',task.input.slice(0,120),'搜索框已填入需求'],
  ['tap','点击搜索按钮','键盘搜索按钮','搜索加载页'],
  ['wait','等待搜索结果加载','模拟商品列表','模拟搜索结果页'],
  ['swipe','向上滑动浏览商品','商品列表','更多示例商品'],
  ['tap','点击示例商品','示例商品卡片（非真实库存）','商品详情加载页'],
  ['wait','等待商品详情加载','商品详情','模拟商品详情页'],
  ['swipe','滑动查看商品介绍','商品说明区域','商品介绍区'],
  ['tap','打开规格选择面板','规格选择入口','模拟规格面板'],
  ['tap','选择示例规格','默认示例规格','规格已选中'],
  ['tap','设置购买数量','示例数量：1','数量已设置'],
  ['tap','确认规格与数量','规格面板确认按钮','模拟商品详情页'],
  ['tap','点击购买按钮','模拟购买按钮','订单确认加载页'],
  ['wait','等待订单确认页加载','订单确认页面','模拟订单确认页'],
  ['tap','查看示例收货信息','虚构示例地址（不读取真实地址）','模拟收货信息页'],
  ['tap','返回订单确认页','返回按钮','模拟订单确认页'],
  ['swipe','滑动核对订单摘要','示例商品、数量及费用区域','模拟订单摘要'],
  ['tap','确认演示订单','仅本地模拟确认按钮','演示完成（未真实下单、未支付）']
 ]:[
  ['open_app','打开应用',app,'应用启动页'],
  ['wait','等待首页加载','首页内容','首页'],
  ['swipe','滑动浏览功能','首页功能列表','功能列表'],
  ['tap','点击功能入口','演示功能入口','模拟功能页'],
  ['tap','点击输入框','需求输入框','模拟输入页'],
  ['wait','等待键盘展开','模拟输入键盘','键盘已展开'],
  ['type','输入需求',task.input.slice(0,120),'模拟编辑页'],
  ['tap','收起键盘','键盘完成按钮','模拟预览页'],
  ['swipe','滑动检查内容','预览内容','模拟确认页'],
  ['tap','点击演示确认','仅本地模拟确认按钮','演示完成（无真实操作）']
 ];
 const planned=String(task.simulationPlan||'').split('\n').map(s=>s.replace(/^\s*[-*\d.、)]+\s*/, '').trim()).filter(Boolean).slice(0,10);
 const categorySteps=/视频|短片|动画/.test(task.input)?['理解视频主题','编写视频脚本','规划画面分镜','生成分镜画面','合成配音与字幕','剪辑并检查画面']
  :/PPT|ppt|幻灯|演示文稿/.test(task.input)?['梳理汇报需求','整理参考资料','构建内容大纲','撰写页面内容','设计图表与版式','检查页面与交付要求']
  :/相册|照片|(?:查找|找|筛选|整理|挑选).*图片/.test(task.input)?['梳理照片查找条件','查找相关照片','按时间与主题筛选','挑选清晰照片','去除重复画面','整理挑选结果']
  :/图像|图片|海报|插画|绘画/.test(task.input)?['理解画面需求','设计主体构图','确定色彩与风格','生成画面','优化画面细节','检查成图效果']
  :/邮件|邮箱|email/i.test(task.input)?['梳理邮件处理要求','读取待处理邮件','分类筛选邮件','提炼重点事项','准备回复内容','核对处理结果']:null;
 const labels=planned.length>=2?planned:categorySteps;
 const steps=labels?labels.map(label=>['simulate_step',label,label,'执行画面']):defaultSteps;
 for(let i=0;i<steps.length;i++){
  signal.throwIfAborted();const [action,label,target,screen]=steps[i];const start=Date.now();
  const input={app,action,target,step:i+1,total:steps.length,expectedDurationMs:stepMs};
  report({type:'tool_started',name:'mock_phone.'+action,label,input,simulated:true,screen,total:steps.length,step:i+1});
  await delay(stepMs,undefined,{signal});signal.throwIfAborted();
  report({type:'tool_result',name:'mock_phone.'+action,label,simulated:true,screen,total:steps.length,step:i+1,durationMs:Date.now()-start,result:{simulated:true,success:true,screen,realOrderCreated:false,paymentMade:false}});
 }
 return '【模拟手机操控 · 未操作真实手机】\n已按你的需求完成 '+app+' 的逐步操作演示：\n'+steps.map((s,i)=>`${i+1}. ${s[1]}`).join('\n')+'\n\n这只是模拟流程；没有真实下单、支付或发送信息。商品、规格和页面均为演示数据。';
}
