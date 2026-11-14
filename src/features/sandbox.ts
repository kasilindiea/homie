import './sandbox.css';
import { ALL_FURNITURE_TYPES, type Furniture } from '../domain';
import { icon } from '../icons';
import { getLocale, roomLabel, t } from '../i18n';
import { sandboxText as s, sandboxEscape as escape } from './sandbox-copy';
import { getDemoReading, type DemoReading } from './sandbox-demo';
import { mountSandboxScene, renderSandboxScene } from './sandbox-scene';

/** Stable handoff boundary. The existing store remains the only furniture catalogue. */
export interface SandboxContext {
  getFurniture(): readonly Furniture[];
  navigateToFurniture(): void;
}

type Panel = 'devices' | 'tasks';
const mounted = new WeakMap<HTMLElement, () => void>();
const typeLabel = (type: string) => t(ALL_FURNITURE_TYPES.find((entry) => entry.value === type)?.label ?? '其他');
function demoBadge(): string { return `<span class="sb-demo-badge">${s('演示数据')}</span>`; }

export function renderSandbox(): string {
  return `<div class="sandbox-shell" id="sandbox-root">
    <header class="page-header sb-header"><div><p class="eyebrow">${s('未来家庭')}</p><h1>${t('沙盒')}</h1></div><span class="sb-layout-badge">${s('布局演示')}</span></header>
    <section class="sb-scene-card" aria-labelledby="sandbox-scene-title">
      <div class="sb-scene-heading"><div><span class="sb-overline">01 / HOMIE</span><h2 id="sandbox-scene-title">${s('离家检查')}</h2></div><button class="sb-reset-button" data-sandbox-unavailable disabled aria-describedby="sandbox-scene-hint">${icon('cube')}${s('全屋复位')}</button></div>
      <p class="sb-apartment-label">${s('固定小公寓 · 场景示意')}</p>
      <div id="sandbox-scene-mount" class="sb-scene-mount" data-scene-state="placeholder" aria-busy="false">${renderSandboxScene()}</div>
      <p class="sb-scene-hint" id="sandbox-scene-hint">${s('模型与设备定位尚未接入，复位暂不可用。')}</p>
    </section>
    <aside class="sb-demo-notice">${icon('info')}<div>${demoBadge()}<p>${s('下方数值均为固定示例，不代表真实检测或设备读数。')}</p></div></aside>
    <section class="sb-dock" aria-label="${s('离家检查')}"><div class="sb-dock-handle" aria-hidden="true"></div>
      <div class="sb-tabs" role="tablist" aria-label="${s('离家检查')}">
        <button id="sandbox-devices-tab" data-sandbox-tab="devices" role="tab" aria-controls="sandbox-panel" aria-selected="true">${s('设备')}<span id="sandbox-device-count">0</span></button>
        <button id="sandbox-tasks-tab" data-sandbox-tab="tasks" role="tab" aria-controls="sandbox-panel" aria-selected="false" tabindex="-1">${s('离家任务')}</button>
      </div><div id="sandbox-panel" role="tabpanel" aria-labelledby="sandbox-devices-tab"></div>
    </section></div>`;
}

