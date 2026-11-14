import { readFileSync } from 'node:fs';
import { Energy } from './energy.mjs';

const fixture = JSON.parse(readFileSync(new URL('./离家检查联调样例.json', import.meta.url), 'utf8'));
const baseline = fixture.baseline_snapshot;
export const TEMPLATE = baseline.template_id;
const ENTRY = 'entry_door';
const DOOR = 'balcony_door';
const LIGHT = 'living_room_light';
const AC = 'bedroom_ac';
const ROOMS = Object.keys(baseline.context.room_occupancy);
const OCCUPANCY = ['occupied', 'empty', 'unknown'];
const SCENARIOS = new Set([
  'normal', 'preconfirm_changed', 'readback_timeout', 'readback_timeout_retry',
  'partial_failure', 'object_readback_first', 'execution_confirmation_first',
  'balcony_offline', 'balcony_offline_no_history', 'balcony_refresh_with_check',
  'balcony_refresh_without_check',
]);
const CLOCK_START = Date.parse(baseline.context.simulation_now);
const READBACK_MS = 700;
const TIMEOUT_MS = 2400;

export class DemoError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

function check(condition, code, message) {
  if (!condition) throw new DemoError(422, code, message);
}

function isMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueList(value, allowed) {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every(item => allowed.includes(item));
}

function evidence(object) {
  return { source: object.source, updated_at: object.updated_at };
}

export class Demo {
  constructor(nextId) {
    this.nextId = nextId;
    this.generation = 0;
    this.reset({ template_id: TEMPLATE });
  }

  requireTemplate(template) {
    check(template === TEMPLATE, 'INVALID_TEMPLATE', '此模拟服务仅支持 baseline_apartment。');
  }

  time(ms = this.now()) {
    const display = new Date(ms + 8 * 3600000).toISOString();
    return display.replace('Z', '+08:00');
  }

  now() {
    const elapsed = this.clock === 'manual' ? 0 : Math.floor(performance.now() - this.startedAt);
    return CLOCK_START + this.elapsedOffset + elapsed;
  }

  reset(body) {
    this.requireTemplate(body.template_id);
    const scenario = body.scenario ?? 'normal';
    const clock = body.clock ?? 'realtime';
    check(SCENARIOS.has(scenario), 'INVALID_SCENARIO', '未知模拟场景。');
    check(['realtime', 'manual'].includes(clock), 'INVALID_CLOCK', '模拟时钟必须为 realtime 或 manual。');
    this.generation++;
    this.scenario = scenario;
    this.clock = clock;
    this.startedAt = performance.now();
    this.elapsedOffset = 0;
    this.objects = structuredClone(baseline.objects);
    this.tasks = new Map();
    this.energy = new Energy(baseline.energy, this.nextId);
    this.externalChangePending = scenario === 'preconfirm_changed';
    this.timeoutPending = ['readback_timeout', 'readback_timeout_retry'].includes(scenario);
    if (scenario === 'balcony_offline_no_history') this.offlineDoor(false);
    return this.snapshot(null);
  }

  snapshot(taskId) {
    const task = taskId === null ? null : this.task(taskId);
    this.tick();
    const executions = task ? [...task.executions.values()] : [];
    const latest = executions.at(-1);
    return {
      ...baseline,
      ...this.family(task),
      generation: this.generation,
      ...(task ? { task_id: task.id } : {}),
      ...(latest ? { execution_id: latest.id, selected_item_ids: latest.selected } : {}),
      objects: { ...this.objects, [ENTRY]: this.entryObject(task) },
      plan: task?.plan ?? null,
      manual_records: task ? [task.manual] : [],
      execution: latest?.items.map(item => item.result) ?? [],
      energy: this.energy.state,
    };
  }

  family(task) {
    return {
      user_away: task ? task.away : baseline.user_away,
      occupancy: task?.occupancy ?? baseline.occupancy,
      retain_room_ids: task?.retain ?? baseline.retain_room_ids,
      intent_text: task?.intent ?? baseline.intent_text,
      context: {
        ...baseline.context,
        simulation_now: this.time(),
        room_occupancy: task?.roomOccupancy ?? baseline.context.room_occupancy,
      },
    };
  }

  task(id) {
    const task = this.tasks.get(id);
    if (!task) throw new DemoError(404, 'TASK_NOT_FOUND', '离家任务不存在。');
    return task;
  }

