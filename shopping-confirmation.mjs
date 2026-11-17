import {setTimeout as delay} from 'node:timers/promises';
export const shoppingPrompt='帮我去淘宝买牛奶，付款前确认品牌、价格和规格';
export const shoppingOptions=['品牌无误','规格无误','数量无误','价格无误'];
export async function shoppingConfirmation(task,signal,report,ask,stepMs=5000){
 const confirmed=(task.questions||[]).some(q=>shoppingOptions.every(option=>String(q.answer||'').includes(option)));
 if(confirmed){
  report({type:'tool_started',label:'核对你确认的品牌、规格与订单金额',simulated:true});
  await delay(stepMs,undefined,{signal});signal.throwIfAborted();
  return '【模拟购物确认 · 未真实下单或付款】\n你已确认：伊利纯牛奶，250mL × 16盒，1箱；示例商品价59.90元，运费0元，合计59.90元。\n付款前确认流程已完成，未创建真实订单，也未扣款。';
 }
 for(const label of ['在淘宝查找符合要求的牛奶商品','比较候选商品的品牌与包装规格','核对商品金额、购买数量和运费']){
  signal.throwIfAborted();report({type:'tool_started',label,simulated:true});await delay(stepMs,undefined,{signal});
  report({type:'tool_result',label,simulated:true,result:{realOrderCreated:false,paymentMade:false}});
 }
 signal.throwIfAborted();
 ask(task.id,'付款前请核对这份示例商品信息：\n品牌：伊利纯牛奶\n规格：250mL × 16盒\n数量：1箱\n商品价：¥59.90 · 运费：¥0\n合计：¥59.90\n确认以下四项后继续；需要改品牌、规格或预算，也可以直接告诉我。','shopping-confirm-'+task.id+'-'+task.version,shoppingOptions);
 return '';
}
