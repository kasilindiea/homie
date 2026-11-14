import './styles.css';
import { createAppStore, FURNITURE_TYPES, ALL_FURNITURE_TYPES, DEFAULT_ROOMS } from './domain';
import { icon, roomIllustration } from './icons';
import { renderSandbox, mountSandbox } from './features/sandbox';
import { renderImport, mountImport } from './features/import';
import { getLocale, setLocale, t, roomLabel, roomValue, translateError, type Locale } from './i18n';

const store = createAppStore();
const root = document.querySelector<HTMLDivElement>('#app')!;
type Tab = 'add' | 'sandbox' | 'account' | 'import';
let activeTab: Tab = 'add';
let activeRoom = '全部';
let search = '';
let modal: HTMLDialogElement | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let lastFocus: HTMLElement | null = null;
let unmountFeature: (() => void) | undefined;

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const typeLabel = (type: string) => t(ALL_FURNITURE_TYPES.find((item) => item.value === type)?.label ?? '其他');
const message = translateError;

function toast(text: string) {
  const element = document.querySelector<HTMLDivElement>('#toast')!;
  clearTimeout(toastTimer);
  element.textContent = text;
  element.classList.add('visible');
  toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
}

function brand(compact = false) {
  return `<div class="brand${compact ? ' brand-compact' : ''}"><span class="brand-mark">${icon('home')}</span><span class="brand-word">Homie</span></div>`;
}

function loginPage() {
  root.innerHTML = `<main class="app-shell login-shell">
    <header class="login-header">${brand()}<span class="edition">${t('家的新日常')}</span></header>
    <section class="login-hero"><span class="eyebrow">${t('多一点家的感觉')}</span><h1>${t('好好安放，')}<br />${t('每一份生活。')}</h1><p>${t('从一件家具开始，慢慢构建你的家。')}</p>${roomIllustration('login-room')}</section>
    <section class="login-panel" aria-labelledby="login-title"><div class="panel-heading"><div><h2 id="login-title">${t('欢迎回家')}</h2><p>${t('使用开发者账号登录 Homie')}</p></div><span class="small-shield">${icon('shield')}</span></div>
      <form id="login-form" novalidate>
        <label class="field-label" for="username">${t('开发者账号')}</label><div class="input-wrap">${icon('user')}<input id="username" name="username" type="text" autocomplete="username" placeholder="${t('请输入账号')}" required maxlength="100" autocapitalize="none" spellcheck="false" /></div>
        <label class="field-label" for="password">${t('登录密码')}</label><div class="input-wrap">${icon('lock')}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="${t('请输入密码')}" required maxlength="200" /><button class="icon-button password-toggle" type="button" data-action="toggle-password" aria-label="${t('显示密码')}" aria-pressed="false">${icon('eye')}</button></div>
        <p id="login-error" class="form-error" role="alert"></p>
        <button class="button button-primary login-submit" type="submit">${t('进入我的家')}${icon('arrow')}</button>
      </form>
    </section><footer class="login-footer"><span class="tiny-dot"></span>${t('开发者专属访问')}<span class="footer-divider">/</span>V0.0.5</footer>
  </main>`;
  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const errorElement = document.querySelector<HTMLParagraphElement>('#login-error')!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const data = new FormData(form);
    const username = String(data.get('username') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!username || !password) { errorElement.textContent = t('请填写账号和密码'); return; }
    button.disabled = true;
    try {
      await store.login(username, password);
      activeTab = 'add'; activeRoom = '全部'; search = '';
      render();
    } catch (error) { errorElement.textContent = message(error); button.disabled = false; }
  });
}

function navigation() {
  const tabs: { id: Tab; label: string; symbol: string }[] = [
    { id: 'add', label: '添加', symbol: 'plus' }, { id: 'sandbox', label: '沙盒', symbol: 'cube' },
    { id: 'import', label: '导入', symbol: 'import' }, { id: 'account', label: '账号', symbol: 'user' },
  ];
  return `<nav class="bottom-nav" aria-label="${t('主导航')}">${tabs.map((tab) => `<button type="button" class="nav-item${activeTab === tab.id ? ' active' : ''}" data-action="tab" data-tab="${tab.id}"${activeTab === tab.id ? ' aria-current="page"' : ''}><span class="nav-icon">${icon(tab.symbol)}</span><span>${t(tab.label)}</span></button>`).join('')}</nav>`;
}

