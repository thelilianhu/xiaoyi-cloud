import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scryptSync} from 'node:crypto';
test('browser login protects page and allows API without service token',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xiaoyi-login-'));const base='http://127.0.0.1:14391';
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:'14391',API_ACCESS_TOKEN:'test-api',MODEL_API_KEY:'test',MODEL_NAME:'test',TASK_STORE_PATH:join(dir,'tasks.json'),HARNESS_STORE_PATH:join(dir,'harness.json'),INBOX_STORE_PATH:join(dir,'inbox.json'),LOGIN_USERNAME:'test-user',LOGIN_PASSWORD_HASH:'salt:'+scryptSync('test-password','salt',64).toString('hex'),LOGIN_SESSION_SECRET:'test-signing-secret'}});
 try{
  await once(child.stdout,'data');
  assert.equal((await fetch(base+'/control',{redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/control/state')).status,401);
  assert.equal((await fetch(base+'/login')).status,200);
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({username:'test-user',password:'test-password'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/control',{headers:{Cookie:cookie},redirect:'manual'})).status,200);
  assert.equal((await fetch(base+'/control/state',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(base+'/control/state',{headers:{Authorization:'Bearer test-api'}})).status,200);
  assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
  const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:base}});assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 }finally{child.kill();await once(child,'exit');rmSync(dir,{recursive:true,force:true});}
});
