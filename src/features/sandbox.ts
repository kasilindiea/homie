import './sandbox.css';
import { ALL_FURNITURE_TYPES, type Furniture, type StorageAdapter } from '../domain';
import { icon } from '../icons';
import { getLocale, roomLabel, t } from '../i18n';
import { sandboxText as s, sandboxEscape as escape } from './sandbox-copy';
import { getDemoReading, type DemoReading } from './sandbox-demo';
import { renderSandboxScene } from './sandbox-scene';
import { createSandboxSession, sceneMapping, type SandboxSession } from './sandbox-runtime/session';
import { BINDABLE_OBJECTS, readBindings, saveBinding, type Bindings } from './sandbox-runtime/bindings';
import type { HomeScene } from './sandbox-runtime/scene';

export interface SandboxContext { getFurniture(): readonly Furniture[]; navigateToFurniture(): void; }
const mounted = new WeakMap<HTMLElement, () => void>();
const sceneReaders = new WeakMap<HTMLElement, () => ReturnType<HomeScene['inspect']> | undefined>();
/** Read-only lifecycle diagnostics, without commands or a global browser hook. */
export const inspectSandboxScene = (container: HTMLElement) => sceneReaders.get(container)?.();
const tx = (zh: string, en: string) => getLocale() === 'en' ? en : zh;
const typeLabel = (type: string) => t(ALL_FURNITURE_TYPES.find(entry => entry.value === type)?.label ?? '其他');
const ids = ['entry_door', 'balcony_door', 'living_room_light', 'bedroom_ac'];
function objectName(id: string): string {
  return ({ entry_door: tx('玄关普通门', 'Entry door'), balcony_door: tx('阳台门磁', 'Balcony door sensor'), living_room_light: tx('客厅灯', 'Living room light'), bedroom_ac: tx('卧室空调', 'Bedroom AC'), home_battery: t('家庭储能'), entryway: t('玄关'), living_room: t('客厅'), bedroom: t('卧室'), balcony: t('阳台') } as Record<string, string>)[id] || id;
}
function objectStatus(id: string, state: string): string {
  return ({ on: s('开启'), off: s('关闭'), open: tx('打开', 'Open'), closed: id === 'entry_door' ? tx('人工已确认', 'Manually confirmed') : tx('已合上', 'Closed'), unknown: id === 'entry_door' ? s('待人工检查') : tx('状态未知', 'Unknown') } as Record<string, string>)[state] || tx('状态未知', 'Unknown');
}
const demoBadge = () => `<span class="sb-demo-badge">${s('演示数据')}</span>`;
const button = (action: string, label: string, disabled = false, extra = '') => `<button class="sb-small-button" data-sandbox-action="${action}" ${disabled ? 'disabled' : ''} ${extra}>${label}</button>`;
const backButton = () => `<button class="sb-back-button" data-sandbox-action="back">${icon('arrow')}${s('返回设备列表')}</button>`;

