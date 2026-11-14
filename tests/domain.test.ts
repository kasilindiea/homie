import { describe, expect, it } from 'vitest';
import { createAppStore, DEFAULT_ROOMS, FURNITURE_TYPES, STORAGE_KEY, type FurnitureInput, type StorageAdapter } from '../src/domain';

class MemoryStorage implements StorageAdapter {
  readonly data = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('blocked');
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('quota exceeded');
    this.data.set(key, value);
  }
}

const credentials = { username: 'tester', password: 'demo-pass' };
const sample: FurnitureInput = { name: '云朵沙发', type: 'sofa', room: '客厅', model: 'S-01', notes: '靠窗摆放' };

function setup() {
  const storage = new MemoryStorage();
  let counter = 0;
  const store = createAppStore({ storage, credentials, createId: () => `test-${++counter}` });
  return { storage, store };
}

describe('developer demo account', () => {
  it('rejects invalid credentials and unauthenticated changes without writing storage', () => {
    const { storage, store } = setup();
    expect(store.getState().session).toBeNull();
    expect(() => store.login('tester', 'wrong')).toThrow('账号或密码不正确');
    expect(() => store.addFurniture(sample)).toThrow('请先登录');
    expect(() => store.updateSettings({ nickname: '新名字' })).toThrow('请先登录');
    expect(storage.data.size).toBe(0);
  });

  it('restores a session and keeps furniture after logout and login', () => {
    const { storage, store } = setup();
    store.login(' tester ', 'demo-pass');
    store.addFurniture(sample);
    const restored = createAppStore({ storage, credentials });
    expect(restored.getState().session?.username).toBe('tester');
    expect(restored.getState().furniture).toHaveLength(1);
    restored.logout();
    expect(restored.getState().session).toBeNull();
    expect(restored.getState().furniture).toEqual([]);
    expect(() => restored.deleteFurniture('test-1')).toThrow('请先登录');
    const reopened = createAppStore({ storage, credentials });
    expect(reopened.getState().session).toBeNull();
    reopened.login('tester', 'demo-pass');
    expect(reopened.getState().furniture[0].name).toBe(sample.name);
    expect(storage.getItem(STORAGE_KEY)).not.toContain('demo-pass');
  });

  it('does not accept an existing session belonging to a different configured account', () => {
    const { storage, store } = setup();
    store.login('tester', 'demo-pass');
    const changed = createAppStore({ storage, credentials: { username: 'new-developer', password: 'new-pass' } });
    expect(changed.getState().session).toBeNull();
  });
});