function topHeader(title: string, eyebrow: string, action = '') {
  return `<header class="page-header"><div><p class="eyebrow">${t(eyebrow)}</p><h1>${t(title)}</h1></div>${action}</header>`;
}

function furniturePage() {
  const { furniture, settings } = store.getState();
  const rooms = new Set(furniture.map((item) => item.room));
  return `${topHeader('我的家具', '我的生活空间', `<button class="icon-button add-top-button" data-action="add" aria-label="${t('添加家具')}">${icon('plus')}</button>`)}
    <section class="home-card"><div class="home-card-copy"><span class="home-card-tag">${icon('leaf')}${t('一点一滴，构建理想的家')}</span><h2>${t('让每件家具，')}<br />${t('都有自己的位置。')}</h2><p>${escapeHtml(t('{name}的家，正在慢慢成形。', { name: settings.nickname }))}</p></div>${roomIllustration('home-card-art')}</section>
    <div class="home-stats"><div><strong>${furniture.length.toString().padStart(2, '0')}</strong><span>${t('件家具')}</span></div><span class="stat-line"></span><div><strong>${rooms.size.toString().padStart(2, '0')}</strong><span>${t('个房间')}</span></div><span class="local-note">${icon('shield')}${t('本机保存')}</span></div>
    <section class="collection" aria-labelledby="collection-title"><div class="section-heading"><h2 id="collection-title">${t('家具清单')}<span>${furniture.length}</span></h2><span>${t('把生活整理成喜欢的样子')}</span></div>
      ${furniture.length ? `<div class="search-wrap">${icon('search')}<input id="furniture-search" aria-label="${t('搜索家具名称、类型或房间')}" placeholder="${t('搜索家具名称、类型或房间')}" value="${escapeHtml(search)}" autocomplete="off" /><button class="icon-button search-clear" data-action="clear-search" aria-label="${t('清空搜索')}"${search ? '' : ' hidden'}>${icon('close')}</button></div><div class="room-filters" role="group" aria-label="${t('按房间筛选')}">${['全部', ...rooms].map((room) => `<button class="filter-chip${activeRoom === room ? ' selected' : ''}" data-action="filter" data-room="${escapeHtml(room)}" aria-pressed="${activeRoom === room}">${escapeHtml(room === '全部' ? t(room) : roomLabel(room))}</button>`).join('')}</div>` : ''}
      <div id="furniture-list">${furnitureList()}</div>
    </section>
    ${furniture.length ? `<button class="button button-primary add-list-button" data-action="add">${icon('plus')}${t('添加新家具')}</button>` : ''}
    <p class="page-footnote">${t('当前支持手动录入家具，设备连接将在后续开放。')}</p>`;
}

function furnitureList() {
  const { furniture } = store.getState();
  if (!furniture.length) return `<div class="empty-collection"><div class="empty-furniture-art">${icon('sofa')}<span>${icon('plus')}</span></div><h3>${t('家的故事，从第一件家具开始')}</h3><p>${t('记录它的名字，给它安排一个位置。')}</p><button class="button button-primary" data-action="add">${icon('plus')}${t('添加第一件家具')}</button><div class="quick-types">${['light', 'outlet', 'home_battery', 'solar_panel'].map((type) => `<button data-action="add" data-type="${type}" aria-label="${escapeHtml(t('添加{type}', { type: typeLabel(type) }))}">${icon(type)}<span>${escapeHtml(typeLabel(type))}</span></button>`).join('')}</div></div>`;
  const query = search.trim().toLocaleLowerCase();
  const filtered = furniture.filter((item) => (activeRoom === '全部' || item.room === activeRoom) && (!query || [item.name, typeLabel(item.type), item.room, roomLabel(item.room), item.model].some((value) => value.toLocaleLowerCase().includes(query))));
  if (!filtered.length) return `<div class="no-results">${icon('search')}<h3>${t('暂时没有找到家具')}</h3><p>${t('换个关键词，或查看全部房间。')}</p><button class="text-button" data-action="reset-filters">${t('查看全部家具')}</button></div>`;
  return `<div class="furniture-grid">${filtered.map((item) => `<button class="furniture-card" data-action="detail" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('查看{name}', { name: item.name }))}"><span class="furniture-art furniture-art-${escapeHtml(item.type)}">${icon(item.type)}<span class="furniture-art-spark"></span></span><span class="furniture-card-info"><span class="furniture-room">${escapeHtml(roomLabel(item.room))}</span><strong>${escapeHtml(item.name)}</strong><span class="furniture-type">${escapeHtml(typeLabel(item.type))}${item.model ? ` · ${escapeHtml(item.model)}` : ''}</span></span><span class="card-arrow">${icon('chevron')}</span></button>`).join('')}</div>`;
}

