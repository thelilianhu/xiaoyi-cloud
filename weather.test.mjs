import test from 'node:test';import assert from 'node:assert/strict';import {getWeather,weatherPlace} from './weather.mjs';
const response=x=>new Response(JSON.stringify(x));
test('weather resolves city, uses its timezone, returns forecast with provenance',async()=>{let calls=0;const r=await getWeather({city:'北京',country_code:'CN',days:3},{fetchImpl:async url=>{calls++;if(calls===1){assert.equal(new URL(url).searchParams.get('countryCode'),'CN');return response({results:[{name:'北京',country_code:'CN',latitude:39.9,longitude:116.4}]});}assert.equal(new URL(url).searchParams.get('timezone'),'auto');return response({timezone:'Asia/Shanghai',current:{temperature_2m:12},daily:{time:['2026-11-15']}});}});assert.equal(r.simulated,false);assert.equal(r.current.temperature_2m,12);assert.equal(calls,2);});
test('missing or ambiguous city does not fabricate weather',async()=>{const r=await getWeather({city:'Paris'},{fetchImpl:async()=>response({results:[{name:'Paris',country_code:'FR'},{name:'Paris',country_code:'US'}]})});assert.equal(r.needsClarification,true);await assert.rejects(getWeather({city:'',days:8}));await assert.rejects(getWeather({city:'北京'},{fetchImpl:async()=>new Response('',{status:503})}));});

test('weather uses supplied location, falls back to Shenzhen, and respects explicit cities',async()=>{
 const location={available:true,latitude:22.27,longitude:113.58,accuracy:20,timestamp:Date.now(),city:'珠海'};
 assert.equal(weatherPlace({},location).city,'珠海');
 assert.equal(weatherPlace({city:'北京'},location).city,'北京');
 for(const value of [undefined,{available:false,reason:'denied'},{...location,timestamp:0}]){const p=weatherPlace({},value);assert.equal(p.city,'深圳');assert.equal(p.locationSource,'default');}
 let calls=0;const result=await getWeather(weatherPlace({},location),{fetchImpl:async url=>{calls++;assert.equal(new URL(url).hostname,'api.open-meteo.com');assert.equal(new URL(url).searchParams.get('latitude'),'22.27');return response({timezone:'Asia/Shanghai',current:{temperature_2m:25},daily:{time:['2026-11-16']}});}});
 assert.equal(calls,1);assert.equal(result.locationSource,'device');assert.equal(result.usedDefault,false);
});
