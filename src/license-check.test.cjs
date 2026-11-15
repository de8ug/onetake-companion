const {test}=require('node:test');const assert=require('node:assert/strict');
const {checkProLicense}=require('./license-check.cjs');
const check=(status,data)=>checkProLicense(async()=>({status,ok:status>=200&&status<300,json:async()=>data}),'https://example.test/validate','synthetic');
test('only server-confirmed PRO passes',async()=>{
 assert.equal(await check(200,{valid:true,tier:'PRO'}),null);
 assert.equal((await check(200,{valid:true,tier:'FREE'})).code,'PRO_REQUIRED');
 assert.equal((await check(401,{valid:false,error:'INVALID_TOKEN'})).code,'PRO_SESSION_INVALID');
});
test('outage, throttle and malformed response do not tell valid members to reactivate',async()=>{
 assert.equal((await check(503,{})).code,'PRO_VALIDATION_UNAVAILABLE');
 assert.equal((await check(429,{})).code,'PRO_VALIDATION_BUSY');
 assert.equal((await check(404,{})).code,'PRO_VALIDATION_UNAVAILABLE');
 const network=await checkProLicense(async()=>{throw Error('secret token must not leak')},'https://example.test','synthetic');
 assert.equal(network.status,503);assert(!JSON.stringify(network).includes('secret'));
 const invalid=await checkProLicense(async()=>({status:200,ok:true,json:async()=>{throw Error('bad')}}),'https://example.test','synthetic');
 assert.equal(invalid.status,503);
});
