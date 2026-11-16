import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {Readable} from 'node:stream';
import {createBrowserAuth} from './browser-auth.mjs';
const env={LOGIN_USERNAME:'test-user',LOGIN_PASSWORD_HASH:'test-salt:'+scryptSync('test-only-password','test-salt',64).toString('hex'),LOGIN_SESSION_SECRET:'test-only-session-secret'};
function req(url,body,cookie){return Object.assign(Readable.from(body?[JSON.stringify(body)]:[]),{url,method:body?'POST':'GET',headers:{cookie,'x-forwarded-proto':'https'},socket:{}})}
async function invoke(auth,request){const headers={};let result;await auth.handle(request,{setHeader:(k,v)=>headers[k]=v},(status,body)=>result={status,body});return {...result,headers};}
test('login issues private cookie; fresh browser needs login; session survives restart and expires',async()=>{
 let time=Date.now();const auth=createBrowserAuth(env,()=>time);
 assert.equal(auth.accepts(req('/control')),false);
 const bad=await invoke(auth,req('/auth/login',{username:'test-user',password:'wrong'}));assert.equal(bad.status,401);assert.equal(bad.headers['Set-Cookie'],undefined);
 const ok=await invoke(auth,req('/auth/login',{username:'test-user',password:'test-only-password'}));assert.equal(ok.status,200);
 const cookie=ok.headers['Set-Cookie'];assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.match(cookie,/; Secure/);assert.ok(!JSON.stringify(ok.body).includes('secret'));
 assert.equal(auth.accepts(req('/control',null,cookie)),true);
 assert.equal(createBrowserAuth(env,()=>time).accepts(req('/control',null,cookie)),true);
 assert.equal(auth.accepts(req('/control',null,cookie.replace('celia_session=','celia_session=x'))),false);
 time+=31*24*60*60*1000;assert.equal(auth.accepts(req('/control',null,cookie)),false);
});
test('logout expires cookie and excessive login attempts are limited',async()=>{
 const auth=createBrowserAuth(env);const out=await invoke(auth,req('/auth/logout',{}));assert.match(out.headers['Set-Cookie'],/Max-Age=0/);
 for(let i=0;i<12;i++)await invoke(auth,req('/auth/login',{username:'test-user',password:'wrong'}));
 assert.equal((await invoke(auth,req('/auth/login',{username:'test-user',password:'wrong'}))).status,429);
});
test('unconfigured login fails closed and does not accept fabricated cookies',async()=>{
 const auth=createBrowserAuth({});assert.equal(auth.accepts(req('/control',null,'celia_session=fake')),false);assert.equal((await invoke(auth,req('/auth/login',{}))).status,503);
});
