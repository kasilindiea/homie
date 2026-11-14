import { describe, expect, it } from 'vitest';
import { createAppStore, STORAGE_KEY, type FurnitureInput, type StorageAdapter } from '../src/domain';

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