  execution(task, id) {
    const execution = task.executions.get(id);
    if (!execution) throw new DemoError(404, 'EXECUTION_NOT_FOUND', '执行记录不存在。');
    return execution;
  }

  entryObject(task) {
    const object = this.objects[ENTRY];
    if (task?.manual.result === 'confirmed_closed') {
      return { ...object, state: 'closed', source: 'manual', updated_at: task.manual.confirmed_at };
    }
    return object;
  }

  plan(body) {
    this.requireTemplate(body.template_id);
    const { intent_text: intent, occupancy, retain_room_ids: retain, room_occupancy: rooms = {} } = body;
    check(typeof intent === 'string' && intent.trim(), 'INVALID_INTENT', '请提供离家意图。');
    check(OCCUPANCY.includes(occupancy), 'INVALID_OCCUPANCY', '未知留家状态。');
    check(uniqueList(retain, ROOMS), 'INVALID_ROOMS', '保留房间必须为有效且不重复的房间标识。');
    check(isMap(rooms) && Object.entries(rooms).every(([room, state]) =>
      ROOMS.includes(room) && OCCUPANCY.includes(state)), 'INVALID_ROOMS', '房间占用状态无效。');
    check(occupancy !== 'empty' || (!retain.length && !Object.values(rooms).includes('occupied')),
      'CONSTRAINT_CONFLICT', '全员离家与留家约束冲突。');
    this.tick();
    let task;
    if (body.task_id === undefined) {
      const id = this.nextId();
      task = {
        id, away: false, executions: new Map(), confirmations: new Map(),
        manual: { task_id: id, object_id: ENTRY, result: 'pending', confirmed_at: null },
      };
      this.tasks.set(id, task);
    } else {
      task = this.task(body.task_id);
    }
    Object.assign(task, { intent, occupancy, retain: [...retain].sort(), roomOccupancy: { ...rooms } });
    task.plan = this.buildPlan(task, (task.plan?.plan_version ?? 0) + 1);
    return {
      task_id: task.id, ...this.family(task), manual_records: [task.manual], plan: task.plan,
      ...(occupancy === 'unknown' ? { clarification: '请确认家中是否还有人或宠物。' } : {}),
    };
  }

  buildPlan(task, version) {
    const items = [this.deviceItem(task, LIGHT), this.deviceItem(task, AC), this.entryItem(task)];
    if (this.scenario !== 'balcony_refresh_without_check') items.push(this.doorItem());
    return { task_id: task.id, plan_version: version, items };
  }

  item(object, group, action, reason, target = null, selected = false) {
    return {
      item_id: 'item_' + object.object_id,
      object_id: object.object_id,
      group,
      current_state: object.state,
      target_state: target,
      action,
      reason,
      selected,
      evidence: evidence(object),
    };
  }

  deviceItem(task, id) {
    const object = this.objects[id];
    const isLight = id === LIGHT;
    const room = object.room_id;
    const roomEmpty = task.occupancy === 'empty' || task.roomOccupancy[room] === 'empty';
    if (task.retain.includes(room) || !roomEmpty || (!isLight && task.occupancy !== 'empty')) {
      return this.item(object, 'keep', 'none', '因留家或保留约束维持原状态。', object.state);
    }
    if (object.availability !== 'online' || !object.source || !object.updated_at || object.state === 'unknown') {
      return this.item(object, 'check', 'refresh', '设备状态未知，请先刷新。');
    }
    if (object.state === 'off') {
      return this.item(object, 'check', 'none', '已读到设备关闭，无需下发。');
    }
    if (object.power_state === 'unpowered' || !baseline.capabilities[id].allowed_actions.includes('turn_off')) {
      return this.item(object, 'check', 'none', '当前设备条件不允许切换。');
    }
    return this.item(object, 'action', 'turn_off',
      isLight ? '客厅无人，可关闭客厅灯。' : '全员离家且无保留条件，可关闭空调。', 'off', isLight);
  }

  entryItem(task) {
    const messages = {
      pending: '请在现场核实玄关门。',
      deferred: '玄关门稍后核实。',
      confirmed_closed: '住户已现场确认门关闭。',
    };
    return this.item(this.entryObject(task), 'manual', 'check_manually', messages[task.manual.result]);
  }

