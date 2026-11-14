import type { Furniture, StorageAdapter } from '../../domain';

export const BINDINGS_KEY = 'homie.sandbox.bindings.v1';
export const BINDABLE_OBJECTS: Record<string, string> = {
  living_room_light: 'light', bedroom_ac: 'air_conditioner',
  balcony_door: 'sensor', home_battery: 'home_battery',
};
export type Bindings = Record<string, string>;

/** Explicit, one-to-one links. No name/room guessing and no furniture migrations. */
export function readBindings(storage: StorageAdapter, furniture: readonly Furniture[]): Bindings {
  try {
    const data = JSON.parse(storage.getItem(BINDINGS_KEY) || 'null');
    if (!data || data.version !== 1 || data.template_id !== 'baseline_apartment' || !data.objects) return {};
    const used = new Set<string>();
    return Object.fromEntries(Object.entries(data.objects).filter(([objectId, furnitureId]) => {
      const item = furniture.find(item => item.id === furnitureId);
      if (!item || BINDABLE_OBJECTS[objectId] !== item.type || used.has(item.id)) return false;
      used.add(item.id); return true;
    })) as Bindings;
  } catch { return {}; }
}

export function saveBinding(storage: StorageAdapter, furniture: readonly Furniture[], bindings: Bindings, furnitureId: string, objectId: string): Bindings {
  const item = furniture.find(item => item.id === furnitureId);
  if (!item || (objectId && BINDABLE_OBJECTS[objectId] !== item.type)) throw new Error('无法关联此家具');
  if (objectId && bindings[objectId] && bindings[objectId] !== furnitureId) throw new Error('此模型对象已关联其他家具');
  const next = Object.fromEntries(Object.entries(bindings).filter(([, id]) => id !== furnitureId));
  if (objectId) next[objectId] = furnitureId;
  storage.setItem(BINDINGS_KEY, JSON.stringify({ version: 1, template_id: 'baseline_apartment', objects: next }));
  return next;
}