describe('furniture and settings', () => {
  it('persists all 15 smart categories including storage and solar, using the existing record shape', () => {
    const { storage, store } = setup();
    store.login('tester', 'demo-pass');
    expect(FURNITURE_TYPES).toHaveLength(15);
    expect(new Set(FURNITURE_TYPES.map((item) => item.value)).size).toBe(15);
    expect(FURNITURE_TYPES.map((item) => item.value)).toEqual(expect.arrayContaining(['home_battery', 'solar_panel']));
    expect(FURNITURE_TYPES.filter((item) => ['sofa', 'chair', 'table', 'bed', 'cabinet', 'other'].includes(item.value))).toEqual([]);
    for (const type of FURNITURE_TYPES) {
      store.addFurniture({ name: type.label, type: type.value, room: '客厅' });
    }
    const restored = createAppStore({ storage, credentials }).getState();
    expect(restored.warning).toBeNull();
    expect(restored.furniture).toHaveLength(15);
    expect(restored.furniture.map((item) => item.type).sort()).toEqual(FURNITURE_TYPES.map((item) => item.value).sort());
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
    expect(saved.version).toBe(1);
    expect(Object.keys(saved.furniture[0]).sort()).toEqual(['createdAt', 'id', 'model', 'name', 'notes', 'room', 'type', 'updatedAt']);
  });

  it('keeps every legacy category and room when reopening and editing a version-1 household', () => {
    const storage = new MemoryStorage();
    const legacyTypes = ['sofa', 'chair', 'table', 'bed', 'cabinet', 'light', 'other'];
    const timestamp = '2026-10-01T08:00:00.000Z';
    const furniture = legacyTypes.map((type, index) => ({
      id: `old-${type}`, name: `原家具 ${index}`, type, room: index % 2 ? '书房' : '我的工作室',
      model: `原型号-${index}`, notes: '原来的记录', createdAt: timestamp, updatedAt: timestamp,
    }));
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, session: { username: 'tester' }, furniture, settings: { nickname: '原账号', defaultRoom: '卧室' },
    }));
    const store = createAppStore({ storage, credentials, now: () => new Date('2026-11-14T00:00:00.000Z') });
    expect(store.getState().warning).toBeNull();
    expect(store.getState().furniture).toEqual(furniture);
    expect(store.getState().settings.defaultRoom).toBe('卧室');
    for (const item of furniture) store.updateFurniture(item.id, { ...item, notes: '已编辑，保留类型' });
    const reopened = createAppStore({ storage, credentials });
    expect(reopened.getState().warning).toBeNull();
    expect(reopened.getState().furniture).toEqual(furniture.map((item) => ({
      ...item, notes: '已编辑，保留类型', updatedAt: '2026-11-14T00:00:00.000Z',
    })));
  });

  it('offers the eight requested rooms without restricting existing or custom room names', () => {
    expect(DEFAULT_ROOMS).toEqual(['客厅', '厨房', '玄关', '浴室', '阳台', '房间1', '房间2', '房间3']);
    const { store, storage } = setup();
    store.login('tester', 'demo-pass');
    const added = store.addFurniture({ name: '工作室灯', type: 'light', room: '阁楼 / Studio' });
    store.updateSettings({ defaultRoom: '书房' });
    const reopened = createAppStore({ storage, credentials }).getState();
    expect(reopened.warning).toBeNull();
    expect(reopened.furniture[0]).toEqual(added);
    expect(reopened.settings.defaultRoom).toBe('书房');
  });

  it('adds, edits and deletes furniture durably while preserving identity and creation date', () => {
    const { storage, store } = setup();
    store.login('tester', 'demo-pass');
    const added = store.addFurniture({ ...sample, name: '  云朵沙发  ', room: '  起居室  ' });
    expect(added.name).toBe('云朵沙发');
    expect(added.room).toBe('起居室');
    const edited = store.updateFurniture(added.id, { ...sample, name: '双人沙发' });
    expect(edited.id).toBe(added.id);
    expect(edited.createdAt).toBe(added.createdAt);
    expect(createAppStore({ storage, credentials }).getState().furniture[0].name).toBe('双人沙发');
    store.deleteFurniture(added.id);
    expect(createAppStore({ storage, credentials }).getState().furniture).toEqual([]);
  });

  it('rejects missing names, unsupported types and excessive field lengths', () => {
    const { store } = setup();
    store.login('tester', 'demo-pass');
    expect(() => store.addFurniture({ ...sample, name: '   ' })).toThrow('家具名称');
    expect(() => store.addFurniture({ ...sample, type: 'unknown' })).toThrow('家具类型');
    expect(() => store.addFurniture({ ...sample, room: '' })).toThrow('所在房间');
    expect(() => store.addFurniture({ ...sample, name: '字'.repeat(41) })).toThrow('40');
    expect(() => store.addFurniture({ ...sample, notes: '字'.repeat(241) })).toThrow('240');
    expect(() => store.updateFurniture('missing', sample)).toThrow('已不存在');
    expect(() => store.deleteFurniture('missing')).toThrow('已不存在');
    expect(store.getState().furniture).toEqual([]);
  });

  it('saves partial account settings and does not expose mutable references', () => {
    const { storage, store } = setup();
    store.login('tester', 'demo-pass');
    store.updateSettings({ nickname: '  小栖  ', defaultRoom: '工作室' });
    store.updateSettings({ nickname: '阿栖' });
    store.addFurniture(sample);
    const state = store.getState();
    state.settings.nickname = '篡改';
    state.furniture[0].name = '篡改';
    expect(store.getState().settings).toEqual({ nickname: '阿栖', defaultRoom: '工作室' });
    expect(store.getState().furniture[0].name).toBe(sample.name);
    expect(createAppStore({ storage, credentials }).getState().settings.defaultRoom).toBe('工作室');
    expect(() => store.updateSettings({ nickname: ' ' })).toThrow('昵称');
  });
});

describe('storage failures and recovery', () => {
  it.each(['not valid JSON', '{"version":2}', '{"version":1,"session":null,"furniture":[{}],"settings":{}}'])(
    'recovers invalid stored data with a warning without immediately overwriting it: %s', (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, raw);
      const store = createAppStore({ storage, credentials });
      expect(store.getState().session).toBeNull();
      expect(store.getState().furniture).toEqual([]);
      expect(store.getState().warning).toContain('空白状态');
      expect(storage.getItem(STORAGE_KEY)).toBe(raw);
      store.clearWarning();
      expect(store.getState().warning).toBeNull();
    },
  );

  it('does not claim login succeeded when persistence fails', () => {
    const { storage, store } = setup();
    storage.failWrites = true;
    expect(() => store.login('tester', 'demo-pass')).toThrow('保存失败');
    expect(store.getState().session).toBeNull();
  });

  it('does not mutate in-memory furniture or settings on failed writes', () => {
    const { storage, store } = setup();
    store.login('tester', 'demo-pass');
    const added = store.addFurniture(sample);
    const before = store.getState();
    storage.failWrites = true;
    expect(() => store.addFurniture(sample)).toThrow('保存失败');
    expect(() => store.updateFurniture(added.id, { ...sample, name: '无法保存' })).toThrow('保存失败');
    expect(() => store.deleteFurniture(added.id)).toThrow('保存失败');
    expect(() => store.updateSettings({ nickname: '无法保存' })).toThrow('保存失败');
    expect(() => store.logout()).toThrow('保存失败');
    expect(store.getState()).toEqual(before);
  });

  it('reports unavailable storage on startup instead of crashing', () => {
    const storage = new MemoryStorage();
    storage.failReads = true;
    storage.failWrites = true;
    const store = createAppStore({ storage, credentials });
    expect(store.getState().warning).toContain('无法读取本机存储');
    expect(store.getState().session).toBeNull();
    expect(() => store.login('tester', 'demo-pass')).toThrow('保存失败');
  });
});