  doorItem() {
    const object = this.objects[DOOR];
    const messages = {
      closed: '阳台门已合上，证据来自门磁。',
      open: '阳台门开启，证据来自门磁。',
      unknown: '阳台门当前未知，可重新读取。',
    };
    return this.item(object, 'check', object.state === 'closed' ? 'none' : 'refresh', messages[object.state]);
  }

  manual(taskId, objectId, body) {
    const task = this.task(taskId);
    check(objectId === ENTRY && ['confirmed_closed', 'deferred'].includes(body.result),
      'INVALID_MANUAL_RECORD', '仅支持现场确认玄关门关闭或稍后核实。');
    if (task.manual.result !== body.result) {
      task.manual = {
        ...task.manual, result: body.result,
        confirmed_at: body.result === 'confirmed_closed' ? this.time() : null,
      };
      task.plan.items = task.plan.items.map(item => item.object_id === ENTRY ? this.entryItem(task) : item);
    }
    return { task_id: task.id, manual_records: [task.manual], objects: { [ENTRY]: this.entryObject(task) } };
  }

  away(taskId, body) {
    const task = this.task(taskId);
    check(body.user_away === true, 'INVALID_USER_AWAY', '请明确确认本人已出门。');
    task.away = true;
    return { task_id: task.id, user_away: task.away, occupancy: task.occupancy, retain_room_ids: task.retain };
  }

  execute(taskId, body) {
    const task = this.task(taskId);
    const { plan_version: version, confirmation_id: confirmation, selected_item_ids: selected } = body;
    check(Number.isSafeInteger(version) && version > 0 && typeof confirmation === 'string' &&
      confirmation.trim() && confirmation.length <= 128, 'INVALID_CONFIRMATION', '请提供计划版本和确认标识。');
    const selectable = ['item_' + LIGHT, 'item_' + AC];
    check(uniqueList(selected, selectable) && selected.length > 0,
      'INVALID_SELECTION', '请选择至少一个有效动作。');

    this.tick();
    const signature = JSON.stringify([version, [...selected].sort()]);
    const previous = task.confirmations.get(confirmation);
    if (previous) {
      if (previous.signature !== signature) {
        throw new DemoError(409, 'CONFIRMATION_CONFLICT', '确认标识已经用于不同的版本或选中项。');
      }
      return this.executionView(task, previous.execution);
    }
    if (version === task.plan.plan_version) {
      check(selected.every(id => task.plan.items.some(item => item.item_id === id && item.group === 'action')),
        'INVALID_SELECTION', '只能执行计划中已选的 action 条目。');
    }

    const current = this.buildPlan(task, task.plan.plan_version);
    if (this.externalChangePending && version === task.plan.plan_version && selected.includes('item_' + LIGHT)) {
      this.externalChangePending = false;
      this.observe(LIGHT, 'off', this.now());
      current.items[0] = this.deviceItem(task, LIGHT);
    }
    const affected = current.items.filter(item => selected.includes(item.item_id) &&
      (version !== task.plan.plan_version || !this.sameAction(item, task.plan.items.find(old => old.item_id === item.item_id))));
    if (affected.length) {
      if (version === task.plan.plan_version) {
        task.plan = { ...current, plan_version: current.plan_version + 1 };
      }
      throw new DemoError(409, 'RECONFIRM_REQUIRED', '计划或设备状态已变化，请复核受影响条目。', {
        task_id: task.id,
        plan: task.plan,
        affected_items: affected.map(item => ({
          item_id: item.item_id, object_id: item.object_id,
          reason_code: version === current.plan_version ? 'OBJECT_STATE_CHANGED' : 'PLAN_VERSION_CHANGED',
        })),
        objects: Object.fromEntries(affected.map(item => [item.object_id, this.objects[item.object_id]])),
      });
    }

    for (const otherTask of this.tasks.values()) {
      for (const run of otherTask.executions.values()) {
        for (const item of run.items) {
          if (!selected.includes(item.result.item_id)) continue;
          const pending = item.result.status === 'awaiting_readback' ||
            (item.result.status === 'confirmed' && !item.timeout && !item.published);
          const needsRefresh = item.result.status === 'unknown' && !item.retryAllowed;
          if (pending || needsRefresh) {
            const code = pending ? 'ACTION_IN_PROGRESS' : 'REFRESH_REQUIRED';
            throw new DemoError(409, code, '请查询或刷新原执行，核实后再决定是否重试。', {
              task_id: otherTask.id, execution_id: run.id,
            });
          }
        }
      }
    }

    const sentAt = this.now();
    const items = selected.map(id => this.startItem(current.items.find(item => item.item_id === id), sentAt));
    const execution = { id: this.nextId(), version, selected: [...selected], items };
    task.executions.set(execution.id, execution);
    task.confirmations.set(confirmation, { signature, execution });
    return this.executionView(task, execution);
  }

