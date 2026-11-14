import { expect, test, type Page } from '@playwright/test';

const furniture = [
  { id: 'shared-lamp', name: '本机阅读灯', type: 'light', room: '客厅', model: 'Lamp 01', notes: '始终保留本机房间和名称' },
  { id: 'shared-curtain', name: '本机窗帘', type: 'cover', room: '房间2', model: 'Curtain 01', notes: '' },
  { id: 'legacy-desk', name: '旧书桌', type: 'table', room: '旧书房', model: '', notes: '' },
].map(item => ({ ...item, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }));
const household = { version: 1, session: { username: 'aaaa' }, furniture, settings: { nickname: '三户型住户', defaultRoom: '客厅' } };
const originalLink = JSON.stringify({ version: 1, template_id: 'baseline_apartment', objects: { living_room_light: 'shared-lamp' } });
const templates = [
  { layout: 'two_bedroom', template: 'generic_two_bedroom', file: '两房一厅.glb', rooms: 8 },
  { layout: 'three_bedroom', template: 'generic_three_bedroom', file: '三房两厅.glb', rooms: 10 },
];
const root = (page: Page) => page.locator('#sandbox-root');
const action = (page: Page, id: string) => root(page).locator(`[data-sandbox-action="${id}"]`);
const registered = (page: Page) => page.locator('#sandbox-panel [data-sandbox-action="detail"][data-furniture-id]');
const sceneDevices = (page: Page) => page.locator('#sandbox-panel [data-sandbox-action="object"][data-object-id]');
const tab = (page: Page, id: string) => page.locator(`.bottom-nav [data-tab="${id}"]`).click();
const storage = (page: Page, key = 'homing.app.v1') => page.evaluate(key => localStorage.getItem(key), key);

async function snapshot(page: Page): Promise<{ active: boolean; renderedFrames: number; selected: string | null; emissive: number } | null> {
  return page.evaluate(async () => {
    const modulePath = '/src/features/sandbox.ts';
    const { inspectSandboxScene } = await import(modulePath);
    const container = document.querySelector('#main-content');
    return container ? inspectSandboxScene(container) ?? null : null;
  });
}

async function ready(page: Page) {
  await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-scene-state', 'ready', { timeout: 20_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(async () => (await snapshot(page))?.renderedFrames ?? 0).toBeGreaterThan(0);
}

async function choose(page: Page, id: string) {
  await page.locator('#sandbox-layout-trigger').click();
  await page.locator(`#sandbox-layout-options [data-layout-id="${id}"]`).click();
  await expect(root(page)).toHaveAttribute('data-layout-id', id);
  await expect(page.locator('#sandbox-layout-options')).toBeHidden();
}

async function mode(page: Page, value: 'home' | 'demo') {
  await action(page, value === 'home' ? 'demo-exit' : 'demo-enter').click();
  await expect(root(page)).toHaveAttribute('data-mode', value);
  if (value === 'demo') await page.locator('[data-sandbox-tab="devices"]').click();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    html: document.documentElement.scrollWidth <= innerWidth,
    body: document.body.scrollWidth <= innerWidth,
    panels: [...document.querySelectorAll('#sandbox-root, #sandbox-panel, #sandbox-layout-options')]
      .filter(element => element.clientWidth > 0)
      .every(element => element.scrollWidth <= element.clientWidth),
  }))).toEqual({ html: true, body: true, panels: true });
}

async function boundedLabels(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('#sandbox-scene-mount')!.getBoundingClientRect();
    const boxes = [...document.querySelectorAll<HTMLElement>('.homie-scene-hotspot')]
      .filter(element => !element.hidden && getComputedStyle(element).display !== 'none')
      .map(element => element.getBoundingClientRect());
    return boxes.every((box, index) => box.left >= stage.left - .5 && box.right <= stage.right + .5
      && box.top >= stage.top - .5 && box.bottom <= stage.bottom + .5
      && boxes.slice(index + 1).every(other => Math.min(box.right, other.right) - Math.max(box.left, other.left) <= .5
        || Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) <= .5));
  }), { message: 'nine-device labels remain within the viewport without overlap' }).toBe(true);
}

