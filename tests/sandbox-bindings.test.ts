import { describe, expect, it } from 'vitest';
import type { Furniture, StorageAdapter } from '../src/domain';
import { BINDINGS_KEY, readBindings, saveBinding, type BindingScope } from '../src/features/sandbox-runtime/bindings';

const furniture: Furniture[] = [
  { id: 'lamp-a', name: 'Light A', type: 'light' },
  { id: 'lamp-b', name: 'Light B', type: 'light' },
  { id: 'battery', name: 'Storage', type: 'home_battery' },
  { id: 'solar', name: 'Solar', type: 'solar_panel' },
].map((item) => ({ ...item, room: '客厅', model: '', notes: '', createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' })) as Furniture[];

function storageWith(objects: unknown = {}) {
  const values = new Map([
    ['homing.app.v1', 'original household data'],
    [BINDINGS_KEY, JSON.stringify({ version: 1, template_id: 'baseline_apartment', objects })],
  ]);
  const writes: string[] = [];
  const storage: StorageAdapter = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) { writes.push(key); values.set(key, value); },
  };
  return { values, writes, storage };
}

const genericObjects = {
  living_room_light: 'light', dining_room_light: 'light', bedroom_ac: 'air_conditioner',
  balcony_door: 'sensor', living_room_curtain: 'cover',
};
const twoBedroom: BindingScope = { templateId: 'generic_two_bedroom', bindableObjects: genericObjects };
const threeBedroom: BindingScope = { templateId: 'generic_three_bedroom', bindableObjects: genericObjects };
const scopeKey = (scope: BindingScope) => `${BINDINGS_KEY}.${scope.templateId}`;

describe('explicit furniture-to-scene bindings', () => {
  it('stores and removes a link separately without changing household data', () => {
    const { storage, values, writes } = storageWith();
    const before = JSON.stringify(furniture);
    const linked = saveBinding(storage, furniture, {}, 'lamp-a', 'living_room_light');
    expect(readBindings(storage, furniture)).toEqual({ living_room_light: 'lamp-a' });
    expect(saveBinding(storage, furniture, linked, 'lamp-a', '')).toEqual({});
    expect(readBindings(storage, furniture)).toEqual({});
    expect(writes).toEqual([BINDINGS_KEY, BINDINGS_KEY]);
    expect(values.get('homing.app.v1')).toBe('original household data');
    expect(JSON.stringify(furniture)).toBe(before);
  });

  it('rejects type mismatches, missing furniture and a model object already linked elsewhere', () => {
    const { storage, writes } = storageWith({ living_room_light: 'lamp-a' });
    const bindings = readBindings(storage, furniture);
    expect(() => saveBinding(storage, furniture, bindings, 'lamp-b', 'living_room_light')).toThrow();
    expect(() => saveBinding(storage, furniture, bindings, 'solar', 'home_battery')).toThrow();
    expect(() => saveBinding(storage, furniture, bindings, 'missing', 'living_room_light')).toThrow();
    expect(() => saveBinding(storage, furniture, bindings, 'lamp-a', 'entry_door')).toThrow();
    expect(writes).toEqual([]);
    expect(readBindings(storage, furniture)).toEqual({ living_room_light: 'lamp-a' });
  });

  it('ignores deleted records, wrong types and unknown objects without rewriting storage', () => {
    const { storage, writes } = storageWith({
      living_room_light: 'deleted-light', bedroom_ac: 'lamp-a', home_battery: 'battery',
      solar_panel: 'solar', entry_door: 'lamp-b', unknown: 'battery',
    });
    expect(readBindings(storage, furniture)).toEqual({ home_battery: 'battery' });
    expect(writes).toEqual([]);
  });

  it('leaves the previous binding untouched when storage rejects the write', () => {
    const { storage } = storageWith({ living_room_light: 'lamp-a' });
    const bindings = readBindings(storage, furniture);
    storage.setItem = () => { throw new Error('Storage full'); };
    expect(() => saveBinding(storage, furniture, bindings, 'lamp-a', '')).toThrow('Storage full');
    expect(bindings).toEqual({ living_room_light: 'lamp-a' });
    expect(readBindings(storage, furniture)).toEqual(bindings);
  });

  it('treats corrupt, foreign-template or inaccessible bindings as absent without deleting them', () => {
    const { storage, values, writes } = storageWith();
    for (const raw of ['invalid JSON', JSON.stringify({ version: 1, template_id: 'other', objects: { living_room_light: 'lamp-a' } })]) {
      values.set(BINDINGS_KEY, raw);
      expect(readBindings(storage, furniture)).toEqual({});
      expect(values.get(BINDINGS_KEY)).toBe(raw);
    }
    storage.getItem = () => { throw new Error('Storage unavailable'); };
    expect(readBindings(storage, furniture)).toEqual({});
    expect(writes).toEqual([]);
  });

  it('keeps links to the same furniture independent across all three templates', () => {
    const { storage, values, writes } = storageWith({ living_room_light: 'lamp-a' });
    const originalLegacy = values.get(BINDINGS_KEY);
    const originalFurniture = JSON.stringify(furniture);
    expect(readBindings(storage, furniture, twoBedroom)).toEqual({});
    expect(readBindings(storage, furniture, threeBedroom)).toEqual({});

    const twoLinks = saveBinding(storage, furniture, {}, 'lamp-a', 'living_room_light', twoBedroom);
    const threeLinks = saveBinding(storage, furniture, {}, 'lamp-a', 'dining_room_light', threeBedroom);
    expect(readBindings(storage, furniture, twoBedroom)).toEqual(twoLinks);
    expect(readBindings(storage, furniture, threeBedroom)).toEqual(threeLinks);
    expect(readBindings(storage, furniture)).toEqual({ living_room_light: 'lamp-a' });
    expect(JSON.parse(values.get(scopeKey(twoBedroom))!)).toEqual({ version: 1, template_id: twoBedroom.templateId, objects: twoLinks });
    expect(JSON.parse(values.get(scopeKey(threeBedroom))!)).toEqual({ version: 1, template_id: threeBedroom.templateId, objects: threeLinks });

    expect(saveBinding(storage, furniture, twoLinks, 'lamp-a', '', twoBedroom)).toEqual({});
    expect(readBindings(storage, furniture, twoBedroom)).toEqual({});
    expect(readBindings(storage, furniture, threeBedroom)).toEqual(threeLinks);
    expect(values.get(BINDINGS_KEY)).toBe(originalLegacy);
    expect(values.get('homing.app.v1')).toBe('original household data');
    expect(JSON.stringify(furniture)).toBe(originalFurniture);
    expect(writes).toEqual([scopeKey(twoBedroom), scopeKey(threeBedroom), scopeKey(twoBedroom)]);
  });

  it('enforces one-to-one links inside a template without affecting another template', () => {
    const { storage, values, writes } = storageWith({ living_room_light: 'lamp-b' });
    let links = saveBinding(storage, furniture, {}, 'lamp-a', 'living_room_light', twoBedroom);
    links = saveBinding(storage, furniture, links, 'lamp-a', 'dining_room_light', twoBedroom);
    expect(links).toEqual({ dining_room_light: 'lamp-a' });
    expect(readBindings(storage, furniture, twoBedroom)).toEqual(links);
    const saved = values.get(scopeKey(twoBedroom));
    writes.length = 0;
    expect(() => saveBinding(storage, furniture, links, 'lamp-b', 'dining_room_light', twoBedroom)).toThrow();
    expect(() => saveBinding(storage, furniture, links, 'battery', 'home_battery', twoBedroom)).toThrow();
    expect(() => saveBinding(storage, furniture, links, 'lamp-a', 'bedroom_ac', twoBedroom)).toThrow();
    expect(() => saveBinding(storage, furniture, links, 'lamp-a', 'entry_door', twoBedroom)).toThrow();
    expect(() => saveBinding(storage, furniture, links, 'lamp-a', 'constructor', twoBedroom)).toThrow();
    expect(writes).toEqual([]);
    expect(values.get(scopeKey(twoBedroom))).toBe(saved);
    expect(readBindings(storage, furniture)).toEqual({ living_room_light: 'lamp-b' });
  });

  it('does not read a foreign envelope or malformed objects from a template-specific key', () => {
    const { storage, values, writes } = storageWith({ living_room_light: 'lamp-a' });
    const foreign = JSON.stringify({ version: 1, template_id: threeBedroom.templateId, objects: { living_room_light: 'lamp-b' } });
    values.set(scopeKey(twoBedroom), foreign);
    expect(readBindings(storage, furniture, twoBedroom)).toEqual({});
    expect(values.get(scopeKey(twoBedroom))).toBe(foreign);
    for (const objects of [null, [], 'invalid']) {
      values.set(scopeKey(twoBedroom), JSON.stringify({ version: 1, template_id: twoBedroom.templateId, objects }));
      expect(readBindings(storage, furniture, twoBedroom)).toEqual({});
    }
    values.set(scopeKey(twoBedroom), JSON.stringify({ version: 1, template_id: twoBedroom.templateId, objects: {
      living_room_light: 'lamp-a', dining_room_light: 'lamp-a', bedroom_ac: 'lamp-b',
      living_room_curtain: 'deleted', home_battery: 'battery', entry_door: 'lamp-b',
    } }));
    expect(readBindings(storage, furniture, twoBedroom)).toEqual({ living_room_light: 'lamp-a' });
    expect(readBindings(storage, furniture)).toEqual({ living_room_light: 'lamp-a' });
    expect(writes).toEqual([]);
  });

  it('rejects unknown template IDs instead of writing arbitrary storage keys', () => {
    const { storage, writes } = storageWith();
    const unsupported = { templateId: 'other_template', bindableObjects: genericObjects };
    expect(readBindings(storage, furniture, unsupported)).toEqual({});
    expect(() => saveBinding(storage, furniture, {}, 'lamp-a', 'living_room_light', unsupported)).toThrow('未知户型');
    expect(writes).toEqual([]);
  });

  it('preserves all templates and the caller snapshot if a scoped write fails', () => {
    const { storage, values } = storageWith({ living_room_light: 'lamp-a' });
    const links = saveBinding(storage, furniture, {}, 'lamp-b', 'living_room_light', threeBedroom);
    const before = [...values];
    storage.setItem = () => { throw new Error('Storage full'); };
    expect(() => saveBinding(storage, furniture, links, 'lamp-b', '', threeBedroom)).toThrow('Storage full');
    expect(links).toEqual({ living_room_light: 'lamp-b' });
    expect(readBindings(storage, furniture, threeBedroom)).toEqual(links);
    expect([...values]).toEqual(before);
  });
});