  sameAction(current, previous) {
    return previous && current.group === previous.group && current.action === previous.action &&
      current.current_state === previous.current_state && current.target_state === previous.target_state;
  }

  startItem(item, sentAt) {
    const id = item.object_id;
    const rejected = this.scenario === 'partial_failure' && id === AC;
    const timeout = this.timeoutPending && id === LIGHT;
    if (timeout) this.timeoutPending = false;
    const objectFirst = this.scenario === 'object_readback_first';
    const executionFirst = this.scenario === 'execution_confirmation_first';
    return {
      sentAt,
      evidenceAt: sentAt + READBACK_MS,
      confirmAt: sentAt + (objectFirst ? 1300 : READBACK_MS),
      publishAt: sentAt + (executionFirst ? 1500 : READBACK_MS),
      staleAt: executionFirst ? sentAt + 1000 : null,
      timeout,
      published: false,
      retryAllowed: false,
      result: {
        item_id: item.item_id, object_id: id, status: rejected ? 'failed' : 'awaiting_readback',
        command_accepted: !rejected, command_sent_at: this.time(sentAt),
        readback_state: null, readback_at: null,
        error: rejected ? { code: 'DEVICE_REJECTED', message: '模拟空调拒绝关机指令。' } : null,
      },
    };
  }

  tick() {
    const now = this.now();
    for (const task of this.tasks.values()) {
      for (const run of task.executions.values()) {
        for (const item of run.items) this.advanceItem(item, now);
      }
    }
  }

  advanceItem(item, now) {
    const result = item.result;
    if (!result.command_accepted) return;
    if (item.timeout) {
      if (result.status === 'awaiting_readback' && now >= item.sentAt + TIMEOUT_MS) {
        result.status = 'unknown';
        result.error = { code: 'READBACK_TIMEOUT', message: '结果待核实，请先刷新状态。' };
      }
      return;
    }
    if (result.status === 'awaiting_readback' && now >= item.confirmAt) {
      this.confirm(item, item.evidenceAt);
    }
    if (!item.published && now >= item.publishAt) {
      this.observe(result.object_id, 'off', item.evidenceAt, item.staled);
      item.published = true;
    } else if (item.staleAt && !item.staled && !item.published && now >= item.staleAt) {
      const current = this.objects[result.object_id];
      if (current.state === 'on' && Date.parse(current.updated_at) <= item.sentAt) {
        this.objects[result.object_id] = {
          ...current, state: 'unknown', power_state: 'unknown',
          availability: 'stale', source: null, updated_at: null,
        };
        item.staled = true;
      }
    }
  }

  confirm(item, at) {
    Object.assign(item.result, {
      status: 'confirmed', readback_state: 'off', readback_at: this.time(at), error: null,
    });
    item.retryAllowed = false;
  }

  observe(id, state, at, restorePower = false) {
    const object = this.objects[id];
    if (object.updated_at && Date.parse(object.updated_at) > at) return;
    this.objects[id] = {
      ...object, state, availability: 'online', source: id === DOOR ? 'sensor' : 'device', updated_at: this.time(at),
      ...(restorePower ? { power_state: baseline.objects[id].power_state } : {}),
      ...(id === AC && state === 'off' ? { hvac_mode: 'off' } : {}),
      ...(id === DOOR ? { last_known_state: null, last_known_at: null, last_known_source: null } : {}),
    };
  }

  readExecution(taskId, executionId) {
    const task = this.task(taskId);
    const execution = this.execution(task, executionId);
    this.tick();
    return this.executionView(task, execution, true);
  }

  executionView(task, execution, includeObjects = false) {
    const results = execution.items.map(item => item.result);
    const split = ['object_readback_first', 'execution_confirmation_first'].includes(this.scenario);
    return {
      task_id: task.id, execution_id: execution.id, plan_version: execution.version,
      selected_item_ids: execution.selected, execution: results,
      ...(includeObjects && !split ? {
        objects: Object.fromEntries(results.map(item => [item.object_id, this.objects[item.object_id]])),
      } : {}),
    };
  }