function metricLabels(reading: DemoReading): [string, string] {
  if (reading.mode === 'generation') return ['24 小时发电量', '当前发电功率'];
  if (reading.mode === 'charge') return ['24 小时充电量', '当前充电功率'];
  return ['24 小时用电量', '当前功率'];
}
function stateLabel(reading: DemoReading): string {
  if (reading.isOn === null) return s('不适用');
  if (!reading.isOn) return s('关闭');
  return s(reading.mode === 'charge' ? '充电中' : reading.mode === 'generation' ? '发电中' : '开启');
}
function number(value: number): string { return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value); }
function energyValue(reading: DemoReading): string { return reading.energyKwh === null ? '—' : `${number(reading.energyKwh)} <small>kWh</small>`; }
function powerValue(reading: DemoReading): string {
  if (reading.powerW === null) return '—';
  return reading.powerW >= 1000 ? `${number(reading.powerW / 1000)} <small>kW</small>` : `${number(reading.powerW)} <small>W</small>`;
}
function metrics(reading: DemoReading): string {
  const [energy, power] = metricLabels(reading);
  return `<dl class="sb-metrics"><div><dt>${s(energy)}</dt><dd>${energyValue(reading)}</dd></div><div><dt>${s(power)}</dt><dd>${powerValue(reading)}</dd></div><div><dt>${s('开启状态')}</dt><dd class="sb-power-state${reading.isOn ? ' is-on' : ''}"><span aria-hidden="true"></span>${stateLabel(reading)}</dd></div></dl>`;
}
function deviceList(furniture: readonly Furniture[]): string {
  if (!furniture.length) return `<div class="sb-empty">${icon('cube')}<h3>${s('还没有已登记的家具')}</h3><p>${s('在“添加”页登记的家具会显示在这里。沙盒用于查看和检查。')}</p></div>`;
  return `<p class="sb-list-caption">${s('已登记 {count} 件', { count: furniture.length })}</p><div class="sb-device-list">${furniture.map((item) => {
    const reading = getDemoReading(item.type);
    return `<button class="sb-device-card" data-sandbox-action="detail" data-furniture-id="${escape(item.id)}" aria-label="${escape(s('查看 {name} 的沙盒详情', { name: item.name }))}">
      <span class="sb-device-heading"><span class="sb-device-icon">${icon(item.type)}</span><span class="sb-device-name"><strong>${escape(item.name)}</strong><span>${escape(roomLabel(item.room))} · ${escape(typeLabel(item.type))}</span></span>${icon('chevron', 'sb-device-chevron')}</span>
      ${metrics(reading)}<span class="sb-card-foot">${demoBadge()}<span>${s('查看详情')}</span></span></button>`;
  }).join('')}</div>`;
}
function deviceDetail(item: Furniture): string {
  const reading = getDemoReading(item.type);
  const [energy, power] = metricLabels(reading);
  const contextNote = reading.mode === 'charge' ? '当前为充电场景示例，不代表设备总容量或剩余电量。' : reading.mode === 'generation' ? '此处为发电示例，发电量与家庭用电量分开显示。' : reading.mode === 'not-applicable' ? '这类历史家具保留登记信息，不提供用电示例。' : '';
  const date = new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(item.createdAt));
  return `<article id="sandbox-device-detail" class="sb-detail" data-furniture-id="${escape(item.id)}">
    <button class="sb-back-button" data-sandbox-action="back">${icon('arrow')}${s('返回设备列表')}</button>
    <div class="sb-detail-heading"><span class="sb-device-icon">${icon(item.type)}</span><div><p>${s('家具详情')}</p><h3 tabindex="-1">${escape(item.name)}</h3><span>${escape(roomLabel(item.room))} · ${escape(typeLabel(item.type))}</span></div></div>
    <section class="sb-reading-block" aria-label="${s('运行概览')}"><div class="sb-reading-title"><h4>${s('运行概览')}</h4>${demoBadge()}</div>
      <dl class="sb-detail-readings"><div><dt>${s(energy)}</dt><dd>${energyValue(reading)}</dd></div><div><dt>${s(power)}</dt><dd>${powerValue(reading)}</dd></div><div><dt>${s('开启状态')}</dt><dd>${stateLabel(reading)}</dd></div>${reading.batteryPercent === undefined ? '' : `<div><dt>${s('演示电量')}</dt><dd>${number(reading.batteryPercent)} <small>%</small></dd></div>`}</dl>
      ${contextNote ? `<p class="sb-detail-note">${s(contextNote)}</p>` : ''}<p class="sb-detail-note">${s('下方数值均为固定示例，不代表真实检测或设备读数。')}</p>
    </section>
    <section class="sb-registration" aria-label="${s('登记信息')}"><h4>${s('登记信息')}</h4><dl><div><dt>${t('品牌 / 型号')}</dt><dd>${escape(item.model || t('暂未填写'))}</dd></div><div><dt>${t('添加日期')}</dt><dd>${escape(date)}</dd></div><div><dt>${s('场景关联')}</dt><dd>${s('尚未映射')}</dd></div>${item.notes ? `<div class="sb-notes-row"><dt>${t('备注')}</dt><dd>${escape(item.notes)}</dd></div>` : ''}</dl><p class="sb-source-label">${s('数据来源')}：${s('本机家具记录 + 固定演示读数')}</p></section>
    <div class="sb-future-actions"><button class="sb-small-button" data-sandbox-unavailable disabled>${icon('location')}${s('定位家具')}</button><button class="sb-small-button" data-sandbox-unavailable disabled>${s('设备控制待接入')}</button></div><p class="sb-detail-note">${s('模型定位和设备控制将在后续接入。当前无法执行。')}</p>
  </article>`;
}
function tasks(): string {
  return `<div class="sb-tasks"><div class="sb-task-intro"><strong>${s('演示任务 · 尚未接入')}</strong><p>${s('任务用于预览离家流程，当前不会执行检查或控制设备。')}</p></div>
    <article class="sb-task-card"><span class="sb-task-number">01</span><div><h3>${s('玄关门 · 人工检查')}</h3><span class="sb-pending">${s('待人工检查')}</span><p>${s('普通门需要人工确认；模型定位不代表检查完成。')}</p><div class="sb-future-actions"><button class="sb-small-button" data-sandbox-unavailable disabled>${s('定位玄关')}</button><button class="sb-small-button" data-sandbox-unavailable disabled>${s('人工检查')}</button></div></div></article>
    <article class="sb-task-card"><span class="sb-task-number">02</span><div><h3>${s('客厅灯 · 关灯计划')}</h3><span class="sb-pending">${s('计划未接入')}</span><p>${s('后续将高亮计划涉及的灯具；预览计划不会改变设备状态。')}</p><button class="sb-small-button" data-sandbox-unavailable disabled>${s('查看关灯计划')}</button></div></article>
    <article class="sb-feedback-card"><h3>${s('执行反馈')}</h3><dl><div><dt>${s('指令受理')}</dt><dd>${s('尚未接入')}</dd></div><div><dt>${s('有效设备读数')}</dt><dd>${s('尚未接入')}</dd></div></dl><p>${s('只有收到有效设备读数后，场景才会更新灯光。')}</p></article>
  </div>`;
}

