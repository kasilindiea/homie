import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, username = 'aaaa', password = 'bbbb') {
  await page.getByLabel('开发者账号', { exact: true }).fill(username);
  await page.getByLabel('登录密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '进入我的家', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
}

async function addFurniture(page: Page, name = '云朵台灯') {
  await page.getByRole('button', { name: '添加家具', exact: true }).click();
  await page.getByLabel(/^家具名称/).fill(name);
  await page.getByLabel(/^所在房间/).fill('客厅');
  await page.getByLabel(/^品牌 \/ 型号/).fill('Cloud S01');
  await page.getByLabel(/^备注/).fill('米白色，靠窗摆放');
  await page.getByRole('button', { name: '添加到我的家', exact: true }).click();
  await expect(page.getByRole('button', { name: `查看${name}`, exact: true })).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    dialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => ({
      width: dialog.clientWidth,
      content: dialog.scrollWidth,
    })),
  }));
  expect(sizes.html, 'document should fit the mobile viewport').toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body, 'body should fit the mobile viewport').toBeLessThanOrEqual(sizes.viewport);
  for (const dialog of sizes.dialogs) {
    expect(dialog.content, 'dialog content should not overflow horizontally').toBeLessThanOrEqual(dialog.width);
  }
}

async function screenshot(page: Page, name: string, width: number) {
  await page.screenshot({ path: `artifacts/screenshots/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
}

for (const width of [390, 360]) {
  test.describe(`${width}px mobile`, () => {
    test.use({ viewport: { width, height: 844 } });
    let runtimeErrors: string[];

    test.beforeEach(async ({ page }) => {
      runtimeErrors = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    });

    test.afterEach(() => {
      expect(runtimeErrors, 'no uncaught browser errors').toEqual([]);
    });

    test('validates developer credentials and opens the four-tab application', async ({ page }) => {
      await expect(page.getByRole('heading', { name: '欢迎回家', exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await screenshot(page, 'login', width);
      await page.getByRole('button', { name: '进入我的家', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('请填写账号和密码');
      await page.getByLabel('开发者账号', { exact: true }).fill('aaaa');
      await page.getByLabel('登录密码', { exact: true }).fill('wrong');
      await page.getByRole('button', { name: '进入我的家', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('账号或密码不正确');
      await login(page);
      const navigation = page.getByRole('navigation', { name: '主导航' });
      await expect(navigation.getByRole('button')).toHaveText(['添加', '沙盒', '导入', '账号']);
      await expect(page.getByText('家的故事，从第一件家具开始', { exact: true })).toBeVisible();
      await assertNoOverflow(page);
    });

    test('validates, saves, edits, searches and deletes furniture with a cancel step', async ({ page }) => {
      await login(page);
      await page.getByRole('button', { name: '添加家具', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '添加家具', exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await screenshot(page, 'add-form', width);
      await page.getByRole('button', { name: '添加到我的家', exact: true }).click();
      await expect(page.locator('#furniture-error')).toHaveText('请填写家具名称');
      await page.getByLabel(/^家具名称/).fill('云朵台灯');
      await page.getByLabel(/^所在房间/).fill('');
      await page.getByRole('button', { name: '添加到我的家', exact: true }).click();
      await expect(page.locator('#furniture-error')).toHaveText('请填写所在房间');
      await page.getByLabel(/^所在房间/).fill('客厅');
      await page.getByLabel(/^品牌 \/ 型号/).fill('Cloud S01');
      await page.getByLabel(/^备注/).fill('米白色，靠窗摆放');
      await page.getByRole('button', { name: '添加到我的家', exact: true }).click();
      await expect(page.getByRole('button', { name: '查看云朵台灯', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: '查看云朵台灯', exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await screenshot(page, 'furniture-list', width);

      await page.getByLabel('搜索家具名称、类型或房间', { exact: true }).fill('完全不存在的家具');
      await expect(page.getByRole('heading', { name: '暂时没有找到家具', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '查看全部家具', exact: true }).click();
      await page.getByRole('button', { name: '查看云朵台灯', exact: true }).click();
      await expect(page.getByText('Cloud S01', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '编辑家具', exact: true }).click();
      await expect(page.getByLabel(/^备注/)).toHaveValue('米白色，靠窗摆放');
      await page.getByLabel(/^家具名称/).fill('阅读角台灯');
      await page.getByLabel(/^所在房间/).fill('书房');
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      await page.reload();
      await page.getByRole('button', { name: '查看阅读角台灯', exact: true }).click();
      await page.getByRole('button', { name: '删除', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '删除这件家具？', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '保留家具', exact: true }).click();
      await expect(page.getByRole('dialog', { name: '阅读角台灯', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.getByRole('button', { name: '查看阅读角台灯', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '查看阅读角台灯', exact: true }).click();
      await page.getByRole('button', { name: '删除', exact: true }).click();
      await page.getByRole('button', { name: '确认删除', exact: true }).click();
      await page.reload();
      await expect(page.getByText('家的故事，从第一件家具开始', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '查看阅读角台灯', exact: true })).toHaveCount(0);
    });

    test('supports the second developer account without mixing passwords or losing household records', async ({ page }) => {
      await expect(page).toHaveTitle('Homie');
      await expect(page.locator('.brand-word')).toHaveText('Homie');
      await login(page);
      await addFurniture(page, '两个账号共享的台灯');
      const household = await page.evaluate(() => JSON.parse(localStorage.getItem('homing.app.v1')!).furniture);
      await page.locator('.bottom-nav [data-tab="account"]').click();
      await page.getByRole('button', { name: '退出登录', exact: true }).click();
      await page.getByLabel('开发者账号', { exact: true }).fill('cccc');
      await page.getByLabel('登录密码', { exact: true }).fill('bbbb');
      await page.getByRole('button', { name: '进入我的家', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('账号或密码不正确');
      await login(page, 'cccc', 'dddd');
      await expect(page.getByRole('button', { name: '查看两个账号共享的台灯', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('homing.app.v1')!).session.username)).toBe('cccc');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('homing.app.v1')!).furniture)).toEqual(household);
      await page.locator('.bottom-nav [data-tab="account"]').click();
      await page.getByRole('button', { name: '退出登录', exact: true }).click();
      await login(page);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('homing.app.v1')!).furniture)).toEqual(household);
    });

    test('native Back closes the sheet and returns secondary tabs to furniture', async ({ page }) => {
      await login(page);
      const back = () => page.evaluate(() => window.dispatchEvent(new Event('homing:back', { cancelable: true })));
      await page.getByRole('button', { name: '添加家具', exact: true }).click();
      expect(await back()).toBe(false);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '沙盒', exact: true }).click();
      expect(await back()).toBe(false);
      await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
      expect(await back()).toBe(true);
    });

    test('opens the sandbox and import while settings and logout work', async ({ page }) => {
      await login(page);
      await addFurniture(page);
      const navigation = page.getByRole('navigation', { name: '主导航' });
      await navigation.getByRole('button', { name: '沙盒', exact: true }).click();
      await expect(page.locator('#sandbox-root')).toBeVisible();
      await expect(page.locator('.page-header .header-logo')).toHaveCount(0);
      await assertNoOverflow(page);
      await navigation.getByRole('button', { name: '导入', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'API 接入', exact: true })).toBeVisible();
      await expect(page.getByLabel('API 接口地址', { exact: true })).toBeVisible();
      await expect(page.locator('.page-header .header-logo')).toHaveCount(0);
      await assertNoOverflow(page);
      await navigation.getByRole('button', { name: '账号', exact: true }).click();
      await page.getByLabel('显示名称', { exact: true }).fill('小栖');
      await page.getByLabel('默认添加房间', { exact: true }).fill('阅读室');
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await expect(page.getByRole('heading', { name: '小栖', exact: true })).toBeVisible();
      await assertNoOverflow(page);
      await screenshot(page, 'account', width);
      await page.reload();
      await navigation.getByRole('button', { name: '账号', exact: true }).click();
      await expect(page.getByLabel('显示名称', { exact: true })).toHaveValue('小栖');
      await expect(page.getByLabel('默认添加房间', { exact: true })).toHaveValue('阅读室');
      await navigation.getByRole('button', { name: '添加', exact: true }).click();
      await page.getByRole('button', { name: '添加家具', exact: true }).click();
      await expect(page.getByLabel(/^所在房间/)).toHaveValue('阅读室');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await navigation.getByRole('button', { name: '账号', exact: true }).click();
      await page.getByRole('button', { name: '退出登录', exact: true }).click();
      await expect(page.getByRole('heading', { name: '欢迎回家', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading', { name: '欢迎回家', exact: true })).toBeVisible();
      await login(page);
      await expect(page.getByRole('button', { name: '查看云朵台灯', exact: true })).toBeVisible();
    });
  });
}
