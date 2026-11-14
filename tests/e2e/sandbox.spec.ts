import { expect, test, type Page } from '@playwright/test';

const furniture = [
  { id: 'light-1', name: '客厅灯 / Living light', type: 'light', room: '客厅', model: 'Lamp L01', notes: '靠窗的灯，保留用户原文。' },
  { id: 'battery-1', name: '家庭储能 A', type: 'home_battery', room: '玄关', model: 'Battery B01', notes: '备用电源' },
  { id: 'solar-1', name: '阳台光伏板', type: 'solar_panel', room: '阳台', model: 'Panel P01', notes: '面向阳台' },
  { id: 'legacy-table', name: '旧书桌 <img src=x onerror=alert(1)>', type: 'table', room: '旧书房', model: 'Legacy desk', notes: '这是一件非用电的旧家具。' },
].map((item) => ({ ...item, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }));

const savedState = {
  version: 1, session: { username: 'aaaa' }, furniture,
  settings: { nickname: '演示住户', defaultRoom: '客厅' },
};

const activeTypes = [
  'light', 'outlet', 'switch', 'air_conditioner', 'cover', 'fan', 'air_purifier',
  'humidifier', 'vacuum', 'lock', 'camera', 'sensor', 'water_heater', 'home_battery', 'solar_panel',
];
const defaultRooms = ['客厅', '厨房', '玄关', '浴室', '阳台', '房间1', '房间2', '房间3'];

async function tab(page: Page, id: string) {
  await page.locator(`.bottom-nav [data-tab="${id}"]`).click();
}

async function back(page: Page) {
  return page.evaluate(() => window.dispatchEvent(new Event('homing:back', { cancelable: true })));
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    panels: Array.from(document.querySelectorAll('#sandbox-root, #sandbox-panel, dialog[open]')).map((element) => ({
      width: element.clientWidth, content: element.scrollWidth,
    })),
  }));
  expect(sizes.html).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  for (const panel of sizes.panels) expect(panel.content).toBeLessThanOrEqual(panel.width);
}

async function assertUnavailableActions(page: Page) {
  const controls = page.locator('#sandbox-root [data-sandbox-unavailable]');
  expect(await controls.count()).toBeGreaterThan(0);
  for (const control of await controls.all()) await expect(control).toBeDisabled();
}

async function screenshot(page: Page, name: string, width: number) {
  await page.screenshot({ path: `artifacts/screenshots/${name}-${width}.png`, fullPage: true, animations: 'disabled' });
}

