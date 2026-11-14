/** Presentation-only examples, never device state and never persisted in the furniture store. */
export interface DemoReading {
  readonly source: 'demo';
  readonly mode: 'consumption' | 'charge' | 'generation' | 'not-applicable';
  readonly energyKwh: number | null;
  readonly powerW: number | null;
  readonly isOn: boolean | null;
  readonly batteryPercent?: number;
}

const reading = (energyKwh: number | null, powerW: number | null, isOn: boolean | null, mode: DemoReading['mode'] = 'consumption', batteryPercent?: number): Readonly<DemoReading> =>
  Object.freeze({ source: 'demo', mode, energyKwh, powerW, isOn, ...(batteryPercent === undefined ? {} : { batteryPercent }) });

const examples: Readonly<Record<string, Readonly<DemoReading>>> = Object.freeze({
  light: reading(0.12, 18, true),
  outlet: reading(0.72, 42, true),
  switch: reading(0.01, 0, false),
  air_conditioner: reading(4.8, 860, true),
  cover: reading(0.02, 0, false),
  fan: reading(0.21, 35, true),
  air_purifier: reading(0.36, 24, true),
  humidifier: reading(0.09, 18, true),
  vacuum: reading(0.06, 0, false, 'consumption', 78),
  lock: reading(null, null, true, 'consumption', 68),
  camera: reading(0.12, 5, true),
  sensor: reading(null, null, true, 'consumption', 86),
  water_heater: reading(3.2, 1200, true),
  home_battery: reading(4.6, 620, true, 'charge', 72),
  solar_panel: reading(6.4, 1180, true, 'generation'),
});
const noReading = reading(null, null, null, 'not-applicable');

export function getDemoReading(type: string): Readonly<DemoReading> {
  return Object.prototype.hasOwnProperty.call(examples, type) ? examples[type] : noReading;
}