function accountPage() {
  const { settings, session, furniture } = store.getState();
  return `${topHeader('账号', '属于你的家', '')}
    <section class="profile-card"><div class="profile-avatar">${icon('user')}<span>${icon('check')}</span></div><div><span class="developer-badge">${t('开发者')}</span><h2>${escapeHtml(settings.nickname)}</h2><p>${escapeHtml(session?.username ?? '')}</p></div><span class="profile-leaf">${icon('leaf')}</span></section>
    <section class="settings-section" id="about-section"><div class="section-heading"><h2>${t('关于 Homie')}</h2></div><div class="about-card"><div class="about-row"><span>${icon('home')}${t('当前版本')}</span><span>0.0.5</span></div><div class="about-row"><span>${icon('sofa')}${t('已添加家具')}</span><span>${t('{count} 件', { count: furniture.length })}</span></div><div class="about-row"><span>${icon('shield')}${t('数据存储')}</span><span>${t('当前设备')}</span></div></div><p class="settings-note">${t('家具和设置保存在当前设备，退出登录不会删除。卸载应用或清除数据会移除这些记录。')}</p><p class="account-signature">Homie · ${t('让生活，安然有序。')}</p></section>
    <section class="settings-section" id="settings-section"><div class="section-heading"><h2>${t('我的设置')}</h2>${icon('settings')}</div><form id="settings-form" class="settings-card" novalidate>
      <label class="field-label" for="nickname">${t('显示名称')}</label><input class="plain-input" id="nickname" name="nickname" value="${escapeHtml(settings.nickname)}" placeholder="${t('你希望我们如何称呼你')}" maxlength="24" required />
      <label class="field-label" for="default-room">${t('默认添加房间')}</label><input class="plain-input" id="default-room" name="defaultRoom" value="${escapeHtml(roomLabel(settings.defaultRoom))}" list="settings-rooms" maxlength="20" required /><datalist id="settings-rooms">${DEFAULT_ROOMS.map((room) => `<option value="${escapeHtml(roomLabel(room))}"></option>`).join('')}</datalist><p class="field-hint">${t('添加家具时自动选择，也可以随时更改。')}</p>
      <label class="field-label" for="language">${t('界面语言')}</label><select class="plain-input language-select" id="language" name="language" aria-describedby="language-hint"><option value="zh-CN" lang="zh-CN"${getLocale() === 'zh-CN' ? ' selected' : ''}>中文</option><option value="en" lang="en"${getLocale() === 'en' ? ' selected' : ''}>English</option></select><p class="field-hint" id="language-hint">${t('切换后立即保存，下次打开仍会保留。')}</p>
      <p id="settings-error" class="form-error" role="alert"></p><button class="button button-primary" type="submit">${t('保存设置')}${icon('check')}</button></form>
      <button class="button button-logout" data-action="logout">${icon('logout')}${t('退出登录')}</button></section>`;
}

