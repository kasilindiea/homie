/**
 * Local demo account and furniture storage.
 * This account check is for a packaged prototype, not server authentication.
 * Never use real account passwords in the VITE_* demo build variables.
 */

export const FURNITURE_TYPES = [
  { value: 'light', label: '灯具' },
  { value: 'outlet', label: '智能插座' },
  { value: 'switch', label: '智能开关' },
  { value: 'air_conditioner', label: '空调' },
  { value: 'cover', label: '窗帘' },
  { value: 'fan', label: '风扇' },
  { value: 'air_purifier', label: '空气净化器' },
  { value: 'humidifier', label: '加湿器' },
  { value: 'vacuum', label: '扫地机器人' },
  { value: 'lock', label: '门锁' },
  { value: 'camera', label: '摄像头' },
  { value: 'sensor', label: '传感器' },
  { value: 'water_heater', label: '热水器' },
  { value: 'home_battery', label: '家庭储能' },
  { value: 'solar_panel', label: '太阳能发电板' },
] as const;

// The add form uses FURNITURE_TYPES, while saved records retain the full catalog.
// Removing an add option must never invalidate an entire version-1 household.
export const ALL_FURNITURE_TYPES = [
  ...FURNITURE_TYPES,
  { value: 'sofa', label: '沙发' },
  { value: 'chair', label: '椅子' },
  { value: 'table', label: '桌子' },
  { value: 'bed', label: '床' },
  { value: 'cabinet', label: '柜子' },
  { value: 'other', label: '其他' },
] as const;

export const DEFAULT_ROOMS = ['客厅', '厨房', '玄关', '浴室', '阳台', '房间1', '房间2', '房间3'] as const;
export const STORAGE_KEY = 'homing.app.v1';

export type FurnitureType = (typeof ALL_FURNITURE_TYPES)[number]['value'];

export interface Furniture {
  id: string;
  name: string;
  type: FurnitureType;
  room: string;
  model: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FurnitureInput {
  name: string;
  type: string;
  room: string;
  model?: string;
  notes?: string;
}

export interface AppSettings {
  nickname: string;
  defaultRoom: string;
}

export interface AppState {
  session: { username: string } | null;
  furniture: Furniture[];
  settings: AppSettings;
  warning: string | null;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredState {
  version: 1;
  session: AppState['session'];
  furniture: Furniture[];
  settings: AppSettings;
}

export interface AppStoreOptions {
  storage?: StorageAdapter;
  credentials?: Credentials | readonly Credentials[];
  now?: () => Date;
  createId?: () => string;
}

export interface AppStore {
  getState(): AppState;
  login(username: string, password: string): AppState;
  logout(): void;
  addFurniture(input: FurnitureInput): Furniture;
  updateFurniture(id: string, input: FurnitureInput): Furniture;
  deleteFurniture(id: string): void;
  updateSettings(input: Partial<AppSettings>): AppSettings;
  clearWarning(): void;
}

const DEFAULT_SETTINGS: AppSettings = { nickname: '开发者', defaultRoom: '客厅' };

function emptyState(): StoredState {
  return { version: 1, session: null, furniture: [], settings: { ...DEFAULT_SETTINGS } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textField(value: unknown, label: string, limit: number, required = true): string {
  if (typeof value !== 'string') throw new Error(`请填写${label}`);
  const result = value.trim();
  if (required && !result) throw new Error(`请填写${label}`);
  if (Array.from(result).length > limit) throw new Error(`${label}最多填写 ${limit} 个字`);
  return result;
}

function validateInput(input: FurnitureInput): Omit<Furniture, 'id' | 'createdAt' | 'updatedAt'> {
  if (!isRecord(input)) throw new Error('家具信息不完整');
  if (!ALL_FURNITURE_TYPES.some((item) => item.value === input.type)) {
    throw new Error('请选择有效的家具类型');
  }
  return {
    name: textField(input.name, '家具名称', 40),
    type: input.type as FurnitureType,
    room: textField(input.room, '所在房间', 20),
    model: textField(input.model ?? '', '型号', 60, false),
    notes: textField(input.notes ?? '', '备注', 240, false),
  };
}

function validateSettings(input: unknown): AppSettings {
  if (!isRecord(input)) throw new Error('设置格式不正确');
  return {
    nickname: textField(input.nickname, '昵称', 24),
    defaultRoom: textField(input.defaultRoom, '默认房间', 20),
  };
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function readState(raw: string): StoredState {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.furniture)) {
    throw new Error('Unsupported storage format');
  }
  if (parsed.session !== null && (!isRecord(parsed.session) || typeof parsed.session.username !== 'string')) {
    throw new Error('Invalid saved session');
  }
  const ids = new Set<string>();
  const furniture = parsed.furniture.map((item: unknown): Furniture => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) {
      throw new Error('Invalid furniture identifier');
    }
    if (!isDateString(item.createdAt) || !isDateString(item.updatedAt)) {
      throw new Error('Invalid furniture date');
    }
    ids.add(item.id);
    const fields = validateInput(item as unknown as FurnitureInput);
    return { ...fields, id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt };
  });
  return {
    version: 1,
    session: parsed.session === null ? null : { username: (parsed.session as Record<string, unknown>).username as string },
    furniture,
    settings: validateSettings(parsed.settings),
  };
}

function defaultCredentials(): readonly Credentials[] {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const configured = [
    [env?.VITE_DEVELOPER_USERNAME, env?.VITE_DEVELOPER_PASSWORD],
    [env?.VITE_DEVELOPER_USERNAME_2, env?.VITE_DEVELOPER_PASSWORD_2],
  ].filter(([username, password]) => username !== undefined || password !== undefined);
  // An explicit build configuration replaces the defaults, just like options.credentials.
  if (configured.length) return configured.map(([username, password]) => ({ username: username ?? '', password: password ?? '' }));
  return [{ username: 'aaaa', password: 'bbbb' }, { username: 'cccc', password: 'dddd' }];
}

function browserStorage(): StorageAdapter {
  // Resolve localStorage inside these methods: disabled storage must not crash startup.
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  };
}

