import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ProductStore, currentState, executionItems, awaitingObject, trustedHistory } from '../data-model.js';
import { LocalGateway } from '../local-gateway.js';

const json = async file => JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
const catalog = await json('../../backend/离家检查联调样例.json');
const map = await json('../../house-modeling/releases/v0.1/object-map.actual.json');
const scenario = id => catalog.scenarios.find(s=>s.id===id);
const setup = () => new ProductStore(map,catalog.baseline_snapshot);
function step(store,s) {
  const path=s.request.path,taskId=path.match(/tasks\/([^/]+)/)?.[1];
  const kind=path.includes('/energy/')?'energy':path.includes('/reset')?'reset':s.request.method==='GET'&&path.includes('/state')?'snapshot':'task';
  store.applyResponse(s.response,{kind,taskId});
}
function start(store,id) {
  const s=scenario(id);if(s.starting_from)start(store,s.starting_from);
  for(const item of s.steps.filter(i=>!i.alternative_from))step(store,item);
}

test('v0.2 baseline preserves four groups, one action and cat constraint',()=>{
  const store=setup();start(store,'cat_home_baseline');const v=store.view();
  assert.equal(v.family.user_away,false);assert.equal(v.family.occupancy,'occupied');
  assert.deepEqual(v.task.selected,['item_living_room_light']);
  assert.equal(v.task.plan.items.find(i=>i.object_id==='bedroom_ac').group,'keep');
  assert.equal(v.task.plan.items.filter(i=>i.object_id==='balcony_door').length,1);
});
test('v0.2 manual closed and away are independent',()=>{
  const store=setup();start(store,'cat_home_baseline');
  step(store,scenario('entry_confirmed').steps[0]);
  assert.equal(store.view().family.user_away,false);
  assert.equal(currentState(store.view().objects.entry_door),'closed');
  step(store,scenario('entry_confirmed').steps[1]);
  assert.equal(store.view().family.user_away,true);
  assert.equal(store.view().family.occupancy,'occupied');
  assert.deepEqual(store.view().family.retain_room_ids,['bedroom']);
});
test('v0.2 deferred door does not block independent light execution',()=>{
  const store=setup();start(store,'entry_deferred');const v=store.view();
  assert.equal(v.task.manual_records[0].result,'deferred');
  assert.equal(currentState(v.objects.entry_door),'unknown');
  assert.equal(v.family.user_away,false);
  assert.equal(executionItems(v)[0].status,'awaiting_readback');
});
test('sample A: object off arrives before confirmed result',()=>{
  const store=setup();start(store,'awaiting_readback');
  step(store,scenario('object_readback_first').steps[0]);let v=store.view();
  assert.equal(currentState(v.objects.living_room_light),'off');
  assert.equal(executionItems(v)[0].status,'awaiting_readback');
  step(store,scenario('object_readback_first').steps[1]);v=store.view();
  assert.equal(executionItems(v)[0].status,'confirmed');
  assert.equal(awaitingObject(executionItems(v)[0],v.objects),false);
});
test('sample B: confirmation first, then stale unknown, then valid off',()=>{
  const store=setup();start(store,'awaiting_readback');
  const steps=scenario('execution_confirmation_first').steps;
  step(store,steps[0]);let v=store.view();
  assert.equal(currentState(v.objects.living_room_light),'on');
  assert.equal(executionItems(v)[0].status,'confirmed');
  assert.equal(awaitingObject(executionItems(v)[0],v.objects),true);
  step(store,steps[1]);v=store.view();
  assert.equal(currentState(v.objects.living_room_light),'unknown');
  assert.equal(executionItems(v)[0].status,'confirmed');
  assert.equal(awaitingObject(executionItems(v)[0],v.objects),true);
  step(store,steps[2]);v=store.view();
  assert.equal(currentState(v.objects.living_room_light),'off');
  assert.equal(awaitingObject(executionItems(v)[0],v.objects),false);
  assert.equal(v.objects.living_room_light.power_state,'powered');
});
test('energy updates during readback do not touch task, selection or objects',()=>{
  const store=setup();start(store,'awaiting_readback');const before=store.view();
  const energySteps=scenario('energy_during_readback').steps.filter(s=>s.request.path.includes('/energy/'));
  for(const s of energySteps)step(store,s);
  const after=store.view();assert.deepEqual(after.task,before.task);assert.deepEqual(after.objects,before.objects);
  assert.ok(after.energy.alerts.length>0);
});
test('unbound state snapshot cannot clear the current task',()=>{
  const store=setup();start(store,'awaiting_readback');const before=store.view().task;
  store.applyResponse(catalog.baseline_snapshot,{kind:'snapshot'});
  assert.deepEqual(store.view().task,before);
});
test('offline residual fields do not invent a historical reading',()=>{
  const store=setup();store.applyResponse({template_id:'baseline_apartment',demo_mode:true,objects:{balcony_door:{...catalog.baseline_snapshot.objects.balcony_door,availability:'offline'}}});
  const door=store.view().objects.balcony_door;
  assert.equal(door.state,'unknown');assert.equal(door.updated_at,null);assert.equal(door.source,null);assert.equal(trustedHistory(door),null);
});
test('explicit historical evidence is preserved as history only',()=>{
  const store=setup();store.applyResponse({template_id:'baseline_apartment',demo_mode:true,objects:{balcony_door:{state:'unknown',availability:'offline',source:null,updated_at:null,last_known_state:'closed',last_known_at:'2026-11-14T17:00:00+08:00',last_known_source:'sensor'}}});
  const door=store.view().objects.balcony_door;assert.equal(currentState(door),'unknown');assert.equal(trustedHistory(door).state,'closed');
});
test('newer independent object reading is not rolled back by a late response',()=>{
  const store=setup();start(store,'awaiting_readback');step(store,scenario('object_readback_first').steps[0]);
  store.applyResponse({template_id:'baseline_apartment',demo_mode:true,objects:{living_room_light:catalog.baseline_snapshot.objects.living_room_light}});
  assert.equal(currentState(store.view().objects.living_room_light),'off');
});
test('explicit reset ignores old-generation responses',()=>{
  const store=setup();start(store,'awaiting_readback');const old=store.generation;
  store.reset(catalog.baseline_snapshot);
  assert.equal(store.applyResponse(scenario('object_readback_first').steps[0].response,{generation:old}),false);
  assert.equal(store.view().task,null);assert.equal(currentState(store.view().objects.living_room_light),'on');
});
test('local gateway executes only selected actions; selection stays bound after submission',()=>{
  const store=setup(),gateway=new LocalGateway(catalog,store);gateway.createPlan({intent:'猫留卧室'});
  store.select('item_living_room_light',false);assert.deepEqual(store.view().task.selected,[]);
  store.select('item_living_room_light',true);
  gateway.manual('deferred');gateway.execute({planVersion:1,selectedIds:store.view().task.selected,confirmationId:'test'});
  store.select('item_living_room_light',false);assert.deepEqual(store.view().task.selected,['item_living_room_light']);
  gateway.next();assert.equal(currentState(store.view().objects.living_room_light),'off');assert.equal(executionItems(store.view())[0].status,'awaiting_readback');
  gateway.next();assert.equal(executionItems(store.view())[0].status,'confirmed');assert.equal(currentState(store.view().objects.bedroom_ac),'on');
  assert.equal(store.view().family.user_away,false);
});
test('local gateway uses the same boundary for execution-first and deduplicates confirmations',()=>{
  const store=setup(),gateway=new LocalGateway(catalog,store);gateway.createPlan({intent:'猫留卧室'});
  const input={planVersion:1,selectedIds:['item_living_room_light'],confirmationId:'test',order:'execution-first'};
  const response=gateway.execute(input);assert.deepEqual(gateway.execute(input),response);assert.equal(gateway.queue.length,3);
  gateway.next();assert.equal(currentState(store.view().objects.living_room_light),'on');assert.equal(executionItems(store.view())[0].status,'confirmed');
  gateway.next();assert.equal(currentState(store.view().objects.living_room_light),'unknown');
  gateway.next();assert.equal(currentState(store.view().objects.living_room_light),'off');
});
test('all away creates AC candidate unselected and away declaration remains separate',()=>{
  const store=setup(),gateway=new LocalGateway(catalog,store);gateway.createPlan({intent:'全员离家',everyone:true});
  const v=store.view();assert.equal(v.family.occupancy,'empty');assert.equal(v.family.user_away,false);
  assert.equal(v.task.plan.items.find(i=>i.object_id==='bedroom_ac').group,'action');assert.deepEqual(v.task.selected,['item_living_room_light']);
});
test('wrong template and non-demo payload rejected before application',()=>{
  const store=setup();const before=store.view();
  assert.throws(()=>store.applyResponse({template_id:'large_flat_128',demo_mode:true,objects:{}}));
  assert.throws(()=>store.applyResponse({template_id:'baseline_apartment',demo_mode:false,objects:{}}));
  assert.deepEqual(store.view(),before);
});
