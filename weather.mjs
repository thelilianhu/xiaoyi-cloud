import {deviceLocation} from './device-location.mjs';
import {externalFetch} from './external-fetch.mjs';
async function json(url,signal,fetchImpl){
 const response=await fetchImpl(url,{signal,redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('天气服务暂时不可用，请稍后重试。');
 const reader=response.body.getReader();const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>500000)throw Error('天气返回异常');chunks.push(value);}}finally{await reader.cancel();}
 return JSON.parse(Buffer.concat(chunks).toString());
}
export function weatherPlace(args, location){
 if(typeof args.city==='string'&&args.city.trim())return {...args,locationSource:'specified'};
 const current=deviceLocation(location);
 if(current.available)return {...args,city:current.city||'当前位置',latitude:current.latitude,longitude:current.longitude,locationSource:'device'};
 return {...args,city:'深圳',country_code:'CN',locationSource:'default'};
}
export async function getWeather({city,country_code,days=3,latitude,longitude,locationSource},{signal,fetchImpl=externalFetch}={}){
 if(typeof city!=='string'||!city.trim()||city.length>100||!Number.isInteger(days)||days<1||days>7||country_code&&!/^[A-Z]{2}$/.test(country_code))throw Error('请提供城市名称、可选的两位国家代码，以及 1–7 天范围。');
 const timeout=AbortSignal.timeout(25000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 const byCoordinates=Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
 let p;
 const location=p=>({name:p.name,region:p.admin1,country:p.country,country_code:p.country_code});
 if(byCoordinates){p={name:city,latitude,longitude};}else{
 const geo=new URL('https://geocoding-api.open-meteo.com/v1/search');geo.search=new URLSearchParams({name:city.trim(),count:'5',language:'zh',format:'json',...(country_code?{countryCode:country_code}:{})}).toString();
 const places=(await json(geo,combined,fetchImpl)).results||[];
 if(!places.length)return {needsClarification:true,question:'没找到这个城市，请补充城市名称和所在国家。'};
 // Never silently choose between places in different countries.
 if(!country_code&&new Set(places.map(p=>p.country_code)).size>1)return {needsClarification:true,question:'有几个同名地点，你指的是哪一个？',candidates:places.map(location)};
 p=places[0];}
 if(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))throw Error('城市坐标不可用');
 const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:String(p.latitude),longitude:String(p.longitude),timezone:'auto',forecast_days:String(days),current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'}).toString();
 let data;
 try { data=await json(url,AbortSignal.any([combined,AbortSignal.timeout(7000)]),fetchImpl);if(!data.current||!data.daily)throw Error('天气数据不完整'); }
 catch(error){
  combined.throwIfAborted();
  const fallbackUrl='https://wttr.in/'+encodeURIComponent(p.latitude+','+p.longitude)+'?format=j1';
  const alternate=await json(fallbackUrl,AbortSignal.any([combined,AbortSignal.timeout(10000)]),fetchImpl);
  const current=alternate.current_condition?.[0],forecast=alternate.weather?.slice(0,Math.min(days,3));
  if(!current||!Number.isFinite(Number(current.temp_C))||!forecast?.length)throw Error('天气数据不完整，请稍后重试。');
  return {provider:'wttr.in',source:fallbackUrl,simulated:false,fetchedAt:new Date().toISOString(),location:location(p),locationSource:locationSource||'specified',usedDefault:locationSource==='default',
   current:{time:current.localObsDateTime||current.observation_time,temperature_2m:Number(current.temp_C),apparent_temperature:Number(current.FeelsLikeC),relative_humidity_2m:Number(current.humidity),wind_speed_10m:Number(current.windspeedKmph),description:current.weatherDesc?.[0]?.value},
   current_units:{temperature_2m:'°C',apparent_temperature:'°C',relative_humidity_2m:'%',wind_speed_10m:'km/h'},
   daily:{time:forecast.map(d=>d.date),temperature_2m_max:forecast.map(d=>Number(d.maxtempC)),temperature_2m_min:forecast.map(d=>Number(d.mintempC))},daily_units:{temperature_2m_max:'°C',temperature_2m_min:'°C'},
   note:'主天气服务暂不可用，使用备用实时服务。仅提供返回日期内的预报，最多3天；必须注明来源和观测时间，不得补编其余天数。'};
 }

 return {provider:'Open-Meteo',source:'https://open-meteo.com/',simulated:false,fetchedAt:new Date().toISOString(),location:location(p),locationSource:locationSource||'specified',usedDefault:locationSource==='default',timezone:data.timezone,current:data.current,current_units:data.current_units,daily:data.daily,daily_units:data.daily_units,note:'当前天气为气象模型估计，预报不是保证；时间按查询城市时区。请注明城市和数据时间，不推断用户当前位置。'};
}