export function renderSandbox(): string {
  return `<div class="sandbox-shell" id="sandbox-root">
    <header class="page-header sb-header"><div><p class="eyebrow">${s('未来家庭')}</p><h1>${t('沙盒')}</h1></div><span class="sb-layout-badge">${tx('离线演示', 'Offline demo')}</span></header>
    <section class="sb-scene-card" aria-labelledby="sandbox-scene-title">
      <div class="sb-scene-heading"><div><span class="sb-overline">01 / Homie</span><h2 id="sandbox-scene-title">${s('离家检查')}</h2></div>${button('scene-reset', s('全屋复位'), true)}</div>
      <p class="sb-apartment-label">${tx('固定小公寓 · 演示户型', 'Small apartment · demo home')}</p>
      <div class="sb-room-nav" aria-label="${tx('场景房间', 'Scene rooms')}">${['entryway','living_room','bedroom','balcony'].map(id => button('focus', objectName(id), true, `data-object-id="${id}"`)).join('')}</div>
      <div id="sandbox-scene-mount" class="sb-scene-mount" data-scene-state="loading" data-lamp-state="on" data-plan-highlight="false" aria-busy="true"><div id="sandbox-canvas-host"></div><div id="sandbox-scene-status" class="sb-scene-overlay" role="status"></div></div>
      <p class="sb-scene-hint">${tx('单指旋转 · 双指缩放 · 点设备查看。模型和读数均为演示。', 'Drag to rotate · pinch to zoom · tap a device. Model and readings are a demo.')}</p>
    </section>
    <aside class="sb-demo-notice">${icon('info')}<div>${demoBadge()}<p>${tx('本地模拟，不连接真实设备。离开沙盒会重置本轮任务，已登记家具和关联保留。', 'Local simulation, with no real devices connected. Leaving resets demo tasks; furniture and links are kept.')}</p></div></aside>
    <section class="sb-dock" aria-label="${s('离家检查')}"><div class="sb-dock-handle" aria-hidden="true"></div>
      <div class="sb-tabs" role="tablist" aria-label="${s('离家检查')}"><button id="sandbox-devices-tab" data-sandbox-tab="devices" role="tab" aria-controls="sandbox-panel" aria-selected="true">${s('设备')}<span id="sandbox-device-count">0</span></button><button id="sandbox-tasks-tab" data-sandbox-tab="tasks" role="tab" aria-controls="sandbox-panel" aria-selected="false" tabindex="-1">${s('离家任务')}</button></div>
      <p id="sandbox-feedback" class="sb-detail-note" role="status" hidden></p><div id="sandbox-panel" role="tabpanel" aria-labelledby="sandbox-devices-tab"></div>
    </section></div>`;
}

function labels(reading: DemoReading): [string, string] {
  return reading.mode === 'generation' ? ['24 小时发电量', '当前发电功率'] : reading.mode === 'charge' ? ['24 小时充电量', '当前充电功率'] : ['24 小时用电量', '当前功率'];
}
const number = (value: number) => new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);
const energyValue = (reading: DemoReading) => reading.energyKwh === null ? '—' : `${number(reading.energyKwh)} <small>kWh</small>`;
const powerValue = (reading: DemoReading) => reading.powerW === null ? '—' : reading.powerW >= 1000 ? `${number(reading.powerW / 1000)} <small>kW</small>` : `${number(reading.powerW)} <small>W</small>`;
const powerState = (reading: DemoReading) => reading.isOn === null ? s('不适用') : !reading.isOn ? s('关闭') : s(reading.mode === 'charge' ? '充电中' : reading.mode === 'generation' ? '发电中' : '开启');

