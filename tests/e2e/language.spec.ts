import { expect, test, type Page } from '@playwright/test';

const legacyFurniture = {
  id: 'legacy-table', name: '松木书桌 / Pine desk', type: 'table', room: '阅读室 / Studio',
  model: '木作 Studio 01', notes: '保留我的文字：靠窗，不要翻译。',
  createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
};
const legacyState = {
  version: 1, session: { username: 'aaaa' }, furniture: [legacyFurniture],
  settings: { nickname: '小栖 Lee', defaultRoom: '客厅' },
};

async function tab(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => ({
      width: dialog.clientWidth, content: dialog.scrollWidth,
    })),
  }));
  expect(sizes.html).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  for (const dialog of sizes.dialogs) expect(dialog.content).toBeLessThanOrEqual(dialog.width);
}

async function storedFurniture(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('homing.app.v1')!).furniture);
}

async function screenshot(page: Page, name: string, width: number) {
  await page.screenshot({ path: `artifacts/screenshots/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
}

for (const width of [390, 360]) {
  test.describe(`${width}px language support`, () => {
    test.use({ viewport: { width, height: 844 } });
    let runtimeErrors: string[];

    test.beforeEach(async ({ page }) => {
      runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.goto('/');
      await page.evaluate((state) => {
        localStorage.clear();
        localStorage.setItem('homing.app.v1', JSON.stringify(state));
      }, legacyState);
      await page.reload();
    });

    test.afterEach(() => expect(runtimeErrors).toEqual([]));

    test('switches both languages, retains legacy furniture, and remembers English after logout', async ({ page }) => {
      await expect(page).toHaveTitle('Homie');
      await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
      await tab(page, '账号');
      await expect(page.locator('.page-header .header-logo')).toHaveCount(0);
      await expect(page.locator('#main-content > section').last()).toHaveAttribute('id', 'settings-section');
      const about = await page.locator('#about-section').boundingBox();
      const settings = await page.locator('#settings-section').boundingBox();
      expect(about).not.toBeNull();
      expect(settings).not.toBeNull();
      expect(settings!.y).toBeGreaterThanOrEqual(about!.y + about!.height);
      await expect(page.locator('#settings-section [data-action="logout"]')).toHaveCount(1);
      await expect(page.getByLabel('默认添加房间', { exact: true })).toHaveValue('客厅');
      await screenshot(page, 'language-account-zh', width);
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');

      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('navigation').getByRole('button')).toHaveText(['Add', 'Sandbox', 'Import', 'Account']);
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
      await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('小栖 Lee');
      await expect(page.getByLabel('Default room', { exact: true })).toHaveValue('Living room');
      await expect(page.getByRole('heading', { name: 'About Homie', exact: true })).toBeVisible();
      await noOverflow(page);
      await screenshot(page, 'language-account-en', width);

      await tab(page, 'Sandbox');
      await noOverflow(page);
      await expect(page.locator('#main-content')).not.toContainText('为想象，留一点空间');
      await tab(page, 'Import');
      await noOverflow(page);
      await expect(page.getByRole('heading', { name: 'API setup', exact: true })).toBeVisible();
      await expect(page.getByLabel('API endpoint URL', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('navigation').getByRole('button')).toHaveText(['Add', 'Sandbox', 'Import', 'Account']);
      await page.locator('[data-action="detail"][data-id="legacy-table"]').click();
      await expect(page.getByRole('dialog')).toContainText(legacyFurniture.name);
      await expect(page.getByRole('dialog')).toContainText(legacyFurniture.room);
      await expect(page.getByRole('dialog')).toContainText(legacyFurniture.model);
      await expect(page.getByRole('dialog')).toContainText(legacyFurniture.notes);
      await noOverflow(page);
      await page.getByRole('button', { name: 'Edit furniture', exact: true }).click();
      await expect(page.locator('input[name="type"][value="table"]')).toBeChecked();
      await expect(page.getByLabel(/^Furniture name/)).toHaveValue(legacyFurniture.name);
      await page.getByRole('button', { name: 'Close', exact: true }).click();

      await tab(page, 'Account');
      await page.locator('[data-action="logout"]').click();
      await expect(page.getByRole('heading', { name: 'Welcome home', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Welcome home', exact: true })).toBeVisible();
      await noOverflow(page);
      await screenshot(page, 'language-login-en', width);
      await page.getByLabel('Developer account', { exact: true }).fill('aaaa');
      await page.getByLabel('Password', { exact: true }).fill('wrong');
      await page.getByRole('button', { name: 'Enter my home', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(/account|password/i);
      await expect(page.getByRole('alert')).not.toContainText(/[\u3400-\u9fff]/);
      await page.getByLabel('Password', { exact: true }).fill('bbbb');
      await page.getByRole('button', { name: 'Enter my home', exact: true }).click();
      await expect(page.locator('[data-action="detail"][data-id="legacy-table"]')).toBeVisible();
      await tab(page, 'Account');
      await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
      await expect(page.getByRole('navigation').getByRole('button')).toHaveText(['添加', '沙盒', '导入', '账号']);
      await expect(page.getByLabel('默认添加房间', { exact: true })).toHaveValue('客厅');
      expect(await storedFurniture(page)).toEqual([legacyFurniture]);
      await page.reload();
      await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
      await noOverflow(page);
    });

    test('keeps settings drafts and custom text while English furniture forms work', async ({ page }) => {
      await tab(page, '账号');
      await page.getByLabel('显示名称', { exact: true }).fill('小栖 Lee draft');
      await page.getByLabel('默认添加房间', { exact: true }).fill('阅读室 2F');
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');
      await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('小栖 Lee draft');
      await expect(page.getByLabel('Default room', { exact: true })).toHaveValue('阅读室 2F');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(page.getByRole('heading', { name: '小栖 Lee draft', exact: true })).toBeVisible();
      await tab(page, 'Add');
      await page.getByRole('button', { name: 'Add furniture', exact: true }).click();
      await expect(page.getByLabel(/^Room/)).toHaveValue('阅读室 2F');
      await expect(page.getByRole('dialog', { name: 'Add furniture', exact: true })).toBeVisible();
      await noOverflow(page);
      await screenshot(page, 'language-add-en', width);
      await page.getByRole('button', { name: 'Add to my home', exact: true }).click();
      await expect(page.locator('#furniture-error')).toContainText(/furniture name/i);
      await expect(page.locator('#furniture-error')).not.toContainText(/[\u3400-\u9fff]/);
      await page.getByLabel(/^Furniture name/).fill('Window light 窗边灯');
      await page.locator('.type-option').filter({ has: page.locator('input[value="light"]') }).click();
      await expect(page.locator('input[name="type"][value="light"]')).toBeChecked();
      await page.getByLabel(/^Room/).fill('Living room');
      await page.getByLabel(/^Brand \/ model/).fill('NORD / 001');
      await page.getByLabel(/^Notes/).fill('自己写的 notes');
      await page.getByRole('button', { name: 'Add to my home', exact: true }).click();
      const furniture = await storedFurniture(page);
      const added = furniture.find((entry: { name: string }) => entry.name === 'Window light 窗边灯');
      expect(added).toMatchObject({ type: 'light', room: '客厅', model: 'NORD / 001', notes: '自己写的 notes' });
      await page.locator('#furniture-search').fill('Living room');
      await expect(page.locator(`[data-action="detail"][data-id="${added.id}"]`)).toBeVisible();
      await expect(page.locator('[data-action="detail"][data-id="legacy-table"]')).toHaveCount(0);
      await page.locator(`[data-action="detail"][data-id="${added.id}"]`).click();
      await page.locator('[data-action="edit"]').click();
      await expect(page.getByLabel(/^Room/)).toHaveValue('Living room');
      await expect(page.getByLabel(/^Notes/)).toHaveValue('自己写的 notes');
      await page.getByLabel(/^Furniture name/).fill('Window light v2 窗边灯');
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await page.locator(`[data-action="detail"][data-id="${added.id}"]`).click();
      await page.locator('[data-action="confirm-delete"]').click();
      await expect(page.getByRole('dialog')).not.toContainText('删除这件家具');
      await page.getByRole('dialog').locator('[data-action="detail"]').click();
      await expect(page.getByRole('dialog')).toContainText('Window light v2 窗边灯');
      await page.locator('[data-action="confirm-delete"]').click();
      await page.locator('[data-action="delete"]').click();
      expect(await storedFurniture(page)).toEqual([legacyFurniture]);
      await tab(page, 'Account');
      await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
      await expect(page.getByLabel('默认添加房间', { exact: true })).toHaveValue('阅读室 2F');
      await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue('小栖 Lee draft');
      await noOverflow(page);
    });
  });
}