function render() {
  unmountFeature?.();
  unmountFeature = undefined;
  document.documentElement.lang = getLocale();
  document.title = 'Homie';
  if (!store.getState().session) { loginPage(); return; }
  const content = activeTab === 'add' ? furniturePage() : activeTab === 'account' ? accountPage() : activeTab === 'sandbox' ? renderSandbox() : renderImport();
  root.innerHTML = `<div class="app-shell"><main class="main-content" id="main-content">${content}</main>${navigation()}</div>`;
  if (activeTab === 'sandbox') unmountFeature = mountSandbox(document.querySelector<HTMLElement>('#main-content')!, {
    getFurniture: () => store.getState().furniture,
    navigateToFurniture: () => { activeTab = 'add'; render(); window.scrollTo({ top: 0 }); },
  });
  if (activeTab === 'import') unmountFeature = mountImport(document.querySelector<HTMLElement>('#main-content')!);
  if (activeTab === 'account') {
    document.querySelector<HTMLFormElement>('#settings-form')!.addEventListener('submit', saveSettings);
    document.querySelector<HTMLSelectElement>('#language')!.addEventListener('change', changeLanguage);
  }
  document.querySelector<HTMLInputElement>('#furniture-search')?.addEventListener('input', (event) => {
    search = (event.target as HTMLInputElement).value;
    document.querySelector('#furniture-list')!.innerHTML = furnitureList();
    document.querySelector<HTMLButtonElement>('.search-clear')!.hidden = !search;
  });
  const warning = store.getState().warning;
  if (warning) toast(message(warning));
}

function changeLanguage(event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  if (select.value !== 'en' && select.value !== 'zh-CN') return;
  const next: Locale = select.value;
  const nickname = document.querySelector<HTMLInputElement>('#nickname')!.value;
  const defaultRoom = roomValue(document.querySelector<HTMLInputElement>('#default-room')!.value, store.getState().settings.defaultRoom);
  const scrollTop = window.scrollY;
  try {
    setLocale(next);
    render();
    document.querySelector<HTMLInputElement>('#nickname')!.value = nickname;
    document.querySelector<HTMLInputElement>('#default-room')!.value = roomLabel(defaultRoom);
    document.querySelector<HTMLSelectElement>('#language')!.focus({ preventScroll: true });
    window.scrollTo({ top: scrollTop });
    toast(t('语言已切换'));
  } catch (error) {
    select.value = getLocale();
    document.querySelector('#settings-error')!.textContent = message(error);
  }
}

function saveSettings(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const data = new FormData(form);
  try {
    store.updateSettings({ nickname: String(data.get('nickname') ?? ''), defaultRoom: roomValue(String(data.get('defaultRoom') ?? ''), store.getState().settings.defaultRoom) });
    render(); toast(t('设置已保存'));
  } catch (error) { document.querySelector('#settings-error')!.textContent = message(error); }
}