/** No timers or live connection yet. Future renderers/subscriptions belong to this lifetime. */
export function mountSandbox(container: HTMLElement, context: SandboxContext): () => void {
  mounted.get(container)?.();
  const sceneElement = container.querySelector<HTMLElement>('#sandbox-scene-mount');
  const panel = container.querySelector<HTMLElement>('#sandbox-panel');
  if (!sceneElement || !panel) return () => {};
  const scene = mountSandboxScene(sceneElement);
  const lifetime = new AbortController();
  let activePanel: Panel = 'devices';
  let selectedId: string | null = null;
  let disposed = false;
  const paintPanel = () => {
    if (disposed) return;
    const furniture = context.getFurniture();
    const count = container.querySelector('#sandbox-device-count');
    if (count) count.textContent = String(furniture.length);
    container.querySelectorAll<HTMLButtonElement>('[data-sandbox-tab]').forEach((button) => {
      const selected = button.dataset.sandboxTab === activePanel;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `sandbox-${activePanel}-tab`);
    const item = selectedId ? furniture.find((entry) => entry.id === selectedId) : undefined;
    if (selectedId && !item) selectedId = null;
    panel.innerHTML = activePanel === 'tasks' ? tasks() : item ? deviceDetail(item) : deviceList(furniture);
  };
  const backToList = () => {
    const previousId = selectedId;
    selectedId = null; paintPanel();
    if (previousId) container.querySelector<HTMLButtonElement>(`[data-sandbox-action="detail"][data-furniture-id="${CSS.escape(previousId)}"]`)?.focus({ preventScroll: true });
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || target.disabled || !container.contains(target)) return;
    const nextPanel = target.dataset.sandboxTab;
    if (nextPanel === 'devices' || nextPanel === 'tasks') {
      activePanel = nextPanel; selectedId = null; paintPanel();
    } else if (target.dataset.sandboxAction === 'detail' && target.dataset.furnitureId) {
      selectedId = target.dataset.furnitureId; paintPanel();
      panel.querySelector<HTMLElement>('h3[tabindex]')?.focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'nearest' });
    } else if (target.dataset.sandboxAction === 'back') backToList();
  };
  const onBack = (event: Event) => { if (selectedId) { event.preventDefault(); backToList(); } };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selectedId) { event.preventDefault(); backToList(); return; }
    const tab = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-sandbox-tab]') : null;
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    activePanel = event.key === 'Home' ? 'devices' : event.key === 'End' ? 'tasks' : activePanel === 'devices' ? 'tasks' : 'devices';
    selectedId = null; paintPanel();
    container.querySelector<HTMLButtonElement>(`[data-sandbox-tab="${activePanel}"]`)?.focus();
  };
  container.addEventListener('click', onClick, { signal: lifetime.signal });
  container.addEventListener('homie:sandbox-back', onBack, { signal: lifetime.signal });
  container.addEventListener('keydown', onKey, { signal: lifetime.signal });
  paintPanel();
  const cleanup = () => {
    if (disposed) return;
    disposed = true; lifetime.abort(); scene.dispose();
    if (mounted.get(container) === cleanup) mounted.delete(container);
  };
  mounted.set(container, cleanup);
  return cleanup;
}
