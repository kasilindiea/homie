import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const prefix = '/demo/leave-check';
const template = { template_id: 'baseline_apartment' };
const light = 'living_room_light';
const ac = 'bedroom_ac';
const door = 'balcony_door';
const samples = JSON.parse(readFileSync(new URL('./离家检查联调样例.json', import.meta.url), 'utf8'));
const scenarios = Object.fromEntries(samples.scenarios.map(scene => [scene.id, scene]));
const selected = ['item_' + light];

function client() {
  const session = randomUUID();
  async function request(method, route, body, status = 200) {
    const response = await fetch(base + route, {
      method, headers: { 'X-Demo-Session': session, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    assert.equal(data.demo_mode, true);
    return data;
  }

  const task = id => prefix + '/tasks/' + id;
  return {
    request,
    reset: (scenario = 'normal') =>
      request('POST', prefix + '/reset', { ...template, scenario, clock: 'manual' }),
    advance: ms => request('POST', prefix + '/debug/advance', { ...template, ms }),
    snapshot: (id, status = 200) =>
      request('GET', prefix + '/state?template_id=baseline_apartment' + (id ? '&task_id=' + id : ''), undefined, status),
    plan: (id, allAway = false) => {
      const input = allAway ? scenarios.everyone_away.steps[0] : scenarios.cat_home_baseline.steps[1];
      const { task_id, ...body } = input.request.body;
      return request('POST', prefix + '/plans', { ...body, ...(id ? { task_id: id } : {}) }, id ? 200 : 201);
    },
    manual: (id, result, object = 'entry_door', status = 200) =>
      request('PUT', task(id) + '/manual-records/' + object, { result }, status),
    away: id => request('PUT', task(id) + '/user-away', { user_away: true }),
    execute: (id, confirmation = 'confirm-light', version = 1, items = selected, status = 202) =>
      request('POST', task(id) + '/executions', {
        plan_version: version, confirmation_id: confirmation, selected_item_ids: items,
      }, status),
    poll: (id, execution, status = 200) =>
      request('GET', task(id) + '/executions/' + execution, undefined, status),
    refresh: (id, object_ids, execution) =>
      request('POST', prefix + '/state/refresh', {
        ...template, task_id: id, object_ids, ...(execution ? { execution_id: execution } : {}),
      }),
  };
}

test('猫留卧室，玄关稍后核实，本人出门与关灯回读相互独立', async () => {
  const c = client();
  const baseline = await c.reset();
  assert.equal(baseline.objects[light].state, 'on');
  assert.equal(baseline.user_away, false);
  const { task_id, plan } = await c.plan();
  assert.equal(plan.items.find(item => item.object_id === ac).group, 'keep');
  assert.equal(plan.items.find(item => item.object_id === light).selected, true);
  assert.equal((await c.manual(task_id, 'deferred')).objects.entry_door.state, 'unknown');
  const waiting = await c.execute(task_id);
  assert.equal(waiting.execution[0].status, 'awaiting_readback');
  assert.ok(!('objects' in waiting));
  const away = await c.away(task_id);
  assert.equal(away.user_away, true);
  assert.equal(away.occupancy, 'occupied');
  const checkpoint = await c.snapshot(task_id);
  assert.equal(checkpoint.manual_records[0].result, 'deferred');
  assert.equal(checkpoint.objects[light].state, 'on');
  await c.advance(700);
  const success = await c.poll(task_id, waiting.execution_id);
  assert.equal(success.execution[0].status, 'confirmed');
  assert.equal(success.execution[0].readback_at, success.objects[light].updated_at);
  assert.equal(success.objects[light].state, 'off');
  assert.equal(success.objects[light].power_state, 'powered');
});

test('人工见证只在任务内生效，重复提交不改证据时间', async () => {
  const c = client();
  const { task_id } = await c.plan();
  const other = await c.plan();
  const manual = await c.manual(task_id, 'confirmed_closed');
  assert.equal(manual.objects.entry_door.source, 'manual');
  assert.equal(manual.objects.entry_door.updated_at, manual.manual_records[0].confirmed_at);
  assert.equal((await c.manual(task_id, 'confirmed_closed')).manual_records[0].confirmed_at,
    manual.manual_records[0].confirmed_at);
  assert.equal((await c.snapshot(task_id)).user_away, false);
  assert.equal((await c.snapshot(other.task_id)).objects.entry_door.state, 'unknown');
  assert.equal((await c.manual(task_id, 'confirmed_closed', door, 422)).error.code, 'INVALID_MANUAL_RECORD');
});

test('确认前外部状态变化和旧版本均要求重审，拒绝提交产生零执行', async () => {
  const c = client();
  await c.reset('preconfirm_changed');
  const { task_id } = await c.plan();
  const changed = await c.execute(task_id, 'changed', 1, selected, 409);
  assert.equal(changed.error.code, 'RECONFIRM_REQUIRED');
  assert.equal(changed.plan.plan_version, 2);
  assert.equal(changed.objects[light].state, 'off');
  assert.equal(changed.affected_items[0].object_id, light);
  assert.deepEqual((await c.snapshot(task_id)).execution, []);
  assert.equal((await c.execute(task_id, 'stale', 1, selected, 409)).error.code, 'RECONFIRM_REQUIRED');
  assert.equal((await c.execute(task_id, 'invalid', 2, selected, 422)).error.code, 'INVALID_SELECTION');
});

test('并发重复确认复用执行，冲突确认与重复下发有独立错误', async () => {
  const c = client();
  await c.reset();
  const { task_id } = await c.plan();
  const [a, b] = await Promise.all([c.execute(task_id), c.execute(task_id)]);
  assert.equal(a.execution_id, b.execution_id);
  assert.equal(a.execution[0].command_sent_at, b.execution[0].command_sent_at);
  const conflict = await c.execute(task_id, 'confirm-light', 2, selected, 409);
  assert.equal(conflict.error.code, 'CONFIRMATION_CONFLICT');
  assert.equal((await c.execute(task_id, 'new-confirmation', 1, selected, 409)).error.code, 'ACTION_IN_PROGRESS');
  await c.advance(700);
  const repeated = await c.execute(task_id);
  assert.equal(repeated.execution[0].status, 'confirmed');
  assert.equal(repeated.execution_id, a.execution_id);
});

for (const scenario of ['readback_timeout', 'readback_timeout_retry']) {
  test(scenario + ' 先刷新，再确认原执行或显式重试', async () => {
    const c = client();
    await c.reset(scenario);
    const { task_id } = await c.plan();
    const { execution_id } = await c.execute(task_id);
    await c.advance(2400);
    const timedOut = await c.poll(task_id, execution_id);
    assert.equal(timedOut.execution[0].status, 'unknown');
    assert.equal(timedOut.objects[light].state, 'on');
    assert.equal((await c.execute(task_id, 'retry', 1, selected, 409)).error.code, 'REFRESH_REQUIRED');
    const refreshed = await c.refresh(task_id, [light], execution_id);
    if (scenario === 'readback_timeout') {
      assert.equal(refreshed.execution[0].status, 'confirmed');
      assert.equal(refreshed.objects[light].state, 'off');
      assert.deepEqual(refreshed.retry_eligible_item_ids, []);
    } else {
      assert.equal(refreshed.execution[0].status, 'unknown');
      assert.deepEqual(refreshed.retry_eligible_item_ids, selected);
      const retry = await c.execute(task_id, 'retry');
      assert.notEqual(retry.execution_id, execution_id);
      await c.advance(700);
      assert.equal((await c.poll(task_id, retry.execution_id)).execution[0].status, 'confirmed');
    }
  });
}

test('全员离家后显式选中空调，客厅灯成功与空调失败逐项返回', async () => {
  const c = client();
  await c.reset('partial_failure');
  const initial = await c.plan();
  const { task_id, plan } = await c.plan(initial.task_id, true);
  const acItem = plan.items.find(item => item.object_id === ac);
  assert.equal(acItem.group, 'action');
  assert.equal(acItem.selected, false);
  const { execution_id } = await c.execute(task_id, 'both', 2, [...selected, acItem.item_id]);
  await c.advance(700);
  const results = await c.poll(task_id, execution_id);
  assert.equal(results.execution.find(item => item.object_id === light).status, 'confirmed');
  assert.equal(results.execution.find(item => item.object_id === ac).error.code, 'DEVICE_REJECTED');
  assert.equal(results.objects[light].state, 'off');
  assert.equal(results.objects[ac].state, 'on');
});

test('对象读数先到，执行确认后到', async () => {
  const c = client();
  await c.reset('object_readback_first');
  const { task_id } = await c.plan();
  const { execution_id } = await c.execute(task_id);
  await c.advance(700);
  const object = await c.refresh(task_id, [light]);
  assert.equal(object.objects[light].state, 'off');
  assert.ok(!('execution' in object));
  const waiting = await c.poll(task_id, execution_id);
  assert.equal(waiting.execution[0].status, 'awaiting_readback');
  assert.ok(!('objects' in waiting));
  await c.advance(600);
  assert.equal((await c.poll(task_id, execution_id)).execution[0].status, 'confirmed');
});

test('执行确认先到，实况从亮灯到过期未知，再收到独立的关灯读数', async () => {
  const c = client();
  await c.reset('execution_confirmation_first');
  const { task_id } = await c.plan();
  const { execution_id } = await c.execute(task_id);
  await c.advance(700);
  const result = await c.poll(task_id, execution_id);
  assert.equal(result.execution[0].status, 'confirmed');
  assert.ok(!('objects' in result));
  assert.equal((await c.snapshot(task_id)).objects[light].state, 'on');
  await c.advance(300);
  const stale = (await c.refresh(task_id, [light])).objects[light];
  assert.equal(stale.availability, 'stale');
  assert.equal(stale.state, 'unknown');
  await c.advance(500);
  const object = await c.refresh(task_id, [light]);
  assert.equal(object.objects[light].state, 'off');
  assert.equal(object.objects[light].updated_at, result.execution[0].readback_at);
  assert.ok(!('execution' in object));
});

test('阳台刷新复用计划条目，缺行时只返回对象；离线历史分别核对', async () => {
  const options = [
    ['balcony_refresh_with_check', 'open', true, null],
    ['balcony_refresh_without_check', 'open', false, null],
    ['balcony_offline', 'unknown', true, 'sensor'],
    ['balcony_offline_no_history', 'unknown', true, null],
  ];
  for (const [scenario, state, withCheck, source] of options) {
    const c = client();
    await c.reset(scenario);
    const { task_id, plan } = await c.plan();
    const row = plan.items.find(item => item.object_id === door);
    assert.equal(Boolean(row), withCheck);
    const refresh = await c.refresh(task_id, [door]);
    assert.equal(refresh.objects[door].state, state);
    assert.equal(refresh.objects[door].last_known_source, source);
    assert.equal(refresh.checks?.[0]?.item_id, row?.item_id);
    assert.equal(plan.items.filter(item => item.group === 'action' && item.selected).length, 1);
    if (state === 'unknown') assert.equal(Boolean(refresh.objects[door].last_known_at), Boolean(source));
  }
});

test('能源达线和超额响应不覆盖正在等待的离家任务', async () => {
  const c = client();
  await c.reset();
  const { task_id } = await c.plan();
  const waiting = await c.execute(task_id);
  const [atLimit, exceeded] = scenarios.daily_excess.steps.map(step => step.request);
  const first = await c.request(atLimit.method, atLimit.path, atLimit.body);
  assert.equal(first.new_notice, false);
  const alert = await c.request(exceeded.method, exceeded.path, exceeded.body);
  assert.equal(alert.energy.alerts[0].excess_kwh, 2);
  assert.equal(alert.new_notice, true);
  const repeated = await c.request(exceeded.method, exceeded.path, exceeded.body);
  assert.equal(repeated.energy.alerts[0].alert_id, alert.energy.alerts[0].alert_id);
  assert.equal(repeated.new_notice, false);
  const preview = await c.request('POST', '/demo/energy/plans', {
    ...template, task_id, alert_ids: [alert.energy.alerts[0].alert_id], objective: 'reduce_consumption',
  }, 201);
  const authorization = await c.request('POST', '/demo/energy/authorization/check', {
    ...template, task_id: preview.task_id, plan_version: 1, selected_item_ids: selected,
    alert_ids: [alert.energy.alerts[0].alert_id], authorization_id: null,
  });
  assert.equal(authorization.allowed, false);
  for (const response of [first, alert, repeated, preview, authorization]) {
    assert.ok(!('objects' in response) && !('execution' in response));
  }
  const snapshot = await c.snapshot(task_id);
  assert.equal(snapshot.execution_id, waiting.execution_id);
  assert.equal(snapshot.execution[0].status, 'awaiting_readback');
  assert.equal(snapshot.objects[light].state, 'on');
  assert.deepEqual(snapshot.selected_item_ids, selected);
});

test('复位隔离会话，旧 ID 失效且旧动作不会污染基线', async () => {
  const c = client();
  const other = client();
  const otherTask = await other.plan();
  await c.reset();
  const { task_id } = await c.plan();
  const { execution_id } = await c.execute(task_id);
  const reset = await c.reset();
  await c.advance(3000);
  assert.equal((await c.snapshot()).objects[light].state, 'on');
  assert.deepEqual(reset.execution, []);
  assert.equal(reset.plan, null);
  await c.poll(task_id, execution_id, 404);
  assert.equal((await other.snapshot(otherTask.task_id)).plan.task_id, otherTask.task_id);
});
