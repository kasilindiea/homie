import { DeviceStateStore, normalizeEnergy } from '../house-modeling/viewer/state-provider.js';

export const TEMPLATE = 'baseline_apartment';
export const copy = value => structuredClone(value);
const own = (o, key) => Object.hasOwn(o, key);
const validTime = time => typeof time === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(time) && Number.isFinite(Date.parse(time));
export const hasEvidence = o => !!o && validTime(o.updated_at) && (o.object_id === 'entry_door'
  ? o.availability === 'not_applicable' && o.source === 'manual'
  : o.availability === 'online' && ['sensor','device'].includes(o.source));
export const currentState = o => hasEvidence(o) ? o.state : 'unknown';

// A historical shape is not sufficient evidence: require its own source/time.
export function trustedHistory(o) {
  const state = o?.last_known_state ?? o?.last_known_values?.state;
  const source = o?.last_known_source;
  const allowed = o?.object_id?.includes('door') ? ['open','closed'] : ['on','off'];
  const expectedSource = o?.object_id === 'entry_door' ? 'manual' : o?.object_id === 'balcony_door' ? 'sensor' : 'device';
  return allowed.includes(state) && source === expectedSource && validTime(o.last_known_at)
    ? { state, source, at:o.last_known_at } : null;
}

export class ProductStore {
  constructor(map, snapshot) {
    this.map = map;
    this.templateId = map.template_id ?? TEMPLATE;
    if (typeof this.templateId !== 'string' || !this.templateId) throw new TypeError('模板标识无效');
    this.listeners = new Set();
    this.generation = 0;
    this.reset(snapshot);
  }
  reset(snapshot) {
    this.validateEnvelope(snapshot);
    this.generation++;
    this.tasks = new Map(); this.currentTaskId = null;
    this.acceptedTimes = new Map();
    this.family = { user_away:snapshot.user_away ?? null, occupancy:snapshot.occupancy ?? 'unknown', retain_room_ids:copy(snapshot.retain_room_ids || []) };
    this.energy = normalizeEnergy(snapshot.energy);
    this.capabilities = copy(snapshot.capabilities || {});
    this.devices = new DeviceStateStore({ templateId:this.templateId, objectDefinitions:this.map.objects, initialSnapshot:{ template_id:this.templateId, demo_mode:true, objects:this.prepareObjects(snapshot.objects, false) } });
    if (snapshot.plan) this.applyTask(snapshot, snapshot.plan.task_id);
    this.emit();
  }
  validateEnvelope(body) {
    if (body.template_id !== this.templateId) throw new TypeError('模板不匹配，响应未应用');
    if (body.demo_mode !== true) throw new TypeError('本地演示仅接受 demo_mode=true');
  }
  prepareObjects(input, incremental = true) {
    const out = {};
    const previous = incremental ? this.devices.getSnapshot().objects : {};
    for (const [id, raw] of Object.entries(input || {})) {
      if (!this.map.objects.some(o => o.shared_id === id && o.object_type !== 'room')) throw new TypeError('未知对象：' + id);
      const value = copy(raw);
      const expectedSource = id === 'entry_door' ? 'manual' : id === 'balcony_door' ? 'sensor' : 'device';
      if (value.source && !['offline','stale'].includes(value.availability) && value.source !== expectedSource) throw new TypeError('对象证据来源不匹配：'+id);
      if (hasEvidence({ ...previous[id], ...value, object_id:id })) {
        const time = Date.parse(value.updated_at ?? previous[id]?.updated_at);
        if (time < (this.acceptedTimes.get(id) ?? -Infinity)) continue;
        this.acceptedTimes.set(id, time);
      }
      if (['offline','stale'].includes(value.availability)) {
        // Neutralize invalid residual values BEFORE the delivered provider sees them.
        const history = trustedHistory({ ...value, object_id:id });
        value.state = 'unknown'; value.source = null; value.updated_at = null;
        value.power_state = 'unknown';
        if (id === 'bedroom_ac') Object.assign(value, { current_temperature_c:null, target_temperature_c:null, timer_remaining_minutes:null, hvac_mode:'unknown', timer_state:'unknown', field_meta:{} });
        value.last_known_state = history?.state ?? null;
        value.last_known_at = history?.at ?? null;
        value.last_known_source = history?.source ?? null;
        value.last_known_values = null;
      }
      out[id] = value;
    }
    return out;
  }
  applyResponse(response, context = {}) {
    if (context.generation !== undefined && context.generation !== this.generation) return false;
    const body = response.body ?? response;
    this.validateEnvelope(body);
    if ((response.http_status ?? 200) >= 400 && !body.plan) throw new Error(body.error?.message || '请求未完成');
    if (context.kind === 'reset') { this.reset(body); return true; }
    // Deliberately separate object projection from all task and energy fields.
    if (body.objects) {
      const objects = this.prepareObjects(body.objects);
      if (context.kind === 'snapshot') {
        const preserved = this.devices.getSnapshot().objects;
        // A late read must not roll back a newer accepted reading.
        for (const id of Object.keys(body.objects)) if (!own(objects,id)) objects[id] = preserved[id];
        this.devices.replaceSnapshot({ template_id:this.templateId, demo_mode:true, objects });
      } else this.devices.patchObjects({ template_id:this.templateId, objects });
    }
    if (own(body,'energy')) this.energy = normalizeEnergy(body.energy);
    if (body.capabilities) this.capabilities = { ...this.capabilities, ...copy(body.capabilities) };
    const taskId = body.task_id ?? body.plan?.task_id ?? context.taskId;
    if (context.kind !== 'energy' && taskId) this.applyTask(body, taskId, context);
    if (context.kind === 'snapshot' && !this.currentTaskId) {
      for (const key of ['user_away','occupancy','retain_room_ids']) if (own(body,key)) this.family[key] = copy(body[key]);
    }
    this.emit(); return true;
  }
  applyTask(body, taskId, context = {}) {
    let task = this.tasks.get(taskId);
    if (!task) {
      if (!body.plan) return;
      task = { id:taskId, plan:null, intent_text:'', context:{}, selected:[], manual_records:[], checks:[], executions:{}, activeExecutionId:null, family:copy(this.family), affected:[] };
      this.tasks.set(taskId,task);
    }
    if (body.plan && (!task.plan || body.plan.plan_version >= task.plan.plan_version)) {
      const previous = task.plan;
      task.plan = copy(body.plan);
      task.selected = task.plan.items.filter(item => item.group === 'action' && (previous?.items.some(p => p.item_id === item.item_id && p.group === 'action') ? task.selected.includes(item.item_id) : item.selected)).map(item => item.item_id);
      if (context.activate !== false) this.currentTaskId = taskId;
    }
    for (const key of ['user_away','occupancy','retain_room_ids']) if (own(body,key)) task.family[key] = copy(body[key]);
    for (const key of ['intent_text','context']) if (own(body,key)) task[key] = copy(body[key]);
    if (body.manual_records) {
      for (const record of body.manual_records.filter(r => r.task_id === taskId)) {
        task.manual_records = task.manual_records.filter(r => r.object_id !== record.object_id).concat(copy(record));
      }
    }
    if (body.checks) for (const check of body.checks) {
      if (task.plan?.items.some(p => p.item_id === check.item_id && p.object_id === check.object_id && p.group === 'check') && (!(body.checks_plan_version??body.plan_version) || (body.checks_plan_version??body.plan_version) === task.plan.plan_version)) {
        task.checks = task.checks.filter(c => c.item_id !== check.item_id).concat(copy(check));
      }
    }
    const executionId = body.execution_id ?? context.executionId;
    if (executionId && Array.isArray(body.execution)) {
      const record = task.executions[executionId] ?? { id:executionId, selected:copy(body.selected_item_ids ?? task.selected), items:[] };
      for (const item of body.execution) {
        if (!task.plan?.items.some(p => p.item_id === item.item_id && p.object_id === item.object_id)) continue;
        const old = record.items.find(i => i.item_id === item.item_id);
        if (old?.status === 'confirmed' && item.status !== 'confirmed') continue;
        record.items = record.items.filter(i => i.item_id !== item.item_id).concat(copy(item));
      }
      task.executions[executionId] = record;
      task.activeExecutionId = executionId;
      task.selected = copy(record.selected);
    }
    if (body.affected_items) task.affected = copy(body.affected_items);
    if (taskId === this.currentTaskId) this.family = copy(task.family);
  }
  select(itemId, checked) {
    const task = this.tasks.get(this.currentTaskId);
    if (!task || task.activeExecutionId || !task.plan.items.some(i => i.item_id === itemId && i.group === 'action')) return;
    task.selected = checked ? [...new Set([...task.selected,itemId])] : task.selected.filter(id => id !== itemId);
    this.emit();
  }
  view() {
    const task = this.tasks.get(this.currentTaskId);
    return copy({ generation:this.generation, objects:this.devices.getSnapshot().objects, task:task ?? null, family:this.family, energy:this.energy, capabilities:this.capabilities });
  }
  subscribe(fn) { this.listeners.add(fn); fn(this.view()); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.view()); }
}

export function executionItems(view) { return view.task?.executions[view.task.activeExecutionId]?.items ?? []; }
export function awaitingObject(item, objects) {
  if (item.status !== 'confirmed') return false;
  const object = objects[item.object_id];
  return !hasEvidence(object) || !validTime(item.readback_at) || Date.parse(object.updated_at) < Date.parse(item.readback_at);
}

