import { getLocale } from '../i18n';
import { sandboxEscape as escape } from './sandbox-copy';
import type { SceneObjectState } from './sandbox-runtime/session';

const tx = (zh: string, en: string) => getLocale() === 'en' ? en : zh;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Display normalized local sample readings; no transports or model assets. */
export function renderDeviceTelemetry(object: SceneObjectState, id: string): string {
  const rows: string[] = [];
  const labels: Record<string, [string, string]> = {
    cool: ['制冷', 'Cooling'], heat: ['制热', 'Heating'], auto: ['自动', 'Auto'],
    dry: ['除湿', 'Dry'], fan_only: ['送风', 'Fan only'], off: ['关闭', 'Off'],
    washing: ['洗涤', 'Washing'], rinsing: ['漂洗', 'Rinsing'], spinning: ['脱水', 'Spinning'],
    soaking: ['浸泡', 'Soaking'], drying: ['烘干', 'Drying'], idle: ['待机', 'Idle'], completed: ['已完成', 'Completed'],
    棉织物: ['棉织物', 'Cotton'], powered: ['通电', 'Powered'], unpowered: ['断电', 'Unpowered'],
  };
  const display = (value: unknown, unit = '') => {
    if (value === null || value === undefined || value === 'unknown') return tx('未知', 'Unknown');
    if (typeof value === 'number') return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value)}${unit}`;
    if (typeof value !== 'string') return tx('未知', 'Unknown');
    return labels[value] ? tx(...labels[value]) : value;
  };
  const row = (key: string, zh: string, en: string, value: unknown, unit = '') => {
    rows.push(`<div data-reading="${key}"><dt>${tx(zh, en)}</dt><dd>${escape(display(value, unit))}</dd></div>`);
  };
  if (id === 'bedroom_ac') {
    row('current_temperature_c', '当前室温', 'Room temperature', object.current_temperature_c, '°C');
    row('target_temperature_c', '设定温度', 'Target temperature', object.target_temperature_c, '°C');
    row('hvac_mode', '运行模式', 'Mode', object.hvac_mode);
  } else if (id === 'washing_machine') {
    row('program', '洗涤程序', 'Program', object.program);
    row('phase', '当前阶段', 'Phase', object.phase);
    row('remaining_minutes', '剩余时间', 'Time remaining', object.remaining_minutes, tx(' 分钟', ' min'));
    row('current_temperature_c', '实测水温', 'Water temperature', object.current_temperature_c, '°C');
    row('target_temperature_c', '设定水温', 'Target water temperature', object.target_temperature_c, '°C');
  } else if (id === 'kitchen_fridge') {
    const compartments = record(object.compartments);
    for (const [key, zh, en] of [['fridge', '冷藏室', 'Fridge'], ['freezer', '冷冻室', 'Freezer']]) {
      const zone = record(compartments[key]);
      row(key, zh, en, zone.current_temperature_c, '°C');
      row(`${key}_target`, `${zh}设定`, `${en} target`, zone.target_temperature_c, '°C');
    }
  } else if (id === 'living_room_curtain') {
    row('position_pct', '开启比例', 'Opening', object.position_pct, '%');
  }
  if (object.power_state !== undefined) row('power_state', '供电状态', 'Power', object.power_state);
  return rows.length ? `<dl class="sb-detail-readings sb-telemetry">${rows.join('')}</dl>` : '';
}
