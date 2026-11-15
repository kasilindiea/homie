import apartmentModel from '../../../sandbox-prototype/house-modeling/releases/v0.1/future-home-v0.1.glb?url';
import apartmentMap from '../../../sandbox-prototype/house-modeling/releases/v0.1/object-map.actual.json';
import twoBedroomModel from '../../../models/generic-two-bedroom/两房一厅.glb?url';
import twoBedroomMap from '../../../models/generic-two-bedroom/mobile-object-map.json';
import threeBedroomModel from '../../../models/generic-three-bedroom/三房两厅.glb?url';
import threeBedroomMap from '../../../models/generic-three-bedroom/mobile-object-map.json';
import type { SceneObjectDefinition, SceneTemplate } from './scene';

export type SandboxLayoutId = 'one_bedroom' | 'two_bedroom' | 'three_bedroom';
export interface SandboxTemplate extends SceneTemplate {
  layoutId: SandboxLayoutId;
  labelZh: string;
  labelEn: string;
  rooms: readonly SceneObjectDefinition[];
  devices: readonly SceneObjectDefinition[];
  bindableObjects: Readonly<Record<string, string>>;
}

const baselineBindings = {
  living_room_light: 'light', bedroom_ac: 'air_conditioner',
  balcony_door: 'sensor', home_battery: 'home_battery',
};
// Only categories that already exist in the furniture catalog can be linked.
// A manual door is not a smart lock; TV, washer and refrigerator remain scene
// objects until the application gains their own furniture categories.
const genericBindings = {
  living_room_light: 'light', dining_room_light: 'light', bedroom_ac: 'air_conditioner',
  balcony_door: 'sensor', living_room_curtain: 'cover',
};

function template(layoutId: SandboxLayoutId, labelZh: string, labelEn: string,
  templateId: string, modelUrl: string, map: SceneTemplate['map'], bindableObjects: Readonly<Record<string, string>>): SandboxTemplate {
  return { layoutId, labelZh, labelEn, templateId, modelUrl, map,
    rooms: map.objects.filter(object => object.object_type === 'room'),
    devices: map.objects.filter(object => object.object_type !== 'room'),
    bindableObjects: { ...bindableObjects },
  };
}

export const SANDBOX_TEMPLATES: readonly SandboxTemplate[] = [
  template('one_bedroom', '一房一厅', '1 bedroom · 1 living room', 'baseline_apartment', apartmentModel, apartmentMap, baselineBindings),
  template('two_bedroom', '两房一厅', '2 bedrooms · 1 living room', twoBedroomMap.template_id, twoBedroomModel, twoBedroomMap, genericBindings),
  template('three_bedroom', '三房两厅', '3 bedrooms · 2 living areas', threeBedroomMap.template_id, threeBedroomModel, threeBedroomMap, genericBindings),
];

export const getSandboxTemplate = (layoutId: string): SandboxTemplate =>
  SANDBOX_TEMPLATES.find(entry => entry.layoutId === layoutId) ?? SANDBOX_TEMPLATES[0];

const baselineEnglish: Record<string, string> = {
  entryway: 'Entryway', living_room: 'Living room', bedroom: 'Bedroom', balcony: 'Balcony',
  entry_door: 'Entry door', balcony_door: 'Balcony door sensor', living_room_light: 'Living room light',
  bedroom_ac: 'Bedroom AC', home_battery: 'Home battery',
};

export function templateObjectName(selectedTemplate: SandboxTemplate, id: string, locale: 'zh' | 'zh-CN' | 'en'): string {
  const object = selectedTemplate.map.objects.find(entry => entry.shared_id === id);
  if (!object) return id;
  return locale === 'en' ? object.display_name_en ?? baselineEnglish[id] ?? id : object.display_name ?? (id === 'home_battery' ? '家庭储能' : id);
}
