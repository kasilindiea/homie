import { getLocale } from '../i18n';
import { sandboxEscape as escape } from './sandbox-copy';
import { deviceTelemetry } from './sandbox-runtime/large-flat';
import type { SceneObjectDefinition } from './sandbox-runtime/scene';
import type { SceneObjectState } from './sandbox-runtime/session';

const en = () => getLocale() === 'en';
const names: Record<string, string> = {
  entryway: 'Entryway', living_room: 'Living room', bedroom: 'Main bedroom', balcony: 'Scenic balcony',
  dining_room: 'Dining room', kitchen: 'Kitchen', bedroom_guest: 'Guest bedroom',
  bedroom_secondary: 'Second bedroom', study: 'Study', hallway: 'Hallway',
  bathroom_ensuite: 'En suite', bathroom_shared: 'Shared bathroom', laundry_balcony: 'Laundry balcony',
  entry_door: 'Entry door', balcony_door: 'Scenic balcony door', living_room_light: 'Living room light',
  bedroom_ac: 'Main bedroom AC', washing_machine: 'Washing machine', kitchen_fridge: 'Refrigerator',
  dining_room_light: 'Dining room light', study_light: 'Study light', living_room_tv: 'Living room TV',
  living_room_curtain: 'Living room curtains', laundry_balcony_door: 'Laundry balcony door', home_battery: 'Home battery',
};
export const largeName = (definition: SceneObjectDefinition) => (en() ? names[definition.shared_id] : definition.display_name) ?? definition.shared_id;
const states: Record<string, [string, string]> = {
  on: ['开启', 'On'], off: ['关闭', 'Off'], open: ['打开', 'Open'], closed: ['已合上', 'Closed'],
  opening: ['打开中', 'Opening'], closing: ['关闭中', 'Closing'], stopped: ['停止', 'Stopped'],
  running: ['运行中', 'Running'], paused: ['已暂停', 'Paused'], completed: ['已完成', 'Completed'],
  idle: ['待机', 'Idle'], error: ['故障', 'Fault'], powered: ['通电', 'Powered'], unpowered: ['断电', 'Unpowered'],
  unknown: ['未知', 'Unknown'], offline: ['离线', 'Offline'], stale: ['读数过期', 'Stale'],
};
export const largeState = (state: string) => (states[state] ?? states.unknown)[en() ? 1 : 0];
export function largeSummary(record?: SceneObjectState) {
  if (!record) return largeState('unknown');
  if (record.availability === 'offline' || record.availability === 'stale') return `${largeState('unknown')} · ${largeState(record.availability)}`;
  const state = record.state ?? record.cycle_state ?? record.door_state ?? record.cover_state;
  if (typeof state === 'string') return largeState(state);
  return record.soc_pct == null ? largeState('unknown') : `${record.soc_pct}%`;
}

const fields: Record<string, string> = {
  program: 'Program', phase: 'Phase', remaining_minutes: 'Time remaining', current_temperature_c: 'Measured water temperature',
  target_temperature_c: 'Target temperature', timer_remaining_minutes: 'Off timer', hvac_mode: 'Mode', fridge: 'Fridge', freezer: 'Freezer',
};
const values: Record<string, string> = {
  未知: 'Unknown', 棉织物: 'Cotton', 洗涤: 'Washing', 漂洗: 'Rinsing', 脱水: 'Spinning', 浸泡: 'Soaking',
  烘干: 'Drying', 待机: 'Idle', 完成: 'Completed', 未设置: 'Not set', 制冷: 'Cooling', 制热: 'Heating',
  自动: 'Auto', 除湿: 'Dry', 送风: 'Fan only', 关闭: 'Off',
};
const sources: Record<string, [string, string]> = {
  device: ['设备', 'Device'], sensor: ['传感器', 'Sensor'], manual: ['人工', 'Manual'], simulator: ['模拟器', 'Simulator'],
};
export function largeReadings(record: SceneObjectState, definition: SceneObjectDefinition): string {
  const english = en();
  const translate = (value: string) => english ? (values[value] ?? value.replace('设定 ', 'Target ').replace('未知', 'Unknown').replace(' 分钟', ' min')) : value;
  const rows = deviceTelemetry(record, definition).map(row => {
    const label = english ? (definition.shared_id === 'bedroom_ac' && row.key === 'current_temperature_c' ? 'Room temperature' : fields[row.key]) : row.label;
    const status = ['offline', 'stale'].includes(row.availability) ? largeState(row.availability) : '';
    const source = row.source ? sources[row.source]?.[english ? 1 : 0] : '';
    const evidence = [status, row.updated_at && source, row.updated_at].filter(Boolean).join(' · ');
    const secondary = row.secondary ? `<small>${escape(translate(row.secondary))}</small>` : '';
    return `<div data-reading="${row.key}"><dt>${escape(label ?? row.label)}</dt><dd>${escape(translate(row.value))}</dd>${secondary}${evidence ? `<small>${escape(evidence)}</small>` : ''}</div>`;
  });
  const status = largeSummary(record);
  const source = record.source ? sources[record.source]?.[english ? 1 : 0] : '';
  const evidence = record.updated_at ? [source, record.updated_at].filter(Boolean).join(' · ') : (english ? 'No current reading timestamp' : '暂无有效读数时间');
  return `<p class="sb-object-state">${escape(status)}</p><p class="sb-source-label">${escape(evidence)}</p>
    ${typeof record.power_state === 'string' ? `<p>${english ? 'Power' : '供电'} · ${largeState(record.power_state)}</p>` : ''}
    ${rows.length ? `<dl class="sb-detail-readings sb-telemetry">${rows.join('')}</dl>` : ''}`;
}
