import { getLocale } from '../i18n';

const english: Record<string, string> = {
  '未来家庭': 'FUTURE HOME', '离家检查': 'Away check', '布局演示': 'Layout demo',
  '演示数据': 'Demo data', '场景占位': 'Scene placeholder', '全屋复位': 'Reset view',
  '固定小公寓 · 场景示意': 'Small apartment · illustrative layout',
  '3D 场景待接入': '3D scene not connected',
  '这里将展示你的家庭模型，目前为示意图。': 'Your home model will appear here. This is an illustration.',
  '模型与设备定位尚未接入，复位暂不可用。': 'The model and device locations are not connected. Reset is unavailable.',
  '正在加载场景': 'Loading the scene', '请稍候，正在准备家庭模型。': 'Please wait while the home model is prepared.',
  '场景未能加载': 'The scene could not load',
  '设备列表仍可查看。模型接入后将在这里提供重试。': 'You can still view devices. Retry will be available when the model is connected.',
  '重试': 'Retry', '设备': 'Devices', '离家任务': 'Away tasks', '已登记 {count} 件': '{count} registered',
  '下方数值均为固定示例，不代表真实检测或设备读数。': 'Values below are fixed examples, not live checks or device readings.',
  '还没有已登记的家具': 'No furniture registered yet',
  '在“添加”页登记的家具会显示在这里。沙盒用于查看和检查。': 'Furniture registered on the Add page appears here. The sandbox is for viewing and checking.',
  '查看 {name} 的沙盒详情': 'View sandbox details for {name}', '查看详情': 'View details',
  '24 小时用电量': '24h energy use', '当前功率': 'Current power',
  '24 小时充电量': '24h charge energy', '当前充电功率': 'Charging power',
  '24 小时发电量': '24h generation', '当前发电功率': 'Generation power',
  '开启状态': 'Power state', '开启': 'On', '关闭': 'Off', '充电中': 'Charging', '发电中': 'Generating',
  '不适用': 'Not applicable', '无示例读数': 'No example reading',
  '返回设备列表': 'Back to devices', '家具详情': 'Furniture details', '登记信息': 'Registration',
  '运行概览': 'Overview', '电量': 'Battery level', '演示电量': 'Demo battery level',
  '场景关联': 'Scene link', '尚未映射': 'Not mapped', '数据来源': 'Data source',
  '本机家具记录 + 固定演示读数': 'Local furniture record + fixed demo readings',
  '当前为充电场景示例，不代表设备总容量或剩余电量。': 'This example shows charging, not total capacity or remaining energy.',
  '此处为发电示例，发电量与家庭用电量分开显示。': 'This example shows generation separately from home energy use.',
  '这类历史家具保留登记信息，不提供用电示例。': 'Registration is preserved for this legacy category. No energy example is supplied.',
  '定位家具': 'Locate furniture', '设备控制待接入': 'Device control not connected',
  '模型定位和设备控制将在后续接入。当前无法执行。': 'Model locations and device controls will be connected later. These actions are unavailable.',
  '演示任务 · 尚未接入': 'Demo tasks · not connected',
  '任务用于预览离家流程，当前不会执行检查或控制设备。': 'These tasks preview the away flow. No checks or device commands are executed.',
  '玄关门 · 人工检查': 'Entry door · manual check',
  '普通门需要人工确认；模型定位不代表检查完成。': 'A regular door needs a manual check. Locating it does not complete the check.',
  '定位玄关': 'Locate entrance', '人工检查': 'Manual check', '待人工检查': 'Manual check pending',
  '客厅灯 · 关灯计划': 'Living room light · off plan',
  '后续将高亮计划涉及的灯具；预览计划不会改变设备状态。': 'The planned lights will be highlighted later. Previewing a plan does not change device state.',
  '查看关灯计划': 'View off plan', '计划未接入': 'Plan not connected',
  '执行反馈': 'Execution feedback', '指令受理': 'Command acknowledgement', '有效设备读数': 'Valid device reading',
  '尚未接入': 'Not connected',
  '只有收到有效设备读数后，场景才会更新灯光。': 'Scene lighting updates only after a valid device reading arrives.',
  '家具记录已变化，请返回列表查看。': 'This record has changed. Return to the device list.',
};

/** Sandbox presentation copy. User-entered names and notes never pass through here. */
export function sandboxText(text: string, values: Record<string, string | number> = {}): string {
  const translated = getLocale() === 'en' ? english[text] ?? text : text;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function sandboxEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
