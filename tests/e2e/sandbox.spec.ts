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
  for (const control of await controls.all()) await expect(control).toBeDisabled();
}

async function readyScene(page: Page) {
  await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20_000 });
  await expect(page.locator('#sandbox-scene-mount canvas')).toHaveCount(1);
  await expect.poll(async () => (await sceneSnapshot(page))?.renderedFrames ?? 0).toBeGreaterThan(0);
  await expect.poll(async () => page.evaluate(() => {
    const scene = document.querySelector('#sandbox-scene-mount')!.getBoundingClientRect();
    // Read all rectangles in one browser frame; small scenes may hide labels.
    const hotspots = Array.from(document.querySelectorAll<HTMLElement>('#sandbox-scene-mount .homie-scene-hotspot'))
      .filter((item) => !item.hidden && getComputedStyle(item).display !== 'none')
      .map((item) => ({ id: item.dataset.objectId, rect: item.getBoundingClientRect() }));
    const violations: string[] = [];
    for (const [index, hotspot] of hotspots.entries()) {
      const a = hotspot.rect;
      if (a.left < scene.left - 0.5 || a.top < scene.top - 0.5 || a.right > scene.right + 0.5 || a.bottom > scene.bottom + 0.5) violations.push(`${hotspot.id} exceeds the scene`);
      for (const other of hotspots.slice(index + 1)) {
        const b = other.rect;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) violations.push(`${hotspot.id} overlaps ${other.id}`);
      }
    }
    return violations;
  }), { message: 'visible model labels stay inside the scene without overlap' }).toEqual([]);
}

const action = (page: Page, name: string) => page.locator(`#sandbox-root [data-sandbox-action="${name}"]`);