export function mountSandbox(container: HTMLElement, context: SandboxContext): () => void {
  mounted.get(container)?.();
  const stage = container.querySelector<HTMLElement>('#sandbox-scene-mount');
  const host = container.querySelector<HTMLElement>('#sandbox-canvas-host');
  const overlay = container.querySelector<HTMLElement>('#sandbox-scene-status');
  const panel = container.querySelector<HTMLElement>('#sandbox-panel');
  if (!stage || !host || !overlay || !panel) return () => {};
  container.classList.add('sandbox-active');
  const lifetime = new AbortController();
  const session = createSandboxSession();
  const storage: StorageAdapter = { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
  let bindings: Bindings = readBindings(storage, context.getFurniture());
  let activePanel: 'devices' | 'tasks' = 'devices';
  let selectedId: string | null = null, selectedObject: string | null = null;
  let disposed = false, appActive = true, scene: HomeScene | undefined;
  let attempt: AbortController | undefined;
  sceneReaders.set(container, () => scene?.inspect());
  let preview = false, everyone = false;
  let order: 'execution-first' | 'object-first' = 'execution-first';
  const boundObject = (id: string) => Object.keys(bindings).find(key => bindings[key] === id);
  const feedback = (message: string) => {
    const target = container.querySelector<HTMLElement>('#sandbox-feedback');
    if (target && !disposed) { target.textContent = message; target.hidden = !message; }
  };
  const readingFor = (item: Furniture): DemoReading => {
    const reading = getDemoReading(item.type), id = boundObject(item.id);
    if (!id || !['living_room_light','bedroom_ac'].includes(id)) return reading;
    const state = session.state(id);
    return { ...reading, isOn: state === 'unknown' ? null : state === 'on', powerW: state === 'unknown' ? null : state === 'off' ? 0 : reading.powerW };
  };
  const furnitureStatus = (item: Furniture) => {
    const id = boundObject(item.id);
    return id && ['living_room_light','bedroom_ac','balcony_door'].includes(id)
      ? objectStatus(id,session.state(id)) : powerState(readingFor(item));
  };
  function metrics(item: Furniture): string {
    const reading = readingFor(item), [energy, power] = labels(reading);
    return `<dl class="sb-metrics"><div><dt>${s(energy)}</dt><dd>${energyValue(reading)}</dd></div><div><dt>${s(power)}</dt><dd>${powerValue(reading)}</dd></div><div><dt>${s('开启状态')}</dt><dd class="sb-power-state${reading.isOn ? ' is-on' : ''}"><span aria-hidden="true"></span>${furnitureStatus(item)}</dd></div></dl>`;
  }
  function deviceList(): string {
    const furniture = context.getFurniture();
    const list = furniture.length ? `<p class="sb-list-caption">${s('已登记 {count} 件', { count: furniture.length })}</p><div class="sb-device-list">${furniture.map(item => `<button class="sb-device-card" data-sandbox-action="detail" data-furniture-id="${escape(item.id)}" aria-label="${escape(s('查看 {name} 的沙盒详情', { name: item.name }))}"><span class="sb-device-heading"><span class="sb-device-icon">${icon(item.type)}</span><span class="sb-device-name"><strong>${escape(item.name)}</strong><span>${escape(roomLabel(item.room))} · ${escape(typeLabel(item.type))}</span></span>${icon('chevron','sb-device-chevron')}</span>${metrics(item)}<span class="sb-card-foot">${demoBadge()}<span>${boundObject(item.id) ? tx('已关联模型','Linked to scene') : s('查看详情')}</span></span></button>`).join('')}</div>` : `<div class="sb-empty">${icon('cube')}<h3>${s('还没有已登记的家具')}</h3><p>${s('在“添加”页登记的家具会显示在这里。沙盒用于查看和检查。')}</p></div>`;
    return `${list}<section class="sb-scene-objects"><h3>${tx('场景演示对象', 'Scene demo objects')}</h3><p class="sb-detail-note">${tx('这些对象来自演示户型，不会自动添加到你的家具记录。', 'These objects belong to the demo home and are not added to your furniture records.')}</p><div class="sb-object-grid">${ids.map(id => `<button class="sb-object-button" data-sandbox-action="object" data-object-id="${id}"><strong>${objectName(id)}</strong><span>${objectStatus(id, session.state(id))}</span></button>`).join('')}</div></section>`;
  }
  function bindingControl(item: Furniture): string {
    const choices = Object.keys(BINDABLE_OBJECTS).filter(id => BINDABLE_OBJECTS[id] === item.type);
    if (!choices.length) return `<p class="sb-detail-note">${tx('此类家具暂没有对应的 3D 对象，登记信息继续保留。','There is no matching 3D object for this type yet. Its furniture record is kept.')}</p>`;
    return `<label class="sb-field">${tx('关联演示对象','Link to demo object')}<select data-sandbox-binding data-furniture-id="${escape(item.id)}"><option value="">${s('尚未映射')}</option>${choices.map(id => `<option value="${id}" ${boundObject(item.id) === id ? 'selected' : ''} ${bindings[id] && bindings[id] !== item.id ? 'disabled' : ''}>${objectName(id)}${bindings[id] && bindings[id] !== item.id ? tx('（已关联）',' (already linked)') : ''}</option>`).join('')}</select></label><p class="sb-detail-note">${tx('关联仅用于演示定位和状态展示，不连接真实设备，也不修改家具的房间。','Links are for demo location and state display. They do not connect real devices or change the furniture room.')}</p>`;
  }
  function deviceDetail(item: Furniture): string {
    const reading = readingFor(item), [energy,power] = labels(reading), linked = boundObject(item.id);
    const date = new Intl.DateTimeFormat(getLocale(), { year:'numeric',month:'short',day:'numeric' }).format(new Date(item.createdAt));
    return `<article id="sandbox-device-detail" class="sb-detail" data-furniture-id="${escape(item.id)}">${backButton()}<div class="sb-detail-heading"><span class="sb-device-icon">${icon(item.type)}</span><div><p>${s('家具详情')}</p><h3 tabindex="-1">${escape(item.name)}</h3><span>${escape(roomLabel(item.room))} · ${escape(typeLabel(item.type))}</span></div></div>
      <section class="sb-reading-block"><div class="sb-reading-title"><h4>${s('运行概览')}</h4>${demoBadge()}</div><dl class="sb-detail-readings"><div><dt>${s(energy)}</dt><dd>${energyValue(reading)}</dd></div><div><dt>${s(power)}</dt><dd>${powerValue(reading)}</dd></div><div><dt>${s('开启状态')}</dt><dd>${furnitureStatus(item)}</dd></div>${reading.batteryPercent === undefined ? '' : `<div><dt>${s('演示电量')}</dt><dd>${number(reading.batteryPercent)} <small>%</small></dd></div>`}</dl><p class="sb-detail-note">${tx('能量与功率是示例数值；关联灯或空调的开关状态跟随场景模拟读数。','Energy and power are example values. Linked lights and AC follow the simulated scene readings.')}</p></section>
      <section class="sb-registration"><h4>${s('登记信息')}</h4><dl><div><dt>${t('品牌 / 型号')}</dt><dd>${escape(item.model || t('暂未填写'))}</dd></div><div><dt>${t('添加日期')}</dt><dd>${date}</dd></div><div><dt>${s('场景关联')}</dt><dd>${linked ? objectName(linked) : s('尚未映射')}</dd></div>${item.notes ? `<div class="sb-notes-row"><dt>${t('备注')}</dt><dd>${escape(item.notes)}</dd></div>` : ''}</dl>${bindingControl(item)}</section>
      <div class="sb-future-actions">${button('focus',s('定位家具'),!scene || !linked || linked === 'home_battery',`data-object-id="${linked || ''}"`)}<button class="sb-small-button" data-sandbox-unavailable disabled>${tx('真实设备控制未接入','Real device control unavailable')}</button></div>${linked === 'home_battery' ? `<p class="sb-detail-note">${tx('储能目前仅提供信息卡片，没有模型中的位置。','The battery currently has an information card, with no position in the 3D model.')}</p>` : ''}</article>`;
  }
  function objectDetail(id: string): string {
    const object = session.view().objects[id], state = session.state(id);
    const furniture = context.getFurniture().find(item => item.id === bindings[id]);
    return `<article id="sandbox-object-detail" class="sb-detail" data-object-id="${id}" data-object-state="${state}">${backButton()}<div class="sb-detail-heading"><div><p>${tx('场景演示对象','Scene demo object')}</p><h3 tabindex="-1">${objectName(id)}</h3></div>${demoBadge()}</div><section class="sb-reading-block"><h4>${tx('模拟设备读数','Simulated device reading')}</h4><p class="sb-object-state">${objectStatus(id,state)}</p><p class="sb-detail-note">${id === 'entry_door' ? s('普通门需要人工确认；模型定位不代表检查完成。') : tx('画面由有效模拟读数驱动；计划和执行确认不会替代设备读数。','Valid simulated readings drive the scene. Plans and execution confirmations do not replace device readings.')}</p><p class="sb-source-label">${object?.updated_at ? `${tx('样例时间','Sample time')}: ${escape(object.updated_at)}` : tx('暂无有效读数','No valid reading')}</p></section><section class="sb-registration"><h4>${tx('关联的家具','Linked furniture')}</h4>${furniture ? `<p class="sb-detail-note">${escape(furniture.name)} · ${escape(roomLabel(furniture.room))}</p>${button('detail',s('查看详情'),false,`data-furniture-id="${escape(furniture.id)}"`)}` : `<p class="sb-detail-note">${tx('尚未关联本机家具。可在已登记家具的详情中选择对应模型。普通玄关门只提供人工检查。','No local furniture is linked. Choose a matching object in a registered furniture detail. The entry door supports manual checks only.')}</p>`}</section><div class="sb-future-actions">${button('focus',tx('定位此对象','Locate object'),!scene,`data-object-id="${id}"`)}${button('show-tasks',s('离家任务'))}</div></article>`;
  }
  function tasks(): string {
    const view = session.view(), task = view.task, results = session.results();
    const manual = task?.manual_records.find(item => item.object_id === 'entry_door')?.result;
    const groupLabel = (group: string) => ({ action:tx('可选动作','Optional action'),keep:tx('保留开启','Keep on'),manual:tx('人工检查','Manual check'),check:tx('需要核实','Needs checking') } as Record<string,string>)[group] || group;
    return `<div class="sb-tasks"><div class="sb-task-intro"><strong>${tx('离家检查 · 本地模拟','Away check · local simulation')}</strong><p>${tx('所有操作仅作用于演示。人工核实、出门声明和灯光读数分别记录。','Actions affect the demo only. Manual checks, leaving home, and light readings are recorded separately.')}</p></div>
      <label class="sb-check"><input type="checkbox" id="sandbox-everyone" ${everyone ? 'checked' : ''} ${task ? 'disabled' : ''}>${tx('全员离家（不选则猫留卧室）','Everyone leaves (otherwise the cat stays in the bedroom)')}</label>
      ${!task ? button('plan',tx('查看离家计划','View away plan')) : `<div class="sb-future-actions">${button('preview',preview ? tx('取消计划高亮','Hide plan highlight') : tx('高亮关灯计划','Highlight off plan'),false,`aria-pressed="${preview}"`)}${button('focus',s('定位玄关'),!scene,'data-object-id="entryway"')}</div>
      ${task.plan.items.map(item => `<article class="sb-task-card"><div><h3>${objectName(item.object_id)}</h3><span class="sb-pending">${groupLabel(item.group)}</span>${item.group === 'action' ? `<label class="sb-check"><input type="checkbox" data-plan-item="${item.item_id}" ${task.selected.includes(item.item_id) ? 'checked' : ''} ${task.activeExecutionId ? 'disabled' : ''}>${tx('模拟关闭','Simulate turning off')}</label>` : ''}<p>${item.group === 'keep' ? tx('留家房间的设备保持开启。','Devices in occupied rooms stay on.') : item.group === 'manual' ? s('普通门需要人工确认；模型定位不代表检查完成。') : item.group === 'check' ? tx('先查看对象详情核实状态，不自动执行动作。','Check this object before acting. No action runs automatically.') : tx('仅执行你选中的模拟动作。','Only your selected demo actions will run.')}</p>${button('object',s('查看详情'),false,`data-object-id="${item.object_id}"`)}</div></article>`).join('')}
      <section class="sb-feedback-card"><h3>${tx('玄关人工核实','Entry door manual check')}</h3><p id="sandbox-manual-state">${manual === 'confirmed_closed' ? tx('已人工确认关闭（演示）','Manually confirmed closed (demo)') : manual === 'deferred' ? tx('稍后核实','Check later') : s('待人工检查')}</p><div class="sb-future-actions">${button('manual-door',tx('我已确认关闭（演示）','I checked it is closed (demo)'))}${button('manual-later',tx('稍后核实','Check later'))}</div><p id="sandbox-away-state">${view.family.user_away ? tx('本人已出门（演示）','I have left (demo)') : tx('本人尚未声明出门','Leaving home not yet declared')}</p>${button('user-away',tx('我已出门（演示）','I have left (demo)'),view.family.user_away === true)}</section>
      <section class="sb-feedback-card"><h3>${s('执行反馈')}</h3><label class="sb-field">${tx('模拟回读顺序','Simulated readback order')}<select id="sandbox-readback-order" ${task.activeExecutionId ? 'disabled' : ''}><option value="execution-first" ${order === 'execution-first' ? 'selected' : ''}>${tx('先执行确认，再设备读数','Confirmation first, then device reading')}</option><option value="object-first" ${order === 'object-first' ? 'selected' : ''}>${tx('先设备读数，再执行确认','Device reading first, then confirmation')}</option></select></label><div class="sb-future-actions">${button('execute',tx('确认执行所选模拟动作','Confirm selected demo actions'),!!task.activeExecutionId || !task.selected.length)}${button('next-readback',tx('接收下一条模拟回读','Receive next demo readback'),!session.pending())}</div><dl><div><dt>${s('指令受理')}</dt><dd id="sandbox-command-state">${results.some(item => item.command_accepted) ? tx('已受理（演示）','Accepted (demo)') : tx('未提交','Not submitted')}</dd></div><div><dt>${tx('执行确认','Execution confirmation')}</dt><dd id="sandbox-execution-state">${results.length && results.every(item => item.status === 'confirmed') ? tx('已确认','Confirmed') : tx('等待中','Waiting')}</dd></div><div><dt>${tx('客厅灯有效读数','Living light valid reading')}</dt><dd id="sandbox-light-reading">${objectStatus('living_room_light',session.state('living_room_light'))}</dd></div></dl><p>${tx('逐条接收模拟回读，观察执行确认与灯光变化的区别。','Receive readings one at a time to see how execution confirmation and the light state differ.')}</p></section>`}
      ${button('demo-reset',tx('重新开始本轮演示','Restart this demo'))}<p class="sb-detail-note">${tx('重置演示会清除本轮任务；全屋复位只调整视角。家具记录不受影响。','Restart clears demo tasks; Reset view only moves the camera. Furniture records are kept.')}</p></div>`;
  }
  function paint(): void {
    if (disposed) return;
    const furniture = context.getFurniture();
    bindings = readBindings(storage,furniture);
    container.querySelector('#sandbox-device-count')!.textContent = String(furniture.length);
    container.querySelectorAll<HTMLButtonElement>('[data-sandbox-tab]').forEach(tab => { const chosen = tab.dataset.sandboxTab === activePanel; tab.setAttribute('aria-selected',String(chosen)); tab.tabIndex = chosen ? 0 : -1; });
    panel!.setAttribute('aria-labelledby',`sandbox-${activePanel}-tab`);
    const item = furniture.find(entry => entry.id === selectedId);
    if (selectedId && !item) selectedId = null;
    panel!.innerHTML = selectedObject ? objectDetail(selectedObject) : item ? deviceDetail(item) : activePanel === 'tasks' ? tasks() : deviceList();
    const view = session.view();
    const planIds = preview ? view.task?.plan.items.filter(item => item.group === 'action' && view.task?.selected.includes(item.item_id)).map(item => item.object_id) || [] : [];
    stage!.dataset.lampState = session.state('living_room_light');
    stage!.dataset.planHighlight = String(planIds.includes('living_room_light'));
    scene?.apply(view.objects); scene?.preview(planIds);
    container.querySelectorAll<HTMLButtonElement>('.sb-room-nav button,[data-sandbox-action="scene-reset"]').forEach(control => { control.disabled = !scene; });
  }
  function sceneStatus(state: 'loading' | 'ready' | 'error'): void {
    stage!.dataset.sceneState = state; stage!.setAttribute('aria-busy',String(state === 'loading'));
    overlay!.hidden = state === 'ready';
    overlay!.innerHTML = state === 'ready' ? '' : renderSandboxScene(state);
  }
  async function loadScene(): Promise<void> {
    attempt?.abort(); scene?.destroy(); scene = undefined;
    const current = new AbortController(); attempt = current;
    host!.replaceChildren(); sceneStatus('loading'); paint();
    try {
      const { createHomeScene } = await import('./sandbox-runtime/scene');
      if (disposed || current.signal.aborted) return;
      const created = await createHomeScene(host!,sceneMapping,id => {
        if (disposed || current.signal.aborted) return;
        if (id && ids.includes(id)) { selectedObject = id; selectedId = null; activePanel = 'devices'; paint(); }
      }, { signal: current.signal, labels: Object.fromEntries([...ids,'entryway','living_room','bedroom','balcony'].map(id => [id,objectName(id)])), stateLabel: objectStatus, canvasLabel: tx('演示小公寓，可拖动旋转或点击设备','Demo apartment. Drag to rotate or tap a device.'), onContextLost: () => {
        if (disposed || current.signal.aborted) return;
        current.abort(); scene?.destroy(); scene = undefined; sceneStatus('error'); paint();
      } });
      if (disposed || current.signal.aborted) { created.destroy(); return; }
      scene = created; scene.setActive(appActive); sceneStatus('ready'); paint();
    } catch {
      if (!disposed && !current.signal.aborted) { sceneStatus('error'); paint(); }
    }
  }
  const backToList = () => { const previous = selectedId; selectedId = null; selectedObject = null; paint(); if (previous) container.querySelector<HTMLButtonElement>(`[data-sandbox-action="detail"][data-furniture-id="${CSS.escape(previous)}"]`)?.focus({preventScroll:true}); };
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || target.disabled || !container.contains(target)) return;
    const tab = target.dataset.sandboxTab, action = target.dataset.sandboxAction;
    try {
      feedback('');
      if (tab === 'devices' || tab === 'tasks') { activePanel = tab; selectedId = null; selectedObject = null; }
      else if (action === 'detail') { selectedId = target.dataset.furnitureId || null; selectedObject = null; }
      else if (action === 'object') { selectedObject = target.dataset.objectId || null; selectedId = null; if (scene && selectedObject) scene.focus(selectedObject); }
      else if (action === 'back') { backToList(); return; }
      else if (action === 'show-tasks') { activePanel = 'tasks'; selectedObject = null; selectedId = null; }
      else if (action === 'focus') { if (target.dataset.objectId) scene?.focus(target.dataset.objectId); }
      else if (action === 'scene-reset') scene?.reset();
      else if (action === 'retry-scene') { void loadScene(); return; }
      else if (action === 'plan') session.plan(everyone);
      else if (action === 'preview') preview = !preview;
      else if (action === 'execute') session.execute(order);
      else if (action === 'next-readback') { session.next(); }
      else if (action === 'manual-door') session.manual('confirmed_closed');
      else if (action === 'manual-later') session.manual('deferred');
      else if (action === 'user-away') session.userAway();
      else if (action === 'demo-reset') { preview = false; everyone = false; session.reset(); scene?.reset(); }
      paint();
      if (action === 'detail' || action === 'object') { panel!.querySelector<HTMLElement>('h3[tabindex]')?.focus({preventScroll:true}); panel!.scrollIntoView({block:'nearest'}); }
    } catch { feedback(tx('操作未完成，请重试。家具记录未改变。','The action could not finish. Try again. Furniture records are unchanged.')); }
  };
  container.addEventListener('click',onClick,{signal:lifetime.signal});
  container.addEventListener('change',event => {
    const input = event.target;
    if (!(input instanceof HTMLSelectElement || input instanceof HTMLInputElement)) return;
    try {
      if (input.matches('[data-sandbox-binding]')) {
        bindings = saveBinding(storage,context.getFurniture(),bindings,input.dataset.furnitureId!,input.value);
        feedback(tx('模型关联已保存','Scene link saved'));
      } else if (input.id === 'sandbox-readback-order') order = input.value === 'object-first' ? 'object-first' : 'execution-first';
      else if (input instanceof HTMLInputElement && input.id === 'sandbox-everyone') everyone = input.checked;
      else if (input instanceof HTMLInputElement && input.dataset.planItem) session.select(input.dataset.planItem,input.checked);
      paint();
    } catch { paint(); feedback(tx('无法保存关联，请检查存储空间后重试。','Could not save the link. Check storage and try again.')); }
  },{signal:lifetime.signal});
  container.addEventListener('homie:sandbox-back',event => { if (selectedId || selectedObject) { event.preventDefault(); backToList(); } },{signal:lifetime.signal});
  container.addEventListener('keydown',event => {
    if (event.key === 'Escape' && (selectedId || selectedObject)) { event.preventDefault(); backToList(); return; }
    if (!(event.target instanceof Element) || !event.target.closest('[data-sandbox-tab]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); activePanel = event.key === 'Home' ? 'devices' : event.key === 'End' ? 'tasks' : activePanel === 'devices' ? 'tasks' : 'devices'; selectedId = null; selectedObject = null; paint(); container.querySelector<HTMLButtonElement>(`[data-sandbox-tab="${activePanel}"]`)?.focus();
  },{signal:lifetime.signal});
  window.addEventListener('homie:app-state',event => { appActive = (event as CustomEvent<{active:boolean}>).detail?.active !== false; scene?.setActive(appActive); },{signal:lifetime.signal});
  const unsubscribe = session.subscribe(paint);
  const cleanup = () => { if (disposed) return; disposed = true; lifetime.abort(); attempt?.abort(); unsubscribe(); session.dispose(); scene?.destroy(); scene = undefined; host.replaceChildren(); container.classList.remove('sandbox-active'); sceneReaders.delete(container); if (mounted.get(container) === cleanup) mounted.delete(container); };
  mounted.set(container,cleanup); void loadScene(); return cleanup;
}
