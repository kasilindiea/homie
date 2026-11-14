import type { Furniture } from '../domain';
import { icon } from '../icons';
import { t } from '../i18n';

/** Stable handoff boundary for the future sandbox implementation. */
export interface SandboxContext {
  getFurniture(): readonly Furniture[];
  navigateToFurniture(): void;
}

/** Keep this placeholder until the separate sandbox feature is ready. */
export function renderSandbox(): string {
  return `<header class="page-header"><div><p class="eyebrow">${t('给想象一点空间')}</p><h1>${t('沙盒')}</h1></div><span class="header-logo">${icon('home')}</span></header>
    <section class="placeholder-page"><div class="placeholder-visual sandbox-visual"><span class="placeholder-orbit orbit-one"></span><span class="placeholder-orbit orbit-two"></span><span class="placeholder-main-icon">${icon('cube')}</span><span class="placeholder-star">✦</span></div><span class="coming-badge">${t('正在留白，等待更多可能')}</span><h2>${t('为想象，留一点空间')}</h2><p>${t('沙盒空间将在后续版本开放。')}<br />${t('先添加家具，慢慢准备你的理想之家。')}</p><button class="button button-outline" data-sandbox-add>${t('去添加家具')}${icon('arrow')}</button></section>`;
}

/** Mount events or a future renderer here; return cleanup for tab switches. */
export function mountSandbox(container: HTMLElement, context: SandboxContext): () => void {
  const button = container.querySelector<HTMLButtonElement>('[data-sandbox-add]');
  const navigate = () => context.navigateToFurniture();
  button?.addEventListener('click', navigate);
  return () => button?.removeEventListener('click', navigate);
}
