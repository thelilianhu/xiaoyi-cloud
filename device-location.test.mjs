import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deviceLocation} from './device-location.mjs';
import {toolRegistry} from './harness/tools.mjs';
test('location tool returns only fresh location from this request',()=>{
 const current={available:true,latitude:28.2,longitude:112.9,accuracy:100,timestamp:Date.now(),city:'长沙'};
 const registry=toolRegistry({});const call={function:{name:'get_current_location',arguments:'{}'}};
 assert.equal(registry.execute(call,{location:current}).city,'长沙');
 assert.equal(registry.execute(call,{}).available,false);
 assert.equal(deviceLocation({...current,timestamp:Date.now()-600000}).available,false);
 assert.equal(deviceLocation({...current,latitude:999}).available,false);
 assert.equal(deviceLocation({available:false,reason:'denied'}).reason,'denied');
});