  refresh(body) {
    this.requireTemplate(body.template_id);
    const ids = body.object_ids;
    check(uniqueList(ids, Object.keys(this.objects)) && ids.length, 'INVALID_OBJECTS', '请提供有效的对象标识。');
    check(body.execution_id === undefined || typeof body.task_id === 'string',
      'EXECUTION_REQUIRES_TASK', '刷新执行回读时须同时提供 task_id。');
    const task = body.task_id === undefined ? null : this.task(body.task_id);
    const execution = body.execution_id === undefined ? null : this.execution(task, body.execution_id);
    this.tick();
    if (ids.includes(DOOR)) {
      if (this.scenario === 'balcony_offline') this.offlineDoor(true);
      if (['balcony_refresh_with_check', 'balcony_refresh_without_check'].includes(this.scenario)) {
        this.observe(DOOR, 'open', this.now());
      }
    }
    const checkRow = task && ids.includes(DOOR) && task.plan.items.some(row => row.object_id === DOOR);
    if (checkRow) {
      task.plan.items = task.plan.items.map(row => row.object_id === DOOR ? this.doorItem() : row);
    }
    if (execution) {
      for (const item of execution.items.filter(item => ids.includes(item.result.object_id))) {
        this.refreshItem(task, item);
      }
    }
    return {
      ...(execution ? this.executionView(task, execution) : {}),
      ...(execution ? {
        retry_eligible_item_ids: execution.items.filter(item => item.retryAllowed).map(item => item.result.item_id),
      } : {}),
      ...(checkRow ? { task_id: task.id, checks_plan_version: task.plan.plan_version,
        ...(!execution ? { plan_version: task.plan.plan_version } : {}), checks: [this.doorItem()] } : {}),
      objects: Object.fromEntries(ids.map(id => [id, id === ENTRY ? this.entryObject(task) : this.objects[id]])),
    };
  }

  refreshItem(task, item) {
    const result = item.result;
    if (result.status !== 'unknown' && result.status !== 'failed') return;
    const id = result.object_id;
    let object = this.objects[id];
    if (item.timeout && result.status === 'unknown' && object.state === 'on' && !item.retryAllowed) {
      const state = this.scenario === 'readback_timeout_retry' ? 'on' : 'off';
      this.observe(id, state, this.now());
      object = this.objects[id];
    }
    if (result.status === 'unknown' && object.state === 'off' && object.availability === 'online' &&
        Date.parse(object.updated_at) >= item.sentAt) {
      this.confirm(item, Date.parse(object.updated_at));
      return;
    }
    item.retryAllowed = this.deviceItem(task, id).group === 'action' &&
      (result.status === 'failed' || Date.parse(object.updated_at) >= item.sentAt);
    if (result.status === 'unknown' && item.retryAllowed) {
      Object.assign(result, {
        readback_state: object.state, readback_at: object.updated_at,
        error: { code: 'TARGET_NOT_OBSERVED', message: '刷新时灯仍亮，可复核后重新确认。' },
      });
    }
  }

  offlineDoor(withHistory) {
    const object = this.objects[DOOR];
    const fresh = withHistory && object.availability === 'online' && object.source === 'sensor' && object.updated_at;
    this.objects[DOOR] = {
      ...object, availability: 'offline', state: 'unknown', source: null, updated_at: null,
      last_known_state: fresh ? object.state : object.last_known_state ?? null,
      last_known_at: fresh ? object.updated_at : object.last_known_at ?? null,
      last_known_source: fresh ? object.source : object.last_known_source ?? null,
    };
  }

  advance(body) {
    this.requireTemplate(body.template_id);
    check(Number.isInteger(body.ms) && body.ms >= 0 && body.ms <= 60000,
      'INVALID_CLOCK_ADVANCE', '模拟时钟每次可推进 0–60000 毫秒。');
    this.elapsedOffset += body.ms;
    this.tick();
    return { simulation_now: this.time(), generation: this.generation };
  }

  sampleEnergy(body) {
    this.requireTemplate(body.template_id);
    return this.energy.sample(body);
  }

  energyPlan(body) {
    this.requireTemplate(body.template_id);
    this.tick();
    const task = this.task(body.task_id);
    return this.energy.plan(body, this.buildPlan(task, 1));
  }

  energyAuthorization(body) {
    this.requireTemplate(body.template_id);
    return this.energy.authorization(body);
  }
}
