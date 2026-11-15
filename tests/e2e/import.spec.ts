import { expect, test, type Page } from '@playwright/test';

const savedState = {
  version: 1,
  session: { username: 'aaaa' },
  furniture: [{
    id: 'existing-lamp', name: '我的阅读灯', type: 'light', room: '客厅', model: 'Lamp 01', notes: '保留原始记录',
    createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
  }],
  settings: { nickname: '路演住户', defaultRoom: '客厅' },
};

const storedData = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const tab = (page: Page, id: string) => page.locator(`.bottom-nav [data-tab="${id}"]`).click();

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    form: document.querySelector('#import-form')!.clientWidth,
    content: document.querySelector('#import-form')!.scrollWidth,
  }));
  expect(sizes.html).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.content).toBeLessThanOrEqual(sizes.form);
}

for (const width of [390, 360]) {
  test.describe(`${width}px roadshow API import`, () => {
    test.use({ viewport: { width, height: 844 } });
    let runtimeErrors: string[];
    let externalRequests: string[];

    test.beforeEach(async ({ page }) => {
      runtimeErrors = [];
      externalRequests = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) {
          externalRequests.push(url.href);
          await route.abort();
        } else await route.continue();
      });
      await page.goto('/');
      await page.evaluate((state) => {
        localStorage.clear();
        localStorage.setItem('homing.app.v1', JSON.stringify(state));
      }, savedState);
      await page.reload();
      await tab(page, 'import');
    });

    test.afterEach(() => {
      expect(runtimeErrors).toEqual([]);
      expect(externalRequests, 'the roadshow page must never request an API endpoint').toEqual([]);
    });

    test('validates addresses without connecting, importing, or persisting input', async ({ page }) => {
      const initialData = await storedData(page);
      const endpoint = page.getByLabel('API 接口地址', { exact: true });
      const key = page.getByLabel('接口密钥（选填）', { exact: true });
      const submit = page.getByRole('button', { name: '导入家具', exact: true });
      await expect(page.getByRole('heading', { name: 'API 接入', exact: true })).toBeVisible();
      await expect(key).toHaveAttribute('type', 'password');
      await expect(page.locator('#import-root')).toContainText('本页仅作路演展示，不会连接接口，也不会导入或修改家具。');

      for (const invalid of ['', 'api.example.com/devices', 'ftp://example.com/api', 'https://']) {
        await endpoint.fill(invalid);
        await submit.click();
        await expect(page.locator('#import-error')).toHaveText('请填写有效的 HTTP 或 HTTPS 接口地址。');
        await expect(endpoint).toHaveAttribute('aria-invalid', 'true');
        await expect(endpoint).toBeFocused();
        await expect(page.locator('#import-feedback')).toBeHidden();
      }

      await endpoint.fill('https://example.com/api/devices');
      await key.fill('roadshow-only-example-key');
      await submit.click();
      await expect(page.locator('#import-error')).toBeEmpty();
      await expect(endpoint).not.toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#import-feedback')).toHaveText('路演演示，未连接接口，也未导入家具。');
      expect(await storedData(page)).toEqual(initialData);
      await noOverflow(page);
      await page.screenshot({ path: `artifacts/screenshots/import-roadshow-${width}.png`, fullPage: true, animations: 'disabled' });

      await tab(page, 'add');
      await expect(page.getByRole('button', { name: '查看我的阅读灯', exact: true })).toBeVisible();
      await tab(page, 'import');
      await expect(endpoint).toBeEmpty();
      await expect(key).toBeEmpty();
      await expect(page.locator('#import-feedback')).toBeHidden();
      await endpoint.fill('http://192.168.1.20:8123/api');
      await submit.click();
      await expect(page.locator('#import-feedback')).toBeVisible();
      expect(await storedData(page)).toEqual(initialData);
      await page.reload();
      await tab(page, 'import');
      await expect(endpoint).toBeEmpty();
      await expect(key).toBeEmpty();
      expect(await storedData(page)).toEqual(initialData);
    });

    test('shows English feedback and clears the form on system back', async ({ page }) => {
      await tab(page, 'account');
      await page.getByLabel('界面语言', { exact: true }).selectOption('en');
      await tab(page, 'import');
      const initialData = await storedData(page);
      const endpoint = page.getByLabel('API endpoint URL', { exact: true });
      const key = page.getByLabel('API key (optional)', { exact: true });
      await expect(page.getByRole('heading', { name: 'API setup', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Import furniture', exact: true }).click();
      await expect(page.locator('#import-error')).toHaveText('Enter a valid HTTP or HTTPS endpoint URL.');
      await endpoint.fill('https://example.com/api/devices');
      await key.fill('english-demo-key');
      await page.getByRole('button', { name: 'Import furniture', exact: true }).click();
      await expect(page.locator('#import-feedback')).toHaveText('Roadshow demo: no API was connected and no furniture was imported.');
      await noOverflow(page);
      await page.screenshot({ path: `artifacts/screenshots/import-roadshow-en-${width}.png`, fullPage: true, animations: 'disabled' });
      await page.evaluate(() => window.dispatchEvent(new Event('homing:back', { cancelable: true })));
      await expect(page.getByRole('heading', { name: 'My furniture', exact: true })).toBeVisible();
      await tab(page, 'import');
      await expect(endpoint).toBeEmpty();
      await expect(key).toBeEmpty();
      await expect(page.locator('#import-feedback')).toBeHidden();
      expect(await storedData(page)).toEqual(initialData);
    });
  });
}