for (const width of [390, 360]) {
  test.describe(`${width}px three independent floor plans`, () => {
    test.use({ viewport: { width, height: 844 } });
    let errors: string[], nonLocal: string[], models: string[];

    test.beforeEach(async ({ page }) => {
      errors = []; nonLocal = []; models = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
          nonLocal.push(url.href); await route.abort(); return;
        }
        if (route.request().resourceType() !== 'script' && /\.glb(?:\?|$)/.test(url.href)) models.push(decodeURIComponent(url.pathname));
        await route.continue();
      });
      await page.goto('/');
      await page.evaluate(({ household, originalLink }) => {
        localStorage.clear();
        localStorage.setItem('homing.app.v1', JSON.stringify(household));
        localStorage.setItem('homie.sandbox.bindings.v1', originalLink);
      }, { household, originalLink });
      await page.reload();
    });

    test.afterEach(() => {
      expect(errors, 'no uncaught browser errors').toEqual([]);
      expect(nonLocal, 'model, scene and demo do not use external services').toEqual([]);
    });

    test('loads each delivered model, locates its rooms and devices, and keeps the home directory separate', async ({ page }) => {
      test.setTimeout(60_000);
      const originalHousehold = await storage(page);
      await tab(page, 'sandbox');
      await ready(page);
      await page.locator('#sandbox-layout-trigger').click();
      await expect(page.locator('#sandbox-layout-options [role="option"]')).toHaveCount(3);
      await noOverflow(page);
      await page.screenshot({ path: `artifacts/screenshots/three-layout-menu-zh-${width}.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');

      for (const item of templates) {
        await choose(page, item.layout);
        await ready(page);
        await expect(root(page)).toHaveAttribute('data-template', item.template);
        await mode(page, 'home');
        await expect(registered(page)).toHaveCount(furniture.length);
        await expect(sceneDevices(page)).toHaveCount(0);
        await expect(page.locator('.homie-scene-hotspot:visible')).toHaveCount(0);
        await expect(page.locator('#sandbox-room')).toBeVisible();
        const rooms = await page.locator('#sandbox-room option').evaluateAll(options => options
          .map(option => (option as HTMLOptionElement).value).filter(Boolean));
        expect(rooms).toHaveLength(item.rooms);
        expect(rooms).toContain('kitchen');
        await page.locator('#sandbox-room').selectOption('kitchen');
        await expect.poll(async () => (await snapshot(page))?.selected).toBe('kitchen');
        await expect(sceneDevices(page)).toHaveCount(0);
        await action(page, 'scene-reset').tap();
        await expect.poll(async () => (await snapshot(page))?.selected).toBeNull();
        await noOverflow(page);
        await page.screenshot({ path: `artifacts/screenshots/${item.layout}-home-zh-${width}.png`, animations: 'disabled' });

        await mode(page, 'demo');
        await expect(sceneDevices(page)).toHaveCount(9);
        await expect(registered(page)).toHaveCount(0);
        await expect(action(page, 'labels')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('.homie-scene-hotspot:visible')).toHaveCount(0);
        await noOverflow(page);
        await page.screenshot({ path: `artifacts/screenshots/${item.layout}-demo-clean-zh-${width}.png`, animations: 'disabled' });
        await action(page, 'labels').tap();
        await expect(action(page, 'labels')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.homie-scene-hotspot:visible').first()).toBeVisible();
        await boundedLabels(page);
        const hotspot = page.locator('.homie-scene-hotspot:visible').first();
        const pickedId = await hotspot.getAttribute('data-object-id');
        await hotspot.tap();
        await expect(page.locator('#sandbox-object-detail')).toHaveAttribute('data-object-id', pickedId!);
        await expect.poll(async () => (await snapshot(page))?.selected).toBe(pickedId);
        await page.locator('[data-sandbox-tab="devices"]').click();
        await page.locator('#sandbox-panel [data-sandbox-action="object"][data-object-id="washing_machine"]').tap();
        await expect(page.locator('#sandbox-object-detail')).toHaveAttribute('data-object-id', 'washing_machine');
        await expect(page.locator('#sandbox-object-detail [data-reading="program"]')).toContainText('洗涤程序');
        await expect(page.locator('#sandbox-object-detail [data-reading="remaining_minutes"]')).toContainText('剩余时间');
        await expect(page.locator('#sandbox-object-detail [data-reading="current_temperature_c"] dd')).not.toBeEmpty();
        await expect(page.locator('#sandbox-object-detail .sb-demo-badge')).toContainText('演示数据');
        await expect.poll(async () => (await snapshot(page))?.selected).toBe('washing_machine');
        await action(page, 'back').click();
        await action(page, 'scene-reset').tap();
        await expect.poll(async () => (await snapshot(page))?.selected).toBeNull();
        await boundedLabels(page);
        await noOverflow(page);
        await page.screenshot({ path: `artifacts/screenshots/${item.layout}-demo-zh-${width}.png`, animations: 'disabled' });
      }
      expect(models.some(path => path.endsWith('future-home-v0.1.glb'))).toBe(true);
      for (const item of templates) expect(models.some(path => path.endsWith(item.file)), item.file).toBe(true);
      expect(models.every(path => !path.includes('large-flat-128'))).toBe(true);
      expect(await storage(page)).toBe(originalHousehold);
      expect(await storage(page, 'homie.sandbox.bindings.v1')).toBe(originalLink);

      await tab(page, 'account');
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');
      await tab(page, 'sandbox');
      for (const item of templates) {
        await choose(page, item.layout); await ready(page);
        await expect(page.locator('#sandbox-layout-trigger')).not.toContainText(/两房一厅|三房两厅/);
        await expect(page.locator('#sandbox-room')).toHaveAccessibleName('Scene rooms');
        await mode(page, 'demo');
        await expect(sceneDevices(page)).toHaveCount(9);
        await expect(page.locator('#sandbox-panel')).not.toContainText(/洗衣机|冰箱|客厅灯/);
        await expect(action(page, 'labels')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('.homie-scene-hotspot:visible')).toHaveCount(0);
        await noOverflow(page);
        await page.screenshot({ path: `artifacts/screenshots/${item.layout}-demo-en-${width}.png`, animations: 'disabled' });
        await action(page, 'labels').tap();
        await expect(action(page, 'labels')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.homie-scene-hotspot:visible').first()).toBeVisible();
        await boundedLabels(page); await noOverflow(page);
        await page.screenshot({ path: `artifacts/screenshots/${item.layout}-labels-en-${width}.png`, animations: 'disabled' });
        await action(page, 'labels').tap();
        await expect(page.locator('.homie-scene-hotspot:visible')).toHaveCount(0);
      }
      await tab(page, 'add');
      await expect(page.locator('canvas, .homie-scene-hotspot')).toHaveCount(0);
      expect(await snapshot(page)).toBeNull();
      expect(await storage(page)).toBe(originalHousehold);
    });

    test('keeps explicit furniture links separate for every template and across re-entry', async ({ page }) => {
      const originalHousehold = await storage(page);
      await tab(page, 'sandbox'); await ready(page);
      const openLamp = async () => {
        await mode(page, 'home');
        await page.locator('#sandbox-panel [data-sandbox-action="detail"][data-furniture-id="shared-lamp"]').click();
      };
      const binding = page.locator('#sandbox-device-detail [data-sandbox-binding]');
      await openLamp(); await expect(binding).toHaveValue('living_room_light');
      await choose(page, 'two_bedroom'); await ready(page);
      await openLamp(); await expect(binding).toHaveValue('');
      await binding.selectOption('dining_room_light');
      await expect(binding).toHaveValue('dining_room_light');
      await page.locator('#sandbox-device-detail [data-sandbox-action="focus"]').click();
      await expect.poll(async () => (await snapshot(page))?.selected).toBe('dining_room_light');

      await choose(page, 'three_bedroom'); await ready(page);
      await openLamp(); await expect(binding).toHaveValue('');
      await binding.selectOption('living_room_light');
      await choose(page, 'two_bedroom'); await ready(page);
      await openLamp(); await expect(binding).toHaveValue('dining_room_light');
      await choose(page, 'one_bedroom'); await ready(page);
      await openLamp(); await expect(binding).toHaveValue('living_room_light');
      expect(await storage(page, 'homie.sandbox.bindings.v1')).toBe(originalLink);
      const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
      await tab(page, 'import');
      await expect(page.locator('canvas')).toHaveCount(0);
      await tab(page, 'sandbox'); await ready(page);
      for (const [id, object] of [['two_bedroom', 'dining_room_light'], ['three_bedroom', 'living_room_light']]) {
        await choose(page, id); await ready(page);
        await openLamp(); await expect(binding).toHaveValue(object);
      }
      expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
      expect(await storage(page)).toBe(originalHousehold);
    });

    if (width === 390) {
      test('keeps each new floor plan task and readback queue independent until leaving the sandbox', async ({ page }) => {
        test.setTimeout(60_000);
        const originalHousehold = await storage(page);
        const stage = page.locator('#sandbox-scene-mount');
        const tasks = async () => {
          await action(page, 'demo-enter').click();
          await page.locator('[data-sandbox-tab="tasks"]').click();
        };
        await tab(page, 'sandbox'); await ready(page);
        await choose(page, 'two_bedroom'); await ready(page); await tasks();
        await action(page, 'plan').tap();
        await page.locator('#sandbox-readback-order').selectOption('execution-first');
        await action(page, 'preview').tap();
        await expect(stage).toHaveAttribute('data-plan-highlight', 'true');
        await action(page, 'execute').tap();
        await expect(stage).toHaveAttribute('data-lamp-state', 'on');
        await expect(page.locator('#sandbox-execution-state')).toHaveText('等待中');

        await choose(page, 'three_bedroom'); await ready(page); await tasks();
        await expect(stage).toHaveAttribute('data-plan-highlight', 'false');
        await expect(stage).toHaveAttribute('data-lamp-state', 'on');
        await expect(action(page, 'plan')).toBeVisible();
        await expect(action(page, 'next-readback')).toHaveCount(0);
        await action(page, 'plan').tap();
        await page.locator('#sandbox-readback-order').selectOption('object-first');
        await action(page, 'execute').tap();
        await action(page, 'next-readback').tap();
        await expect(stage).toHaveAttribute('data-lamp-state', 'off');
        await expect.poll(async () => (await snapshot(page))?.emissive ?? -1).toBeLessThan(.001);
        await expect(page.locator('#sandbox-execution-state')).toHaveText('等待中');

        await choose(page, 'two_bedroom'); await ready(page); await tasks();
        await expect(stage).toHaveAttribute('data-lamp-state', 'on');
        await expect(stage).toHaveAttribute('data-plan-highlight', 'true');
        await expect(page.locator('#sandbox-command-state')).toContainText('已受理');
        await expect(page.locator('#sandbox-execution-state')).toHaveText('等待中');
        await action(page, 'next-readback').tap();
        await expect(page.locator('#sandbox-execution-state')).toHaveText('已确认');
        await expect(stage).toHaveAttribute('data-lamp-state', 'on');
        await action(page, 'next-readback').tap();
        await expect(stage).toHaveAttribute('data-lamp-state', 'unknown');
        await action(page, 'next-readback').tap();
        await expect(stage).toHaveAttribute('data-lamp-state', 'off');
        await expect.poll(async () => (await snapshot(page))?.emissive ?? -1).toBeLessThan(.001);
        await expect(action(page, 'next-readback')).toBeDisabled();
        await action(page, 'manual-door').tap();
        await expect(page.locator('#sandbox-manual-state')).toContainText('已人工确认关闭');
        await expect(page.locator('#sandbox-away-state')).toContainText('尚未声明');
        await action(page, 'user-away').tap();
        await expect(page.locator('#sandbox-away-state')).toContainText('本人已出门');
        await action(page, 'scene-reset').tap();
        await expect(page.locator('#sandbox-command-state')).toContainText('已受理');
        await page.screenshot({ path: 'artifacts/screenshots/two-bedroom-execution-first-390.png', animations: 'disabled' });
        await action(page, 'demo-reset').tap();
        await expect(action(page, 'plan')).toBeVisible();
        await expect(stage).toHaveAttribute('data-lamp-state', 'on');

        await choose(page, 'three_bedroom'); await ready(page); await tasks();
        await expect(stage).toHaveAttribute('data-lamp-state', 'off');
        await expect(page.locator('#sandbox-execution-state')).toHaveText('等待中');
        await expect(page.locator('#sandbox-manual-state')).toContainText('待人工检查');
        await expect(page.locator('#sandbox-away-state')).toContainText('尚未声明');
        await action(page, 'next-readback').tap();
        await expect(page.locator('#sandbox-execution-state')).toHaveText('已确认');
        await expect(action(page, 'next-readback')).toBeDisabled();
        await page.screenshot({ path: 'artifacts/screenshots/three-bedroom-object-first-390.png', animations: 'disabled' });

        await tab(page, 'import');
        await expect(page.locator('canvas')).toHaveCount(0);
        await tab(page, 'sandbox'); await ready(page);
        for (const item of templates) {
          await choose(page, item.layout); await ready(page); await tasks();
          await expect(stage).toHaveAttribute('data-lamp-state', 'on');
          await expect(action(page, 'plan')).toBeVisible();
          await expect(action(page, 'next-readback')).toHaveCount(0);
        }
        expect(await storage(page)).toBe(originalHousehold);
        expect(await storage(page, 'homie.sandbox.bindings.v1')).toBe(originalLink);
      });

      test('cancels a superseded model load without replacing the newly selected scene', async ({ page }) => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let intercepted = false;
        await page.route(/\.glb(?:\?|$)/, async route => {
          const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
          if (route.request().resourceType() !== 'script' && pathname.endsWith('两房一厅.glb') && !intercepted) {
            intercepted = true; await gate;
          }
          await route.fallback().catch(() => {});
        });
        await tab(page, 'sandbox'); await ready(page);
        await choose(page, 'two_bedroom');
        await expect.poll(() => intercepted).toBe(true);
        await expect(page.locator('#sandbox-scene-mount')).toHaveAttribute('data-scene-state', 'loading');
        await choose(page, 'three_bedroom');
        await ready(page);
        release();
        await expect(root(page)).toHaveAttribute('data-template', 'generic_three_bedroom');
        await mode(page, 'demo');
        await expect(sceneDevices(page)).toHaveCount(9);
        await page.locator('#sandbox-room').selectOption('bedroom_guest');
        await expect.poll(async () => (await snapshot(page))?.selected).toBe('bedroom_guest');
        await expect(page.locator('canvas')).toHaveCount(1);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('homie:app-state', { detail: { active: false } })));
        const paused = await snapshot(page);
        expect(paused?.active).toBe(false);
        await page.waitForTimeout(150);
        expect((await snapshot(page))?.renderedFrames).toBe(paused?.renderedFrames);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('homie:app-state', { detail: { active: true } })));
        await expect.poll(async () => (await snapshot(page))?.renderedFrames ?? 0).toBeGreaterThan(paused!.renderedFrames);
        await tab(page, 'add');
        await expect(page.locator('canvas, .homie-scene-hotspot')).toHaveCount(0);
        expect(await snapshot(page)).toBeNull();
        await tab(page, 'sandbox'); await ready(page);
        await choose(page, 'two_bedroom'); await ready(page);
        await expect(root(page)).toHaveAttribute('data-template', 'generic_two_bedroom');
        await expect(page.locator('canvas')).toHaveCount(1);
      });
    }
  });
}
