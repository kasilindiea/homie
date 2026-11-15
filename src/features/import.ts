import './import.css';
import { icon } from '../icons';
import { getLocale, t } from '../i18n';

const tx = (zh: string, en: string) => getLocale() === 'en' ? en : zh;
const mounted = new WeakMap<HTMLElement, () => void>();

/** Roadshow-only form. It deliberately has no network or furniture-store dependency. */
export function renderImport(): string {
  return `<div class="import-shell" id="import-root">
    <header class="page-header"><div><p class="eyebrow">${tx('接入更多生活可能', 'MORE WAYS TO FEEL AT HOME')}</p><h1>${t('导入')}</h1></div></header>
    <section class="import-intro" aria-labelledby="import-title">
      <span class="import-intro-icon" aria-hidden="true">${icon('import')}</span>
      <span class="import-demo-badge">${tx('路演演示', 'Roadshow demo')}</span>
      <h2 id="import-title">${tx('让设备，来到你的家', 'Make room for your devices')}</h2>
      <p>${tx('填写 API 接口，预览家具导入流程。', 'Enter an API endpoint to preview the furniture import flow.')}</p>
    </section>
    <form id="import-form" class="import-form" novalidate autocomplete="off" aria-labelledby="import-form-title">
      <div class="import-form-heading"><h2 id="import-form-title">${tx('API 接入', 'API setup')}</h2><span>01</span></div>
      <label class="field-label" for="import-api-url">${tx('API 接口地址', 'API endpoint URL')}</label>
      <input class="plain-input" id="import-api-url" name="apiUrl" type="url" inputmode="url" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="https://example.com/api/devices" aria-describedby="import-url-hint import-error" required />
      <p class="field-hint" id="import-url-hint">${tx('请输入以 http:// 或 https:// 开头的完整地址。', 'Use a complete address starting with http:// or https://.')}</p>
      <label class="field-label" for="import-api-key">${tx('接口密钥（选填）', 'API key (optional)')}</label>
      <input class="plain-input" id="import-api-key" name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="${tx('输入接口密钥', 'Enter an API key')}" aria-describedby="import-key-hint" />
      <p class="field-hint" id="import-key-hint">${tx('仅用于演示填写，离开此页后清空。', 'For this form preview only. Cleared when you leave this page.')}</p>
      <div class="import-demo-note">${icon('shield')}<p>${tx('本页仅作路演展示，不会连接接口，也不会导入或修改家具。', 'This is a roadshow preview. It does not connect to APIs or import or change furniture.')}</p></div>
      <p class="form-error" id="import-error" role="alert"></p>
      <button class="button button-primary import-submit" type="submit" data-import-action="preview">${tx('导入家具', 'Import furniture')}${icon('arrow')}</button>
      <p class="import-feedback" id="import-feedback" role="status" aria-live="polite" hidden></p>
    </form>
  </div>`;
}

export function mountImport(container: HTMLElement): () => void {
  mounted.get(container)?.();
  const form = container.querySelector<HTMLFormElement>('#import-form');
  if (!form) return () => {};
  const urlInput = form.querySelector<HTMLInputElement>('#import-api-url')!;
  const keyInput = form.querySelector<HTMLInputElement>('#import-api-key')!;
  const error = form.querySelector<HTMLElement>('#import-error')!;
  const feedback = form.querySelector<HTMLElement>('#import-feedback')!;
  const lifetime = new AbortController();

  const clearFeedback = () => {
    error.textContent = '';
    urlInput.removeAttribute('aria-invalid');
    feedback.hidden = true;
    feedback.textContent = '';
  };

  form.addEventListener('input', clearFeedback, { signal: lifetime.signal });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearFeedback();
    const value = urlInput.value.trim();
    let valid = false;
    try {
      const url = new URL(value);
      valid = /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch { /* Show the inline validation message below. */ }
    if (!valid) {
      error.textContent = tx('请填写有效的 HTTP 或 HTTPS 接口地址。', 'Enter a valid HTTP or HTTPS endpoint URL.');
      urlInput.setAttribute('aria-invalid', 'true');
      urlInput.focus();
      return;
    }
    // Validate syntax only: never request the endpoint or pass the key to a runtime.
    feedback.textContent = tx('路演演示，未连接接口，也未导入家具。', 'Roadshow demo: no API was connected and no furniture was imported.');
    feedback.hidden = false;
  }, { signal: lifetime.signal });

  const cleanup = () => {
    lifetime.abort();
    urlInput.value = '';
    keyInput.value = '';
    if (mounted.get(container) === cleanup) mounted.delete(container);
  };
  mounted.set(container, cleanup);
  return cleanup;
}
