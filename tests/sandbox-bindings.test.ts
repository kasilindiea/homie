import { describe, expect, it } from 'vitest';
import type { Furniture, StorageAdapter } from '../src/domain';
import { BINDINGS_KEY, readBindings, saveBinding } from '../src/features/sandbox-runtime/bindings';

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
});
