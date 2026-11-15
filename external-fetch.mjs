import {ProxyAgent} from 'undici';
let dispatcher;let proxy;
// Only external tools use this proxy; model and local service connections keep their settings.
export function externalFetch(url,options={}){
 const configured=process.env.TOOL_HTTPS_PROXY;
 if(configured&&(!dispatcher||proxy!==configured)){dispatcher?.close();proxy=configured;dispatcher=new ProxyAgent(configured);}
 return fetch(url,{...options,...(configured?{dispatcher}:{})});
}
