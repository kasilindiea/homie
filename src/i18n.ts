export type Locale = 'zh-CN' | 'en';
const LOCALE_KEY = 'homie.locale.v1';
let locale: Locale = 'zh-CN';
try { if (localStorage.getItem(LOCALE_KEY) === 'en') locale = 'en'; } catch { /* Keep Chinese when storage is unavailable. */ }

const english: Record<string, string> = {
  '家的新日常': 'A new everyday at home', '多一点家的感觉': 'A LITTLE MORE AT HOME',
  '好好安放，': 'A place for', '每一份生活。': 'the life you love.', '从一件家具开始，慢慢构建你的家。': 'Build your home, one piece at a time.',
  '欢迎回家': 'Welcome home', '使用开发者账号登录 homie': 'Sign in to homie with your developer account',
  '开发者账号': 'Developer account', '请输入账号': 'Enter your account', '登录密码': 'Password', '请输入密码': 'Enter your password',
  '显示密码': 'Show password', '隐藏密码': 'Hide password', '进入我的家': 'Enter my home', '开发者专属访问': 'Developer access',
  '请填写账号和密码': 'Enter your account and password.', '添加': 'Add', '沙盒': 'Sandbox', '导入': 'Import', '账号': 'Account', '主导航': 'Main navigation',
  '我的家具': 'My furniture', '我的生活空间': 'MY LIVING SPACE', '添加家具': 'Add furniture',
  '一点一滴，构建理想的家': 'A little closer to your ideal home', '让每件家具，': 'Every piece,', '都有自己的位置。': 'a place of its own.',
  '{name}的家，正在慢慢成形。': '{name}’s home is taking shape.', '件家具': 'pieces', '个房间': 'rooms', '本机保存': 'Saved locally',
  '家具清单': 'Furniture', '把生活整理成喜欢的样子': 'Make room for what you love', '搜索家具名称、类型或房间': 'Search name, type or room',
  '清空搜索': 'Clear search', '按房间筛选': 'Filter by room', '全部': 'All', '添加新家具': 'Add new furniture',
  '当前支持手动录入家具，设备连接将在后续开放。': 'Add furniture manually for now. Device connections are coming later.',
  '家的故事，从第一件家具开始': 'Your home starts with one piece', '记录它的名字，给它安排一个位置。': 'Give it a name and a place to belong.', '添加第一件家具': 'Add your first piece',
  '添加{type}': 'Add {type}', '查看{name}': 'View {name}', '暂时没有找到家具': 'No furniture found', '换个关键词，或查看全部房间。': 'Try another search or view all rooms.', '查看全部家具': 'View all furniture',
  '沙发': 'Sofa', '椅子': 'Chair', '桌子': 'Table', '床': 'Bed', '柜子': 'Cabinet', '灯具': 'Light', '其他': 'Other',
  '客厅': 'Living room', '卧室': 'Bedroom', '餐厅': 'Dining room', '书房': 'Study', '阳台': 'Balcony',
  '把熟悉的生活带回家': 'BRING IT HOME', '正在留白，等待更多可能': 'More possibilities, coming soon', '让熟悉的家具，来到这里': 'Bring your furniture home',
  '导入功能将在后续版本开放。': 'Import will be available in a future update.', '现在可以先手动添加你的家具。': 'For now, add your furniture manually.', '去添加家具': 'Go to furniture',
  '属于你的家': 'A HOME THAT IS YOURS', '开发者': 'Developer', '我的设置': 'Settings', '显示名称': 'Display name', '你希望我们如何称呼你': 'What should we call you?',
  '默认添加房间': 'Default room', '添加家具时自动选择，也可以随时更改。': 'Preselected for new furniture. You can change it any time.',
  '界面语言': 'Language', '切换后立即保存，下次打开仍会保留。': 'Applied and saved immediately for your next visit.', '保存设置': 'Save settings', '设置已保存': 'Settings saved', '语言已切换': 'Language updated',
  '关于 homie': 'About homie', '当前版本': 'Version', '已添加家具': 'Furniture added', '{count} 件': '{count}', '数据存储': 'Data storage', '当前设备': 'This device',
  '家具和设置保存在当前设备，退出登录不会删除。卸载应用或清除数据会移除这些记录。': 'Furniture and settings stay on this device after sign-out. Uninstalling the app or clearing its data removes these records.',
  '退出登录': 'Sign out', '让生活，安然有序。': 'A little order. A lot of home.',
  '这件家具已不存在': 'This piece no longer exists.', '让家具更懂你': 'MAKE IT YOURS', '为家添一件新家具': 'A NEW PIECE OF HOME', '编辑家具': 'Edit furniture', '关闭': 'Close',
  '家具名称': 'Furniture name', '例如：客厅的云朵沙发': 'e.g. Cloud sofa in the living room', '家具类型': 'Furniture type', '所在房间': 'Room', '选择或输入房间': 'Choose or enter a room',
  '品牌 / 型号': 'Brand / model', '选填': 'Optional', '记录品牌或型号，方便查找': 'Brand or model for easy reference', '备注': 'Notes', '尺寸、颜色，或关于它的小故事': 'Size, color, or a little story about it',
  '保存修改': 'Save changes', '添加到我的家': 'Add to my home', '手动记录家具信息，暂不连接真实设备。': 'A manual furniture record. Devices are not connected yet.',
  '家具信息已更新': 'Furniture updated', '家具已添加，家的样子更完整了': 'Furniture added. One step closer to home.',
  '家中的一件小美好': 'A PIECE OF YOUR HOME', '暂未填写': 'Not provided', '添加日期': 'Date added', '删除': 'Delete', '删除这件家具？': 'Delete this piece?', '取消删除': 'Cancel deletion',
  '“{name}”将从家具清单移除，此操作无法撤销。': '“{name}” will be removed from your furniture. This cannot be undone.', '保留家具': 'Keep furniture', '确认删除': 'Delete furniture', '家具已删除': 'Furniture deleted', '已退出登录': 'Signed out',
  '给想象一点空间': 'SPACE TO IMAGINE', '为想象，留一点空间': 'Make space for imagination', '沙盒空间将在后续版本开放。': 'The sandbox is coming in a future update.', '先添加家具，慢慢准备你的理想之家。': 'Start adding furniture for your ideal home.',
  '操作未完成，请重试': 'Something went wrong. Please try again.', '家具信息不完整': 'Furniture information is incomplete.', '请选择有效的家具类型': 'Choose a valid furniture type.',
  '设置格式不正确': 'The settings format is invalid.', '开发者登录配置不完整': 'Developer sign-in is not configured completely.',
  '本机保存的数据无法读取，已恢复为空白状态。原始记录会在下次成功保存时替换。': 'Saved data could not be read. The app is showing an empty state; the original records will be replaced after the next successful save.',
  '暂时无法读取本机存储，请检查存储权限或可用空间后重新打开应用。': 'Local storage is unavailable. Check storage permissions or free space, then reopen the app.',
  '请先登录开发者账号': 'Sign in with your developer account first.', '保存失败，本次更改未保存。请检查可用空间后重试。': 'Changes were not saved. Check your available storage and try again.',
  '账号或密码不正确': 'The account or password is incorrect.', '生成家具编号失败，请重试': 'Could not create a furniture ID. Please try again.', '这件家具已不存在，请刷新后重试': 'This piece no longer exists. Refresh and try again.',
  '无法保存语言设置，请检查可用空间后重试。': 'Could not save the language. Check your available storage and try again.',
  '昵称': 'Display name', '默认房间': 'Default room', '型号': 'Model',
};

export function getLocale(): Locale { return locale; }
export function setLocale(next: Locale): void {
  try { localStorage.setItem(LOCALE_KEY, next); }
  catch { throw new Error('无法保存语言设置，请检查可用空间后重试。'); }
  locale = next;
}
export function t(text: string, values: Record<string, string | number> = {}): string {
  const translated = locale === 'en' ? english[text] ?? text : text;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

const rooms = ['客厅', '卧室', '餐厅', '书房', '阳台', '其他'];
export function roomLabel(value: string): string { return rooms.includes(value) ? t(value) : value; }
export function roomValue(value: string, original?: string): string {
  const trimmed = value.trim();
  if (original !== undefined && trimmed === roomLabel(original)) return original;
  return rooms.find((room) => room === trimmed || english[room].toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}
export function translateError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '操作未完成，请重试';
  if (locale !== 'en') return message;
  const required = /^请填写(.+)$/.exec(message);
  if (required && english[required[1]]) return `Enter ${t(required[1]).toLowerCase()}.`;
  const limit = /^(.+)最多填写 (\d+) 个字$/.exec(message);
  if (limit) return `${t(limit[1])} must be ${limit[2]} characters or fewer.`;
  return english[message] ?? 'Something went wrong. Please try again.';
}
