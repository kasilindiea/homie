import { afterEach, describe, expect, it, vi } from 'vitest';

async function language(stored: string | null = null) {
  vi.resetModules();
  const storage = {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, _value: string) => undefined),
  };
  vi.stubGlobal('localStorage', storage);
  return { storage, i18n: await import('../src/i18n') };
}

afterEach(() => vi.unstubAllGlobals());

describe('language preference and data boundaries', () => {
  it('uses Chinese when no valid preference exists or storage cannot be read', async () => {
    for (const stored of [null, 'unexpected-locale']) {
      const { i18n } = await language(stored);
      expect(i18n.getLocale()).toBe('zh-CN');
      expect(i18n.t('账号')).toBe('账号');
    }
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage blocked'); } });
    expect((await import('../src/i18n')).getLocale()).toBe('zh-CN');
  });

  it('loads and persists English without touching furniture storage', async () => {
    const { i18n, storage } = await language('en');
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.t('账号')).toBe('Account');
    i18n.setLocale('zh-CN');
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith('homie.locale.v1', 'zh-CN');
    expect(i18n.getLocale()).toBe('zh-CN');
  });

  it('retains the current language if saving the preference fails', async () => {
    const { i18n, storage } = await language('en');
    storage.setItem.mockImplementation(() => { throw new Error('Storage full'); });
    expect(() => i18n.setLocale('zh-CN')).toThrow();
    expect(i18n.getLocale()).toBe('en');
    expect(i18n.t('保存设置')).toBe('Save settings');
  });

  it('localizes built-in rooms while preserving custom values and existing English room names', async () => {
    const { i18n } = await language('en');
    expect(i18n.roomLabel('客厅')).toBe('Living room');
    expect(i18n.roomValue('Living room')).toBe('客厅');
    expect(i18n.roomValue('Living room', 'Living room')).toBe('Living room');
    for (const [chinese, english] of [
      ['厨房', 'Kitchen'], ['玄关', 'Entryway'], ['浴室', 'Bathroom'],
      ['房间1', 'Room 1'], ['房间2', 'Room 2'], ['房间3', 'Room 3'],
    ]) {
      expect(i18n.roomLabel(chinese)).toBe(english);
      expect(i18n.roomValue(english)).toBe(chinese);
    }
    expect(i18n.roomLabel('卧室')).toBe('Bedroom');
    expect(i18n.roomValue('Bedroom', '卧室')).toBe('卧室');
    expect(i18n.roomValue('Room 10')).toBe('Room 10');
    expect(i18n.roomLabel('阅读室 / Studio')).toBe('阅读室 / Studio');
    expect(i18n.roomValue('阅读室 / Studio', '阅读室 / Studio')).toBe('阅读室 / Studio');
    expect(i18n.t('查看{name}', { name: '客厅书桌' })).toBe('View 客厅书桌');
  });

  it('translates validation and storage errors in English', async () => {
    const { i18n } = await language('en');
    expect(i18n.translateError(new Error('请填写家具名称'))).toBe('Enter furniture name.');
    expect(i18n.translateError(new Error('备注最多填写 240 个字'))).toBe('Notes must be 240 characters or fewer.');
    expect(i18n.translateError(new Error('账号或密码不正确'))).toBe('The account or password is incorrect.');
    expect(i18n.translateError(new Error('无法保存语言设置，请检查可用空间后重试。'))).toContain('Could not save the language');
  });
});
