import { roomLabel } from '../i18n';
import { icon } from '../icons';
import { sandboxText as s, sandboxEscape as escape } from './sandbox-copy';

/** Local presentation states only; this is not the future model/runtime API. */
export type SandboxSceneState = 'placeholder' | 'loading' | 'error';

function apartmentIllustration(): string {
  return `<svg class="sb-floorplan" viewBox="0 0 360 248" fill="none" aria-hidden="true">
    <ellipse cx="181" cy="221" rx="147" ry="17" fill="#74816a" opacity=".12"/>
    <path d="M29 57 154 17 329 65 329 192 192 235 29 185Z" fill="#c5cfb6"/>
    <path d="m29 57 163 47 137-39v119l-137 43-163-48Z" fill="#f7f5e9"/>
    <path d="m29 57 125-40 175 48-137 39Z" fill="#e3e8d6"/>
    <path d="m29 57 125-40 175 48v16L154 34 29 74Z" fill="#b7c5a9"/>
    <path d="m29 57 163 47v17L29 74Z" fill="#d5dec7"/>
    <path d="M29 74v105l163 48v-17L45 167V79Z" fill="#e0e5d5"/>
    <path d="M329 81v103l-137 43v-17l122-38V85Z" fill="#a8b99b"/>
    <path d="m156 86 2 74 60 17m-60-17-68 22m67-60 108-32" stroke="#b5c2a8" stroke-width="9"/>
    <path d="m155 80 2 73 61 17m-61-17-67 22m66-60 108-32" stroke="#f8f7ee" stroke-width="6"/>
    <path d="m70 107 40 11v31l-40-12Z" fill="#8da47e"/><path d="m61 125 56 16v17l-56-17Z" fill="#6f8a63"/>
    <path d="m65 105 12 4v35l-12-4Zm39 11 12 4v35l-12-4Z" fill="#9daf8c"/>
    <path d="m95 158 27-8 24 7-27 8Z" fill="#d1ba8c"/><path d="m95 158 24 7v7l-24-7Z" fill="#c1a778"/>
    <path d="m203 116 47-14 35 10v29l-47 15-35-11Z" fill="#d9d5c2"/><path d="m203 116 35 11 47-15v12l-47 15-35-11Z" fill="#fbf9ee"/>
    <path d="m209 119 11 3 13-4-11-3Zm16 5 11 3 13-4-11-3Z" fill="#b9c8a9"/>
    <path d="m249 56 39 11-23 7-39-11Z" fill="#c4ceba"/><path d="m234 59 22 6" stroke="#93a382" stroke-width="2"/>
    <path d="m95 57 35-11 23 6-35 11Z" fill="#c6d2bc"/><path d="m101 57 23-7 13 4-23 7Z" fill="#e9eee1"/>
    <path d="m224 188 41-13" stroke="#8da37b" stroke-width="4" stroke-linecap="round"/>
    <circle cx="50" cy="99" r="10" fill="#d1dcbc"/><path d="M50 99v19" stroke="#7d9467" stroke-width="3"/>
    <g font-family="sans-serif" font-size="9" fill="#52694a" text-anchor="middle">
      <text x="110" y="97">${escape(roomLabel('客厅'))}</text><text x="235" y="98">${escape(roomLabel('房间1'))}</text>
      <text x="185" y="192">${escape(roomLabel('玄关'))}</text><text x="270" y="166">${escape(roomLabel('阳台'))}</text>
    </g>
  </svg>`;
}

export function renderSandboxScene(state: SandboxSceneState = 'placeholder'): string {
  if (state === 'loading') return `<div class="sb-scene-message" role="status"><span class="sb-loading-ring" aria-hidden="true"></span><h3>${s('正在加载场景')}</h3><p>${s('请稍候，正在准备家庭模型。')}</p></div>`;
  if (state === 'error') return `<div class="sb-scene-message" role="status">${icon('info')}<h3>${s('场景未能加载')}</h3><p>${s('设备列表和演示任务仍可使用，请重试。')}</p><button class="sb-small-button" data-sandbox-action="retry-scene">${s('重试')}</button></div>`;
  return `${apartmentIllustration()}<div class="sb-scene-caption"><strong>${s('3D 场景待接入')}</strong><p>${s('这里将展示你的家庭模型，目前为示意图。')}</p></div>`;
}

/** Future GLB renderer mounts here. Calls after dispose are ignored. No runtime contract is imposed. */
export function mountSandboxScene(container: HTMLElement) {
  let disposed = false;
  const show = (state: SandboxSceneState) => {
    if (disposed) return;
    container.dataset.sceneState = state;
    container.setAttribute('aria-busy', String(state === 'loading'));
    container.innerHTML = renderSandboxScene(state);
  };
  show('placeholder');
  return { show, dispose: () => { disposed = true; container.replaceChildren(); } };
}