for (const width of [390, 360]) {
  test.describe(`${width}px mobile sandbox`, () => {
    test.use({ viewport: { width, height: 844 } });
    let errors: string[];

    test.beforeEach(async ({ page }) => {
      errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await page.evaluate((state) => {
        localStorage.clear();
        localStorage.setItem('homing.app.v1', JSON.stringify(state));
      }, savedState);
      await page.reload();
    });

    test.afterEach(() => expect(errors, 'no uncaught browser errors').toEqual([]));

    test('offers fifteen smart categories and eight rooms, then shows newly registered energy devices', async ({ page }) => {
      await page.evaluate((state) => localStorage.setItem('homing.app.v1', JSON.stringify({ ...state, furniture: [] })), savedState);
      await page.reload();
      await tab(page, 'sandbox');
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(0);
      await expect(page.locator('#sandbox-root [data-action="add"], #sandbox-root [data-sandbox-action="add"]')).toHaveCount(0);
      await tab(page, 'add');

      for (const [type, name, room] of [
        ['home_battery', '新储能设备', '玄关'], ['solar_panel', '新光伏设备', '阳台'],
      ]) {
        await page.getByRole('button', { name: '添加家具', exact: true }).click();
        expect(await page.locator('input[name="type"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))).toEqual(activeTypes);
        expect(await page.locator('#furniture-rooms option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(defaultRooms);
        await expect(page.getByRole('radio', { name: '家庭储能', exact: true })).toHaveCount(1);
        await expect(page.getByRole('radio', { name: '太阳能发电板', exact: true })).toHaveCount(1);
        await page.locator('.type-option').filter({ has: page.locator(`input[value="${type}"]`) }).click();
        await page.getByLabel(/^家具名称/).fill(name);
        await page.getByLabel(/^所在房间/).fill(room);
        await noOverflow(page);
        await page.getByRole('button', { name: '添加到我的家', exact: true }).click();
      }

      await tab(page, 'sandbox');
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(2);
      await expect(page.locator('#sandbox-panel')).toContainText('新储能设备');
      await expect(page.locator('#sandbox-panel')).toContainText('新光伏设备');
      await expect(page.locator('#sandbox-root')).toContainText('演示');
      await noOverflow(page);
    });

    test('shows a read-only demo directory and details without changing saved furniture', async ({ page }) => {
      const original = await page.evaluate(() => localStorage.getItem('homing.app.v1'));
      await tab(page, 'sandbox');
      const root = page.locator('#sandbox-root');
      await expect(root).toBeVisible();
      await expect(page.locator('.page-header .header-logo')).toHaveCount(0);
      await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-scene-state', 'placeholder');
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(furniture.length);
      await expect(root).toContainText('演示');
      await expect(root.getByRole('button', { name: /添加.*家具|去添加/ })).toHaveCount(0);
      await expect(root.locator('[data-action="add"], [data-action="edit"], [data-action="delete"]')).toHaveCount(0);
      await expect(root.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]')).toContainText('kWh');
      await expect(root.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]')).toContainText('W');
      await assertUnavailableActions(page);
      await noOverflow(page);
      await screenshot(page, 'sandbox-directory-zh', width);

      await root.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]').click();
      const detail = page.locator('#sandbox-device-detail');
      await expect(detail).toContainText('Lamp L01');
      await expect(detail).toContainText('靠窗的灯，保留用户原文。');
      await expect(detail).toContainText('演示');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await noOverflow(page);
      await screenshot(page, 'sandbox-detail-zh', width);
      expect(await back(page)).toBe(false);
      await expect(detail).toHaveCount(0);
      await expect(root).toBeVisible();

      await root.locator('[data-sandbox-action="detail"][data-furniture-id="legacy-table"]').click();
      await expect(detail).toContainText(furniture[3].name);
      await expect(detail.locator('img')).toHaveCount(0);
      await expect(detail).toContainText('—');
      await detail.locator('[data-sandbox-action="back"]').click();

      for (let cycle = 0; cycle < 3; cycle++) {
        await tab(page, 'import');
        await expect(page.locator('.page-header .header-logo')).toHaveCount(0);
        await tab(page, 'sandbox');
        await root.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]').click();
        expect(await back(page)).toBe(false);
        await expect(detail).toHaveCount(0);
        await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(furniture.length);
      }
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
      expect(await back(page)).toBe(false);
      await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
      expect(await back(page)).toBe(true);
    });

    test('keeps task and real controls unavailable and rebuilds the sandbox in both languages', async ({ page }) => {
      const original = await page.evaluate(() => localStorage.getItem('homing.app.v1'));
      await tab(page, 'account');
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');
      await tab(page, 'sandbox');
      const root = page.locator('#sandbox-root');
      await expect(page.getByRole('heading', { name: 'Sandbox', exact: true })).toBeVisible();
      await expect(root).toContainText(/demo/i);
      await expect(root).toContainText(furniture[0].name);
      await noOverflow(page);
      await screenshot(page, 'sandbox-directory-en', width);
      await page.locator('[data-sandbox-tab="tasks"]').click();
      await assertUnavailableActions(page);
      await expect(page.locator('#sandbox-panel')).toContainText(/manual/i);
      await expect(page.locator('#sandbox-panel')).toContainText(/demo|not connected|unavailable|not integrated/i);
      await noOverflow(page);
      await screenshot(page, 'sandbox-tasks-en', width);

      await page.locator('[data-sandbox-tab="devices"]').click();
      await page.locator('[data-sandbox-action="detail"][data-furniture-id="battery-1"]').click();
      await expect(page.locator('#sandbox-device-detail')).toContainText('Battery B01');
      await expect(page.locator('#sandbox-device-detail')).toContainText(/charg/i);
      await noOverflow(page);
      await screenshot(page, 'sandbox-detail-en', width);
      await page.locator('#sandbox-device-detail [data-sandbox-action="back"]').click();
      await page.locator('[data-sandbox-action="detail"][data-furniture-id="solar-1"]').click();
      await expect(page.locator('#sandbox-device-detail')).toContainText('Panel P01');
      await expect(page.locator('#sandbox-device-detail')).toContainText(/generation/i);
      await tab(page, 'account');
      await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
      await tab(page, 'sandbox');
      await expect(page.locator('#sandbox-device-detail')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '沙盒', exact: true })).toBeVisible();
      await expect(root).toContainText('演示');
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(furniture.length);
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
      await noOverflow(page);
    });
  });
}
