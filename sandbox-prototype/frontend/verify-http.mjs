import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ProductStore,executionItems,trustedHistory} from './data-model.js';
import {HttpGateway} from './http-gateway.js';
const map=JSON.parse(await readFile(new URL('../house-modeling/releases/v0.1/object-map.actual.json',import.meta.url)));
const catalog=JSON.parse(await readFile(new URL('../backend/离家检查联调样例.json',import.meta.url)));
const reports=[];
async function run(name,fn){const store=new ProductStore(map,catalog.baseline_snapshot);const gateway=new HttpGateway(store,{session:'astra-http-'+name+'-'+crypto.randomUUID()});await gateway.reset({scenario:name,clock:'manual'});await fn(store,gateway);reports.push({name,passed:true,session:gateway.session,trace:gateway.trace});console.log('PASS',name);}
const plan=async(g,everyone=false)=>g.createPlan({intent:everyone?'全员离家':'猫留卧室',everyone});
const execute=async(s,g,ids=s.view().task.selected)=>g.execute({planVersion:s.view().task.plan.plan_version,selectedIds:ids});
await run('normal',async(s,g)=>{await plan(g);await g.manual('confirmed_closed');assert.equal(s.view().family.user_away,false);await g.userAway();assert.equal(s.view().family.occupancy,'occupied');await execute(s,g);assert.equal(s.view().objects.living_room_light.state,'on');await g.advance(700);await g.query();assert.equal(executionItems(s.view())[0].status,'confirmed');assert.equal(s.view().objects.living_room_light.state,'off');await g.reset();assert.equal(s.view().task,null);});
await run('normal',async(s,g)=>{await plan(g);await g.manual('deferred');await execute(s,g);assert.equal(s.view().task.manual_records[0].result,'deferred');await g.advance(700);await g.query();assert.equal(executionItems(s.view())[0].status,'confirmed');});
for(const scenario of ['balcony_offline','balcony_offline_no_history'])await run(scenario,async(s,g)=>{await plan(g);await g.refresh(['balcony_door'],false);assert.equal(s.view().objects.balcony_door.state,'unknown');assert.equal(!!trustedHistory(s.view().objects.balcony_door),scenario==='balcony_offline');});
await run('preconfirm_changed',async(s,g)=>{await plan(g);await assert.rejects(()=>execute(s,g),/409/);assert.equal(s.view().objects.living_room_light.state,'off');assert.equal(s.view().task.plan.plan_version,2);assert.equal(executionItems(s.view()).length,0);});
await run('readback_timeout',async(s,g)=>{await plan(g);await execute(s,g);await g.advance(2400);await g.query();assert.equal(executionItems(s.view())[0].status,'unknown');await g.refresh();assert.equal(executionItems(s.view())[0].status,'confirmed');});
await run('readback_timeout_retry',async(s,g)=>{await plan(g);await execute(s,g);await g.advance(2400);await g.query();await g.refresh();assert.ok(g.retryEligible.length);await g.retryFailed();assert.equal(executionItems(s.view())[0].status,'awaiting_readback');});
await run('partial_failure',async(s,g)=>{await plan(g,true);assert.deepEqual(s.view().task.selected,['item_living_room_light']);s.select('item_bedroom_ac',true);await execute(s,g);await g.advance(700);await g.query();assert.deepEqual(executionItems(s.view()).map(x=>x.status),['confirmed','failed']);assert.equal(s.view().objects.bedroom_ac.state,'on');});
await run('object_readback_first',async(s,g)=>{await plan(g);await execute(s,g);await g.advance(700);await g.refresh(['living_room_light'],false);assert.equal(s.view().objects.living_room_light.state,'off');assert.equal(executionItems(s.view())[0].status,'awaiting_readback');await g.advance(600);await g.query();assert.equal(executionItems(s.view())[0].status,'confirmed');});
await run('execution_confirmation_first',async(s,g)=>{await plan(g);await execute(s,g);await g.advance(700);await g.query();assert.equal(executionItems(s.view())[0].status,'confirmed');assert.equal(s.view().objects.living_room_light.state,'on');await g.advance(300);await g.refresh(['living_room_light'],false);assert.equal(s.view().objects.living_room_light.state,'unknown');await g.advance(500);await g.refresh(['living_room_light'],false);assert.equal(s.view().objects.living_room_light.state,'off');});
await run('normal',async(s,g)=>{await plan(g);await execute(s,g);const before=s.view();for(const step of catalog.scenarios.find(x=>x.id==='daily_excess').steps)await g.energy(step.request.body);assert.deepEqual(s.view().task,before.task);assert.deepEqual(s.view().objects,before.objects);assert.equal(s.view().energy.alerts[0].excess_kwh,2);});
await run('readback_timeout_retry',async(s,g)=>{
 await plan(g);await execute(s,g);await g.advance(2400);await g.query();await g.refresh();
 const real=g.fetcher;let lost=true;const submitted=[];
 g.fetcher=async(url,options)=>{const response=await real(url,options);if(options.method==='POST'&&url.endsWith('/executions')){submitted.push(JSON.parse(options.body).confirmation_id);if(lost){lost=false;throw new Error('lost response after server accepted');}}return response;};
 await assert.rejects(()=>g.retryFailed(),/连接失败/);await g.retryFailed();assert.equal(submitted.length,2);assert.equal(submitted[0],submitted[1]);assert.equal(executionItems(s.view())[0].status,'awaiting_readback');
});
await run('normal',async(s,g)=>{
 await plan(g);const before=s.view();const real=g.fetcher;g.fetcher=async()=>{throw new Error('offline')};
 await assert.rejects(()=>g.reset(),/连接失败/);assert.deepEqual(s.view(),before);g.fetcher=real;
 let release,held=false;const wait=new Promise(resolve=>release=resolve);let acquired;const ready=new Promise(resolve=>acquired=resolve);
 g.fetcher=async(url,options)=>{const response=await real(url,options);if(url.endsWith('/reset')&&!held){held=true;acquired();await wait;}return response;};
 const old=g.reset();await ready;await g.reset();const latest=s.view();release();await old;assert.deepEqual(s.view(),latest);
});
await writeFile(new URL('./qa/http-regression.json',import.meta.url),JSON.stringify({passed:reports.length,reports},null,2));