function openModal(content: string, labelId: string) {
  closeModal(false);
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal = document.createElement('dialog');
  modal.className = 'bottom-sheet';
  modal.setAttribute('aria-labelledby', labelId);
  modal.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div>${content}`;
  document.body.append(modal);
  document.body.classList.add('modal-open');
  modal.addEventListener('cancel', (event) => { event.preventDefault(); closeModal(); });
  modal.addEventListener('click', (event) => {
    if (event.target !== modal) return;
    const bounds = modal!.getBoundingClientRect();
    if (event.clientY < bounds.top || event.clientY > bounds.bottom || event.clientX < bounds.left || event.clientX > bounds.right) closeModal();
  });
  modal.showModal();
  modal.querySelector<HTMLElement>('[autofocus]')?.focus();
}

function closeModal(restoreFocus = true) {
  if (modal) { modal.close(); modal.remove(); modal = null; }
  document.body.classList.remove('modal-open');
  if (restoreFocus && lastFocus?.isConnected) lastFocus.focus();
}

function furnitureForm(id?: string, initialType?: string) {
  const state = store.getState();
  const item = id ? state.furniture.find((entry) => entry.id === id) : undefined;
  if (id && !item) { toast(t('这件家具已不存在')); return; }
  const selectedType = item?.type ?? initialType ?? 'light';
  // Existing records keep their legacy type; only new entries use the current catalog.
  const availableTypes = FURNITURE_TYPES.some((type) => type.value === selectedType)
    ? FURNITURE_TYPES
    : [...FURNITURE_TYPES, ...ALL_FURNITURE_TYPES.filter((type) => type.value === selectedType)];
  openModal(`<div class="sheet-heading"><div><span class="eyebrow">${t(item ? '让家具更懂你' : '为家添一件新家具')}</span><h2 id="furniture-form-title">${t(item ? '编辑家具' : '添加家具')}</h2></div><button class="icon-button" data-action="close-modal" aria-label="${t('关闭')}">${icon('close')}</button></div>
    <form id="furniture-form" novalidate><label class="field-label" for="furniture-name">${t('家具名称')}<span class="required-mark">*</span></label><input class="plain-input" id="furniture-name" name="name" value="${escapeHtml(item?.name ?? '')}" maxlength="40" placeholder="${t('例如：客厅的阅读灯')}" required autofocus /><fieldset class="type-fieldset"><legend class="field-label">${t('家具类型')}<span class="required-mark">*</span></legend><div class="type-options">${availableTypes.map((type) => `<label class="type-option"><input type="radio" name="type" value="${escapeHtml(type.value)}"${selectedType === type.value ? ' checked' : ''} /><span>${icon(type.value)}<span>${escapeHtml(t(type.label))}</span></span></label>`).join('')}</div></fieldset>
    <label class="field-label" for="furniture-room">${t('所在房间')}<span class="required-mark">*</span></label><input class="plain-input" id="furniture-room" name="room" value="${escapeHtml(roomLabel(item?.room ?? state.settings.defaultRoom))}" list="furniture-rooms" maxlength="20" placeholder="${t('选择或输入房间')}" required /><datalist id="furniture-rooms">${[...new Set([...DEFAULT_ROOMS, ...state.furniture.map((entry) => entry.room)])].map((room) => `<option value="${escapeHtml(roomLabel(room))}"></option>`).join('')}</datalist>
    <label class="field-label" for="furniture-model">${t('品牌 / 型号')}<span class="optional">${t('选填')}</span></label><input class="plain-input" id="furniture-model" name="model" value="${escapeHtml(item?.model ?? '')}" maxlength="60" placeholder="${t('记录品牌或型号，方便查找')}" />
    <label class="field-label" for="furniture-notes">${t('备注')}<span class="optional">${t('选填')}</span></label><textarea class="plain-input" id="furniture-notes" name="notes" rows="2" maxlength="240" placeholder="${t('尺寸、颜色，或关于它的小故事')}">${escapeHtml(item?.notes ?? '')}</textarea><p id="furniture-error" class="form-error" role="alert"></p><div class="sheet-actions"><button class="button button-primary" type="submit">${icon(item ? 'check' : 'plus')}${t(item ? '保存修改' : '添加到我的家')}</button><p class="field-hint">${t('手动记录家具信息，暂不连接真实设备。')}</p></div></form>`, 'furniture-form-title');
  document.querySelector<HTMLFormElement>('#furniture-form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const input = { name: String(data.get('name') ?? ''), type: String(data.get('type') ?? 'light'), room: roomValue(String(data.get('room') ?? ''), item?.room ?? state.settings.defaultRoom), model: String(data.get('model') ?? ''), notes: String(data.get('notes') ?? '') };
    try {
      if (item) store.updateFurniture(item.id, input); else store.addFurniture(input);
      closeModal(false); activeTab = 'add'; activeRoom = '全部'; search = ''; render();
      toast(t(item ? '家具信息已更新' : '家具已添加，家的样子更完整了'));
    } catch (error) { document.querySelector('#furniture-error')!.textContent = message(error); }
  });
}

function furnitureDetail(id: string) {
  const item = store.getState().furniture.find((entry) => entry.id === id);
  if (!item) { toast(t('这件家具已不存在')); return; }
  const date = new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(item.createdAt));
  openModal(`<div class="sheet-heading"><span class="eyebrow">${t('家中的一件小美好')}</span><button class="icon-button" data-action="close-modal" aria-label="${t('关闭')}">${icon('close')}</button></div><div class="detail-hero furniture-art-${escapeHtml(item.type)}">${icon(item.type)}</div><div class="detail-title"><span class="detail-type">${escapeHtml(typeLabel(item.type))}</span><h2 id="detail-title">${escapeHtml(item.name)}</h2><p>${icon('location')}${escapeHtml(roomLabel(item.room))}</p></div><dl class="detail-info"><div><dt>${t('品牌 / 型号')}</dt><dd>${escapeHtml(item.model || t('暂未填写'))}</dd></div><div><dt>${t('添加日期')}</dt><dd>${escapeHtml(date)}</dd></div>${item.notes ? `<div class="detail-notes"><dt>${t('备注')}</dt><dd>${escapeHtml(item.notes)}</dd></div>` : ''}</dl><div class="detail-actions"><button class="button button-primary" data-action="edit" data-id="${escapeHtml(item.id)}">${icon('edit')}${t('编辑家具')}</button><button class="button button-delete" data-action="confirm-delete" data-id="${escapeHtml(item.id)}">${icon('trash')}${t('删除')}</button></div>`, 'detail-title');
}

function confirmDelete(id: string) {
  const item = store.getState().furniture.find((entry) => entry.id === id);
  if (!item) return;
  openModal(`<div class="sheet-heading"><h2 id="delete-title">${t('删除这件家具？')}</h2><button class="icon-button" data-action="close-modal" aria-label="${t('取消删除')}">${icon('close')}</button></div><p class="confirm-copy">${escapeHtml(t('“{name}”将从家具清单移除，此操作无法撤销。', { name: item.name }))}</p><div class="confirm-actions"><button class="button button-outline" data-action="detail" data-id="${escapeHtml(id)}" autofocus>${t('保留家具')}</button><button class="button button-danger" data-action="delete" data-id="${escapeHtml(id)}">${t('确认删除')}</button></div>`, 'delete-title');
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!button) return;
  const { action, id, tab, room, type } = button.dataset;
  try {
    if (action === 'toggle-password') {
      const input = document.querySelector<HTMLInputElement>('#password')!;
      const showing = input.type === 'password';
      input.type = showing ? 'text' : 'password';
      button.innerHTML = icon(showing ? 'eyeOff' : 'eye');
      button.setAttribute('aria-label', t(showing ? '隐藏密码' : '显示密码'));
      button.setAttribute('aria-pressed', String(showing));
    } else if (action === 'tab' || action === 'go-add') {
      activeTab = action === 'go-add' ? 'add' : tab as Tab; render(); window.scrollTo({ top: 0 });
    } else if (action === 'add') furnitureForm(undefined, type);
    else if (action === 'filter') { activeRoom = room ?? '全部'; render(); }
    else if (action === 'clear-search' || action === 'reset-filters') {
      search = ''; if (action === 'reset-filters') activeRoom = '全部'; render();
      document.querySelector<HTMLInputElement>('#furniture-search')?.focus();
    } else if (action === 'detail' && id) furnitureDetail(id);
    else if (action === 'edit' && id) furnitureForm(id);
    else if (action === 'confirm-delete' && id) confirmDelete(id);
    else if (action === 'delete' && id) {
      store.deleteFurniture(id); closeModal(false); activeRoom = '全部'; render(); toast(t('家具已删除'));
    } else if (action === 'close-modal') closeModal();
    else if (action === 'logout') { store.logout(); closeModal(false); activeRoom = '全部'; search = ''; render(); toast(t('已退出登录')); }
  } catch (error) { toast(message(error)); }
});

// Native hosts can delegate Back to the screen without knowing its implementation.
window.addEventListener('homing:back', (event) => {
  if (modal) { event.preventDefault(); closeModal(); }
  else if (activeTab === 'sandbox' && document.querySelector('#main-content')?.dispatchEvent(new Event('homie:sandbox-back', { cancelable: true })) === false) {
    event.preventDefault();
  }
  else if (store.getState().session && activeTab !== 'add') { event.preventDefault(); activeTab = 'add'; render(); }
});

render();