export function createAppStore(options: AppStoreOptions = {}): AppStore {
  const storage = options.storage ?? browserStorage();
  const configured = options.credentials ?? defaultCredentials();
  const credentials: readonly Credentials[] = Array.isArray(configured) ? configured : [configured as Credentials];
  if (!credentials.length || credentials.some((account) => !account.username.trim() || !account.password)
    || new Set(credentials.map((account) => account.username)).size !== credentials.length) {
    throw new Error('开发者登录配置不完整');
  }
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  let state = emptyState();
  let warning: string | null = null;

  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        state = readState(saved);
        if (!credentials.some((account) => account.username === state.session?.username)) state.session = null;
      } catch {
        warning = '本机保存的数据无法读取，已恢复为空白状态。原始记录会在下次成功保存时替换。';
      }
    }
  } catch {
    warning = '暂时无法读取本机存储，请检查存储权限或可用空间后重新打开应用。';
  }

  function requireSession(): void {
    if (!state.session) throw new Error('请先登录开发者账号');
  }

  function commit(next: StoredState): void {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error('保存失败，本次更改未保存。请检查可用空间后重试。');
    }
    // Only mutate memory after a successful durable write.
    state = next;
  }

  function getState(): AppState {
    return {
      session: state.session ? { ...state.session } : null,
      furniture: state.session ? state.furniture.map((item) => ({ ...item })) : [],
      settings: { ...(state.session ? state.settings : DEFAULT_SETTINGS) },
      warning,
    };
  }

  return {
    getState,
    login(username, password) {
      const account = typeof username === 'string'
        ? credentials.find((entry) => entry.username === username.trim() && entry.password === password)
        : undefined;
      if (!account) {
        throw new Error('账号或密码不正确');
      }
      commit({ ...state, session: { username: account.username } });
      return getState();
    },
    logout() {
      requireSession();
      commit({ ...state, session: null });
    },
    addFurniture(input) {
      requireSession();
      const fields = validateInput(input);
      const timestamp = now().toISOString();
      const id = createId();
      if (!id || state.furniture.some((item) => item.id === id)) throw new Error('生成家具编号失败，请重试');
      const furniture: Furniture = { ...fields, id, createdAt: timestamp, updatedAt: timestamp };
      commit({ ...state, furniture: [furniture, ...state.furniture] });
      return { ...furniture };
    },
    updateFurniture(id, input) {
      requireSession();
      const existing = state.furniture.find((item) => item.id === id);
      if (!existing) throw new Error('这件家具已不存在，请刷新后重试');
      const furniture: Furniture = { ...existing, ...validateInput(input), updatedAt: now().toISOString() };
      commit({ ...state, furniture: state.furniture.map((item) => item.id === id ? furniture : item) });
      return { ...furniture };
    },
    deleteFurniture(id) {
      requireSession();
      if (!state.furniture.some((item) => item.id === id)) throw new Error('这件家具已不存在，请刷新后重试');
      commit({ ...state, furniture: state.furniture.filter((item) => item.id !== id) });
    },
    updateSettings(input) {
      requireSession();
      if (!isRecord(input)) throw new Error('设置格式不正确');
      const settings = validateSettings({ ...state.settings, ...input });
      commit({ ...state, settings });
      return { ...settings };
    },
    clearWarning() {
      warning = null;
    },
  };
}
