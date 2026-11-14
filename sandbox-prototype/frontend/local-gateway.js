import { TEMPLATE, copy, currentState } from './data-model.js';

// In-memory simulator. No HTTP business calls, no viewer scenario injection.
// Methods return the v0.2 response envelope so a future transport can replace it.
export class LocalGateway {
  constructor(catalog, store) { this.catalog = catalog; this.store = store; this.sequence = 0; this.resetQueue(); }
  resetQueue() { this.queue = []; this.confirmations = new Map(); this.clock = Date.parse('2026-11-14T17:01:00+08:00'); }
  now(seconds=1) { this.clock += seconds*1000; return new Date(this.clock).toISOString(); }
  envelope(body, status=200) { return { http_status:status, body:{ template_id:TEMPLATE, demo_mode:true, ...body } }; }
  createPlan({ intent, everyone=false }) {
    const sample = this.catalog.scenarios.find(s => s.id === (everyone ? 'everyone_away' : 'cat_home_baseline'));
    const source = sample.steps.find(s => s.response?.body?.plan).response.body;
    const body = copy(source);
    const current = this.store.view();
    const taskId = current.task?.id ?? 'task_local_leave';
    body.task_id = taskId; body.plan.task_id = taskId;
    body.plan.plan_version = (current.task?.plan.plan_version ?? 0)+1;
    body.intent_text = intent;
    body.user_away = current.family.user_away;
    body.manual_records = current.task?.manual_records ?? [{task_id:taskId,object_id:'entry_door',result:'pending',confirmed_at:null}];
    for (const item of body.plan.items) {
      const object = current.objects[item.object_id];
      if (object) { item.current_state = object.state; item.evidence = {source:object.source,updated_at:object.updated_at}; }
      if (item.group === 'action' && currentState(object) !== 'on') Object.assign(item,{group:'check',selected:false,action:'none',target_state:null,reason:object.state === 'off' ? '设备已关闭，无需重复执行。' : '没有有效开启读数，先核实状态。'});
    }
    this.store.applyResponse(this.envelope(body,201),{kind:'task'});
  }
  manual(result) {
    if (!['confirmed_closed','deferred'].includes(result)) throw new Error('人工确认结果无效');
    const task = this.store.view().task;
    if (!task) throw new Error('请先查看离家计划');
    const previous = task.manual_records.find(r => r.object_id === 'entry_door');
    const at = result === 'confirmed_closed' ? (previous?.result === result ? previous.confirmed_at : this.now()) : null;
    this.store.applyResponse(this.envelope({ task_id:task.id, manual_records:[{ task_id:task.id, object_id:'entry_door', result, confirmed_at:at }], objects:{ entry_door:{object_id:'entry_door',room_id:'entryway',state:at?'closed':'unknown',source:at?'manual':null,updated_at:at,availability:'not_applicable'} } }),{kind:'task'});
  }
  userAway() {
    const task = this.store.view().task;
    if (!task) throw new Error('请先查看离家计划');
    this.store.applyResponse(this.envelope({task_id:task.id,user_away:true}),{kind:'task'});
  }
  execute({ planVersion, selectedIds, confirmationId, order='object-first' }) {
    const view = this.store.view(), task = view.task;
    if (!task || task.plan.plan_version !== planVersion) throw new Error('计划已变化，请重新查看计划');
    const signature = JSON.stringify([planVersion,[...selectedIds].sort()]);
    const cached = this.confirmations.get(confirmationId);
    if (cached) { if (cached.signature !== signature) throw new Error('同一确认不能提交不同内容'); return cached.response; }
    if (task.activeExecutionId) throw new Error('当前计划已提交，请查看逐项结果');
    const items = selectedIds.map(id => task.plan.items.find(i => i.item_id === id));
    if (!items.length || items.some(i => !i || i.group !== 'action')) throw new Error('请选择有效动作');
    for (const item of items) {
      if (currentState(view.objects[item.object_id]) !== 'on' || !view.capabilities[item.object_id]?.allowed_actions?.includes(item.action) || task.family.retain_room_ids.includes(view.objects[item.object_id].room_id)) throw new Error('相关状态或留家条件已变化，请重新查看计划');
    }
    const executionId = 'exec_local_'+(++this.sequence);
    const sent = this.now(60);
    const results = items.map(i => ({item_id:i.item_id,object_id:i.object_id,status:'awaiting_readback',command_accepted:true,command_sent_at:sent,readback_state:null,readback_at:null,error:null}));
    const response = this.envelope({task_id:task.id,execution_id:executionId,plan_version:planVersion,selected_item_ids:copy(selectedIds),execution:results},202);
    const generation = this.store.generation;
    this.store.applyResponse(response,{kind:'task',generation});
    const readAt = this.now(4);
    const objects = Object.fromEntries(items.map(i => [i.object_id,{object_id:i.object_id,room_id:view.objects[i.object_id].room_id,state:'off',power_state:'powered',availability:'online',source:'device',updated_at:readAt,last_known_state:null,last_known_source:null,last_known_at:null,last_known_values:null}]));
    const confirmed = this.envelope({task_id:task.id,execution_id:executionId,execution:results.map(r => ({...r,status:'confirmed',readback_state:'off',readback_at:readAt}))});
    const expired = Object.fromEntries(items.map(i => [i.object_id,{object_id:i.object_id,room_id:view.objects[i.object_id].room_id,state:'unknown',power_state:'unknown',availability:'stale',source:null,updated_at:null}]));
    const event = (label, body, kind) => ({label,response:body,context:{kind,generation}});
    this.queue = order === 'execution-first'
      ? [event('收到执行确认，设备读数待同步',confirmed,'task'),event('旧设备读数过期，当前状态未知',this.envelope({objects:expired}),'objects'),event('收到有效关闭读数，更新设备实况',this.envelope({objects}),'objects')]
      : [event('收到有效关闭读数，执行结果仍在等待',this.envelope({objects}),'objects'),event('收到执行确认，逐项结果更新',confirmed,'task')];
    this.confirmations.set(confirmationId,{signature,response});
    return response;
  }
  next() { const event = this.queue.shift(); if (event) this.store.applyResponse(event.response,event.context); return event?.label ?? '当前没有新的模拟响应'; }
  reset() { this.resetQueue(); this.store.applyResponse(this.envelope(copy(this.catalog.baseline_snapshot)),{kind:'reset'}); }
}