async function sceneSnapshot(page: Page): Promise<{ active: boolean; renderedFrames: number; emissive: number } | null> {
  return page.evaluate(async () => {
    const modulePath = '/src/features/sandbox.ts';
    const { inspectSandboxScene } = await import(modulePath);
    const container = document.querySelector('#main-content');
    return container ? inspectSandboxScene(container) ?? null : null;
  });
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
      await readyScene(page);
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

    test('labels simulation and rebuilds the 3D sandbox in both languages', async ({ page }) => {
      const original = await page.evaluate(() => localStorage.getItem('homing.app.v1'));
      await tab(page, 'account');
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');
      await tab(page, 'sandbox');
      await readyScene(page);
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
      await readyScene(page);
      await expect(page.locator('#sandbox-device-detail')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '沙盒', exact: true })).toBeVisible();
      await expect(root).toContainText('演示');
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(furniture.length);
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
      await noOverflow(page);
    });

    test('persists explicit links separately and keeps linked battery and sensor status consistent', async ({ page }) => {
      const withSensor = { ...savedState, furniture: [...furniture, {
        ...furniture[0], id: 'sensor-1', name: '阳台门磁记录', type: 'sensor', room: '阳台', model: 'Sensor S01',
      }] };
      await page.evaluate((state) => localStorage.setItem('homing.app.v1', JSON.stringify(state)), withSensor);
      await page.reload();
      const original = await page.evaluate(() => localStorage.getItem('homing.app.v1'));
      await tab(page, 'sandbox');
      await readyScene(page);
      await page.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]').click();
      const binding = page.locator('#sandbox-device-detail select[data-sandbox-binding]');
      await expect(binding).toHaveValue('');
      await binding.selectOption('living_room_light');
      await expect(binding).toHaveValue('living_room_light');
      expect(await page.evaluate(() => localStorage.getItem('homie.sandbox.bindings.v1'))).toBeTruthy();
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
      await page.reload();
      await tab(page, 'sandbox');
      await readyScene(page);
      await page.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]').click();
      await expect(binding).toHaveValue('living_room_light');
      await binding.selectOption('');
      await expect(binding).toHaveValue('');

      await action(page, 'back').click();
      await page.locator('[data-sandbox-action="detail"][data-furniture-id="battery-1"]').click();
      await binding.selectOption('home_battery');
      const detailStatus = page.locator('#sandbox-device-detail .sb-detail-readings > div').filter({ has: page.getByText('开启状态', { exact: true }) }).locator('dd');
      await expect(detailStatus).toHaveText('充电中');
      await action(page, 'back').click();
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id="battery-1"] .sb-power-state')).toHaveText('充电中');

      await page.locator('[data-sandbox-action="detail"][data-furniture-id="sensor-1"]').click();
      await binding.selectOption('balcony_door');
      await expect(detailStatus).toHaveText('已合上');
      await action(page, 'back').click();
      await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id="sensor-1"] .sb-power-state')).toHaveText('已合上');
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
    });

    test('keeps plan and command acceptance separate from simulated valid light readings', async ({ page }) => {
      const original = await page.evaluate(() => localStorage.getItem('homing.app.v1'));
      const nonLocalRequests: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (/^https?:$/.test(url.protocol) && url.origin !== new URL(page.url()).origin) nonLocalRequests.push(request.url());
      });
      await tab(page, 'sandbox');
      await readyScene(page);
      const scene = page.locator('#sandbox-scene-mount');
      await expect(scene).toHaveAttribute('data-lamp-state', 'on');
      await expect.poll(async () => (await sceneSnapshot(page))?.emissive ?? 0).toBeGreaterThan(0);
      await page.locator('[data-sandbox-tab="tasks"]').click();
      await action(page, 'plan').click();
      if (await scene.getAttribute('data-plan-highlight') !== 'true') await action(page, 'preview').click();
      await expect(scene).toHaveAttribute('data-plan-highlight', 'true');
      await expect(scene).toHaveAttribute('data-lamp-state', 'on');
      await page.locator('#sandbox-readback-order').selectOption('execution-first');
      await action(page, 'execute').click();
      await expect(scene).toHaveAttribute('data-lamp-state', 'on');
      await action(page, 'next-readback').click();
      await expect(scene).toHaveAttribute('data-lamp-state', 'on');
      await action(page, 'next-readback').click();
      await expect(scene).toHaveAttribute('data-lamp-state', 'unknown');
      await action(page, 'next-readback').click();
      await expect(scene).toHaveAttribute('data-lamp-state', 'off');
      await expect.poll(async () => (await sceneSnapshot(page))?.emissive ?? -1).toBeLessThan(0.001);
      await expect(action(page, 'next-readback')).toBeDisabled();
      await noOverflow(page);
      await screenshot(page, 'sandbox-simulated-light-off', width);
      await action(page, 'demo-reset').click();
      await expect(scene).toHaveAttribute('data-lamp-state', 'on');
      await expect(scene).toHaveAttribute('data-plan-highlight', 'false');
      expect(await page.evaluate(() => localStorage.getItem('homing.app.v1'))).toBe(original);
      expect(nonLocalRequests, 'offline mode uses only bundled assets, no API or CDN').toEqual([]);
    });

    if (width === 390) {
      test('pauses rendering in the background and releases the renderer when leaving', async ({ page }) => {
        await tab(page, 'sandbox');
        await readyScene(page);
        await expect.poll(async () => (await sceneSnapshot(page))?.renderedFrames ?? 0).toBeGreaterThan(0);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('homie:app-state', { detail: { active: false } })));
        const paused = await sceneSnapshot(page);
        expect(paused?.active).toBe(false);
        await page.waitForTimeout(150);
        expect((await sceneSnapshot(page))?.renderedFrames).toBe(paused?.renderedFrames);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('homie:app-state', { detail: { active: true } })));
        await expect.poll(async () => (await sceneSnapshot(page))?.renderedFrames ?? 0).toBeGreaterThan(paused!.renderedFrames);
        await tab(page, 'add');
        expect(await sceneSnapshot(page)).toBeNull();
        await expect(page.locator('canvas')).toHaveCount(0);
        await tab(page, 'sandbox');
        await readyScene(page);
        await expect(page.locator('canvas')).toHaveCount(1);
      });

      test('keeps model selection, manual door checking and declaring departure independent', async ({ page }) => {
        await tab(page, 'sandbox');
        await readyScene(page);
        await page.locator('[data-sandbox-action="object"][data-object-id="entry_door"]').click();
        await expect(page.locator('#sandbox-object-detail')).toHaveAttribute('data-object-state', 'unknown');
        await page.locator('[data-sandbox-tab="tasks"]').click();
        await action(page, 'plan').click();
        await expect(page.locator('#sandbox-manual-state')).toContainText('待人工检查');
        await action(page, 'manual-door').click();
        await expect(page.locator('#sandbox-manual-state')).toContainText('已人工确认关闭');
        await expect(page.locator('#sandbox-away-state')).toContainText('尚未声明');
        await action(page, 'scene-reset').click();
        await expect(page.locator('#sandbox-manual-state')).toContainText('已人工确认关闭');
        await expect(page.locator('#sandbox-away-state')).toContainText('尚未声明');
        await page.locator('[data-sandbox-tab="devices"]').click();
        await page.locator('[data-sandbox-action="object"][data-object-id="entry_door"]').click();
        await expect(page.locator('#sandbox-object-detail')).toHaveAttribute('data-object-state', 'closed');
        await page.locator('[data-sandbox-tab="tasks"]').click();
        await action(page, 'user-away').click();
        await expect(page.locator('#sandbox-away-state')).toContainText('本人已出门');
        await expect(action(page, 'user-away')).toBeDisabled();
        await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-lamp-state', 'on');
      });

      test('recovers from a failed model load while furniture remains available', async ({ page }) => {
        let failed = false;
        await page.route(/\.glb(?:\?|$)/, (route) => {
          if (route.request().resourceType() === 'script') return route.continue();
          if (!failed) { failed = true; return route.abort(); }
          return route.continue();
        });
        await tab(page, 'sandbox');
        await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-scene-state', 'error', { timeout: 20_000 });
        expect(failed).toBe(true);
        await expect(page.locator('[data-sandbox-action="detail"][data-furniture-id]')).toHaveCount(furniture.length);
        await page.locator('[data-sandbox-action="detail"][data-furniture-id="light-1"]').click();
        await expect(page.locator('#sandbox-device-detail')).toContainText('Lamp L01');
        await action(page, 'retry-scene').click();
        await readyScene(page);
        await expect(page.locator('#sandbox-device-detail')).toContainText('Lamp L01');
      });

      test('discards a model load that finishes after leaving the sandbox', async ({ page }) => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        let intercepted = false;
        await page.route(/\.glb(?:\?|$)/, async (route) => {
          if (route.request().resourceType() === 'script') { await route.continue(); return; }
          if (!intercepted) { intercepted = true; await gate; }
          await route.continue().catch(() => {});
        });
        await tab(page, 'sandbox');
        await expect.poll(() => intercepted).toBe(true);
        await tab(page, 'add');
        release();
        await expect(page.locator('#sandbox-root, canvas')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: '我的家具', exact: true })).toBeVisible();
        await tab(page, 'sandbox');
        await readyScene(page);
        await expect(page.locator('canvas')).toHaveCount(1);
        await tab(page, 'account');
        await expect(page.locator('canvas')).toHaveCount(0);
      });
    }
  });
}
