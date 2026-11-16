// Location belongs only to the request that supplied it, never inferred from chat history.
export function deviceLocation(value,now=Date.now()){
 if(!value||value.available!==true)return {available:false,reason:['denied','disabled','timeout','unavailable'].includes(value?.reason)?value.reason:'unavailable'};
 const {latitude,longitude,accuracy,timestamp}=value;
 if(![latitude,longitude,accuracy,timestamp].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0||timestamp>now+60000||now-timestamp>300000)return {available:false,reason:'unavailable'};
 return {available:true,latitude,longitude,accuracy,timestamp,...(typeof value.city==='string'?{city:value.city.slice(0,100)}:{}),source:'device',coordinateSystem:'WGS84'};
}
