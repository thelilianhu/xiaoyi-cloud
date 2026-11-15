import {randomBytes} from 'node:crypto';
export function createLocalAccess(port) {
 const session=randomBytes(32).toString('hex');
 const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
 const local=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&origins.has('http://'+req.headers.host)&&(!req.headers.origin||origins.has(req.headers.origin))&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
 return {
  grant(req,res){if(local(req))res.setHeader('Set-Cookie',`celia_local=${session}; HttpOnly; SameSite=Strict; Path=/`);},
  accepts(req){return local(req)&&(req.headers.cookie||'').split(';').some(c=>c.trim()===`celia_local=${session}`);}
 };
}
