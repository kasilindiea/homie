const UNITS = {
  instant_power_w: 'W', today_used_kwh: 'kWh', month_used_kwh: 'kWh',
  estimated_cost: 'CNY', soc_pct: '%', estimated_runtime_minutes: 'min',
};
const OBJECTIVES = ['reduce_consumption', 'reduce_grid_cost', 'extend_backup'];
const METER_SCOPES = ['household_consumption', 'grid_import'];
const SAMPLE_SOURCES = ['meter', 'storage', 'calculation', 'simulator'];
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

export class Energy {
  constructor(baseline, nextId) {
    this.state = structuredClone(baseline);
    this.nextId = nextId;
    this.previews = new Map();
    this.notices = new Set();
    this.lastSamples = new Map();
  }

  sample(body) {
    const { timezone, meter_scope: scope, month_days: days, monthly_limit_kwh: limit, measurements } = body;
    if (timezone !== 'Asia/Shanghai' || !METER_SCOPES.includes(scope) ||
        !Number.isInteger(days) || days < 28 || days > 31 || !Number.isFinite(limit) || limit <= 0 ||
        !measurements || typeof measurements !== 'object' || Array.isArray(measurements)) {
      throw this.error('INVALID_ENERGY_SAMPLE', '请提供有效的上海时区、口径、预算和能源读数。');
    }
    const entries = Object.entries(measurements);
    if (!entries.length || entries.some(([key, value]) => !this.validMeasurement(key, value))) {
      throw this.error('INVALID_ENERGY_SAMPLE', '能源指标的单位、数值或证据无效。');
    }

    const sameScope = scope === this.state.meter_scope;
    const sameBudget = sameScope && days === this.state.month_days && limit === this.state.monthly_limit_kwh;
    const next = structuredClone(this.state);
    if (!sameScope) {
      for (const key of ['instant_power_w', 'today_used_kwh', 'month_used_kwh', 'estimated_cost']) {
        this.clear(next.measurements[key]);
      }
    }
    next.timezone = timezone;
    next.meter_scope = scope;
    next.month_days = days;
    next.monthly_limit_kwh = limit;
    next.daily_reference_kwh = limit / days;
    next.alerts = sameBudget ? next.alerts : [];
    let newNotice = false;
    for (const [key, sample] of entries) {
      const seen = scope + ':' + key;
      const at = sample.updated_at ? Date.parse(sample.updated_at) : null;
      const previous = this.lastSamples.get(seen);
      if (at !== null && previous !== undefined && at < previous) continue;
      if (at !== null) this.lastSamples.set(seen, at);
      next.measurements[key] = structuredClone(sample);
      if (sample.availability !== 'online') {
        this.clear(next.measurements[key], sample.availability);
        continue;
      }
      if (key === 'today_used_kwh' && !Object.hasOwn(measurements, 'estimated_cost')) {
        this.clear(next.measurements.estimated_cost);
      }
      newNotice = this.updateAlert(next, key, sample) || newNotice;
    }
    this.state = next;
    return { energy: this.state, new_notice: newNotice };
  }

  clear(measurement, availability = 'stale') {
    Object.assign(measurement, { value: null, source: null, updated_at: null, availability });
  }

  validMeasurement(key, sample) {
    if (!Object.hasOwn(UNITS, key) || !sample || sample.unit !== UNITS[key] ||
        !['online', 'offline', 'stale'].includes(sample.availability) ||
        !['simulated', 'estimated'].includes(sample.data_kind)) return false;
    if (sample.data_kind === 'estimated' && (sample.basis_kind !== 'simulated' || !sample.assumptions)) return false;
    if (sample.availability !== 'online' && sample.value === null) return true;
    return Number.isFinite(sample.value) && sample.value >= 0 && (key !== 'soc_pct' || sample.value <= 100) &&
      SAMPLE_SOURCES.includes(sample.source) && timestamp(sample.updated_at);
  }

  updateAlert(state, key, sample) {
    if (!['today_used_kwh', 'month_used_kwh'].includes(key)) return false;
    const daily = key === 'today_used_kwh';
    const kind = daily ? 'daily_budget_exceeded' : 'monthly_budget_exceeded';
    const period = new Date(Date.parse(sample.updated_at) + 8 * 3600000).toISOString().slice(0, daily ? 10 : 7);
    const id = kind + ':' + state.meter_scope + ':' + period;
    const excess = Number((sample.value - (daily ? state.daily_reference_kwh : state.monthly_limit_kwh)).toFixed(6));
    state.alerts = state.alerts.filter(alert => alert.kind !== kind);
    if (excess <= 0) return false;
    state.alerts.push({
      alert_id: id, kind, excess_kwh: excess, object_ids: ['living_room_light'],
      message: daily ? '比今日参考线多用 ' + excess + ' kWh。' : '比本月上限多用 ' + excess + ' kWh。',
    });
    const fresh = !this.notices.has(id);
    this.notices.add(id);
    return fresh;
  }

  plan(body, plan) {
    if (!OBJECTIVES.includes(body.objective)) {
      throw this.error('INVALID_ENERGY_OBJECTIVE', '能源计划目标无效。');
    }
    if (!Array.isArray(body.alert_ids) || !body.alert_ids.length ||
        !body.alert_ids.every(id => this.state.alerts.some(alert => alert.alert_id === id))) {
      throw this.error('ALERT_NOT_FOUND', '能源提醒不存在或已失效。', 404);
    }
    const taskId = this.nextId();
    const targets = new Set(this.state.alerts.filter(alert => body.alert_ids.includes(alert.alert_id))
      .flatMap(alert => alert.object_ids));
    const items = plan.items.filter(item => item.group !== 'action' || targets.has(item.object_id))
      .map(item => ({ ...item, selected: false }));
    const preview = { task_id: taskId, plan_version: 1, items };
    this.previews.set(taskId, { plan: preview, alertIds: new Set(body.alert_ids) });
    return { task_id: taskId, plan: preview };
  }

  authorization(body) {
    const preview = this.previews.get(body.task_id);
    if (!preview) throw this.error('ENERGY_PLAN_NOT_FOUND', '能源预览不存在。', 404);
    const { plan, alertIds } = preview;
    if (!Array.isArray(body.alert_ids) || new Set(body.alert_ids).size !== alertIds.size ||
        !body.alert_ids.every(id => alertIds.has(id) && this.state.alerts.some(alert => alert.alert_id === id))) {
      throw this.error('ALERT_NOT_FOUND', '能源提醒不存在或已失效。', 404);
    }
    const { selected_item_ids: selected } = body;
    const actions = plan.items.filter(item => item.group === 'action');
    if (body.plan_version !== plan.plan_version || !Array.isArray(selected) ||
        new Set(selected).size !== selected.length ||
        !selected.every(id => actions.some(item => item.item_id === id))) {
      throw this.error('INVALID_SELECTION', '请选择当前预览中的有效动作。');
    }
    const code = 'AUTHORIZATION_REQUIRED';
    return {
      task_id: plan.task_id, allowed: false, mode: 'preview_only', reason_code: code,
      items: actions.filter(item => selected.includes(item.item_id)).map(item => ({
        item_id: item.item_id, object_id: item.object_id, allowed: false, reason_code: code,
      })),
    };
  }

  error(code, message, status = 422) {
    return new EnergyError(status, code, message);
  }
}

export class EnergyError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
