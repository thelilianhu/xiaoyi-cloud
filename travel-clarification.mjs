// Ask only after useful search results, and continue the same task after confirmation.
export function travelClarification(task, sources) {
 const input=String(task.input||'');
 if(!(sources?.results?.length>0)||(task.questions||[]).length)return null;
 if(!/攻略|行程|日游|旅行计划|旅游计划/.test(input))return null;
 if(/不用问|不要问|无需确认|不用确认|直接(?:生成|安排|给我|完成)|你来决定|按默认/.test(input))return null;
 const explicitRequest=input.includes('再让我确认旅行偏好');
 if(!explicitRequest&&/亲子|带(?:孩子|娃|老人)|美食|探店|看海|海边|人文|历史|博物馆|徒步|摄影|情侣|轻松|慢节奏|紧凑|特种兵|商务/.test(input))return null;
 return {
  label:'梳理搜索到的景点与交通资料',
  question:'景点和交通资料找到了。这次更想怎么玩？可以多选，我再按你的偏好细化路线。',
  options:[/珠海|厦门|三亚|青岛|大连|威海|北海|海口|深圳|海边|海滨/.test(input)?'轻松看海':'轻松观光','美食探店','亲子游玩','人文漫步']
 };
}
