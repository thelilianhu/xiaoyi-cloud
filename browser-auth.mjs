import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
export function createBrowserAuth(env=process.env,now=()=>Date.now()){
 const {LOGIN_USERNAME:username,LOGIN_PASSWORD_HASH:hash,LOGIN_SESSION_SECRET:secret}=env;
 const enabled=Boolean(username&&hash&&secret);
 if([username,hash,secret].some(Boolean)&&!enabled)throw Error('登录配置不完整');
 const maxAge=30*24*60*60;let attempts=0,windowStart=now();
 const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
 const cookie=(req,value,age)=>`celia_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${req.headers['x-forwarded-proto']==='https'||req.socket.encrypted?'; Secure':''}`;
 function accepts(req){
  if(!enabled)return false;
  const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('celia_session='))?.slice(14);
  if(!value||value.length>2048)return false;
  const [payload,signature]=value.split('.');if(!signature||!equal(sign(payload),signature))return false;
  try{const data=JSON.parse(Buffer.from(payload,'base64url'));return data.user===username&&data.exp>now()&&data.exp<=now()+maxAge*1000;}catch{return false;}
 }
 return {enabled,accepts,async handle(req,res,send){
  if(req.url==='/auth/session'&&req.method==='GET'){send(200,{enabled,authenticated:accepts(req),username:accepts(req)?username:null});return true;}
  if(req.url==='/auth/logout'&&req.method==='POST'){res.setHeader('Set-Cookie',cookie(req,'',0));send(200,{ok:true});return true;}
  if(req.url!=='/auth/login'||req.method!=='POST')return false;
  if(!enabled){send(503,{error:'登录暂未配置。'});return true;}
  if(now()-windowStart>60000){attempts=0;windowStart=now();}
  if(++attempts>12){res.setHeader('Retry-After','60');send(429,{error:'尝试过于频繁，请稍后重试。'});return true;}
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){send(413,{error:'输入内容过长。'});return true;}}
   const data=JSON.parse(body);if(typeof data.username!=='string'||typeof data.password!=='string')throw Error();
   const [salt,expected]=hash.split(':');const actual=scryptSync(data.password,salt,64).toString('hex');
   if(!equal(actual,expected)||!equal(data.username,username)){send(401,{error:'账号或密码不正确。'});return true;}
   const payload=Buffer.from(JSON.stringify({user:username,exp:now()+maxAge*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
   res.setHeader('Set-Cookie',cookie(req,payload+'.'+sign(payload),maxAge));send(200,{ok:true});
  }catch{send(400,{error:'请输入有效的账号和密码。'});}
  return true;
 }};
}
