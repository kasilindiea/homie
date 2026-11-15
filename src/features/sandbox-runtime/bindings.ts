import type { Furniture, StorageAdapter } from '../../domain';

export const BINDINGS_KEY = 'homie.sandbox.bindings.v1';
export const BINDABLE_OBJECTS: Record<string, string> = {
  living_room_light: 'light', bedroom_ac: 'air_conditioner',
  balcony_door: 'sensor', home_battery: 'home_battery',
};
export type Bindings = Record<string, string>;
export interface BindingScope {
  templateId: string;
  bindableObjects: Readonly<Record<string, string>>;
}

const templateIds = new Set(['baseline_apartment', 'generic_two_bedroom', 'generic_three_bedroom']);
const baselineScope: BindingScope = { templateId: 'baseline_apartment', bindableObjects: BINDABLE_OBJECTS };
function resolveScope(scope: BindingScope = baselineScope) {
  if (!templateIds.has(scope.templateId)) throw new Error('未知户型，无法保存关联');
  return {
    ...scope,
    key: scope.templateId === 'baseline_apartment' ? BINDINGS_KEY : `${BINDINGS_KEY}.${scope.templateId}`,
  };
}

function validBindings(objects: unknown, furniture: readonly Furniture[], allowed: Readonly<Record<string, string>>): Bindings {
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return {};
  const used = new Set<string>();
  return Object.fromEntries(Object.entries(objects).filter(([objectId, furnitureId]) => {
    if (!Object.hasOwn(allowed, objectId) || typeof furnitureId !== 'string') return false;
    const item = furniture.find(entry => entry.id === furnitureId);
    if (!item || allowed[objectId] !== item.type || used.has(item.id)) return false;
    used.add(item.id); return true;
  }));
}

/** Explicit, one-to-one links within one template. The legacy baseline key is unchanged. */
export function readBindings(storage: StorageAdapter, furniture: readonly Furniture[], scope?: BindingScope): Bindings {
  try {
    const { key, templateId, bindableObjects } = resolveScope(scope);
    const data = JSON.parse(storage.getItem(key) || 'null');
    if (!data || data.version !== 1 || data.template_id !== templateId) return {};
    return validBindings(data.objects, furniture, bindableObjects);
  } catch { return {}; }
}

export function saveBinding(storage: StorageAdapter, furniture: readonly Furniture[], bindings: Bindings, furnitureId: string, objectId: string, scope?: BindingScope): Bindings {
  const { key, templateId, bindableObjects } = resolveScope(scope);
  const item = furniture.find(item => item.id === furnitureId);
  if (!item || (objectId && (!Object.hasOwn(bindableObjects, objectId) || bindableObjects[objectId] !== item.type))) throw new Error('无法关联此家具');
  const current = validBindings(bindings, furniture, bindableObjects);
  if (objectId && current[objectId] && current[objectId] !== furnitureId) throw new Error('此模型对象已关联其他家具');
  const next = Object.fromEntries(Object.entries(current).filter(([, id]) => id !== furnitureId));
  if (objectId) next[objectId] = furnitureId;
  storage.setItem(key, JSON.stringify({ version: 1, template_id: templateId, objects: next }));
  return next;
}
