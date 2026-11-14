// Framework-neutral read-only device state input. No network/device actions.
export const STATE_SCHEMA_VERSION='0.5';
const clone=v=>structuredClone(v),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const available=['online','offline','stale','not_applicable'];
const numeric=['current_temperature_c','target_temperature_c','remaining_minutes','timer_remaining_minutes','temperature_c','position_pct','soc_pct','reserve_pct'];
const stale=v=>v.availability==='offline'||v.availability==='stale';
function merge(a,b){const out=clone(a||{});for(const [k,v]of Object.entries(b)){if(['__proto__','prototype','constructor'].includes(k))throw new TypeError('Invalid field');if(v===undefined)continue;out[k]=plain(v)&&plain(out[k])?merge(out[k],v):clone(v);}return out;}
function enumValue(v,values,key){if(v===undefined)return 'unknown';if(!values.includes(v))throw new TypeError('Invalid '+key+': '+v);return v;}
function numberValue(v,key){if(v===undefined||v===null)return null;if(typeof v!=='number'||!Number.isFinite(v))throw new TypeError('Invalid number: '+key);if((key.includes('minutes')||key.endsWith('_pct'))&&v<0)throw new TypeError('Negative '+key);if(key.endsWith('_pct')&&v>100)throw new TypeError('Out of range '+key);return v;}
function timestamp(v){if(v===undefined||v===null)return null;if(typeof v!=='string'||!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw new TypeError('Timestamp requires timezone');return v;}
function evidence(v){v.availability=enumValue(v.availability,available,'availability');if(v.availability==='unknown')v.availability='stale';v.source=v.source??null;if(![null,'device','sensor','manual'].includes(v.source))throw new TypeError('Invalid source');v.updated_at=timestamp(v.updated_at);}
function invalidate(v,fields){
 const history={};for(const k of fields)if(v.updated_at&&v.source&&v[k]!==null&&v[k]!==undefined&&v[k]!=='unknown')history[k]=clone(v[k]);
 if(Object.keys(history).length){v.last_known_values={...(v.last_known_values||{}),...history};v.last_known_at=v.updated_at??v.last_known_at??null;}
 for(const k of fields)v[k]=numeric.includes(k)||k==='program'?null:'unknown';
 v.updated_at=null;
}
function zone(input,unit){
 const z=clone(input||{});if(z.source===undefined)z.source=null;if(z.availability===undefined)z.availability='stale';if(z.updated_at===undefined)z.updated_at=null;
 evidence(z);z.current_temperature_c=numberValue(z.current_temperature_c,'current_temperature_c');z.target_temperature_c=numberValue(z.target_temperature_c,'target_temperature_c');
 if(stale(unit))z.availability=unit.availability;
 if(stale(z)||!z.source||!z.updated_at)invalidate(z,['current_temperature_c','target_temperature_c']);
 return z;
}
function normalize(raw,meta){
 const v=clone(raw||{});if(v.object_id!==undefined&&v.object_id!==meta.shared_id)throw new TypeError('object_id mismatch');if(v.room_id!==undefined&&v.room_id!==meta.room_id)throw new TypeError('room_id mismatch');
 v.object_id=meta.shared_id;v.room_id=meta.room_id;evidence(v);
 const fields=[];const type=meta.object_type,id=meta.shared_id;
 if(type==='manual_check'||type==='contact_sensor'){v.state=enumValue(v.state,['open','closed','unknown'],'state');fields.push('state');}
 if(type==='switch'){v.state=enumValue(v.state,['on','off','unknown'],'state');fields.push('state');}
 if(['switch','washing_machine','refrigerator','cover'].includes(type)){v.power_state=enumValue(v.power_state,['powered','unpowered','unknown'],'power_state');fields.push('power_state');}
 if(id==='bedroom_ac'){
  for(const k of['current_temperature_c','target_temperature_c','timer_remaining_minutes']){v[k]=numberValue(v[k],k);fields.push(k);}
  v.hvac_mode=enumValue(v.hvac_mode,['cool','heat','auto','dry','fan_only','off','unknown'],'hvac_mode');fields.push('hvac_mode');
  v.timer_state=enumValue(v.timer_state,['disabled','active','unknown'],'timer_state');fields.push('timer_state');if(v.timer_state!=='active')v.timer_remaining_minutes=null;
 }
 if(type==='washing_machine'){
  v.cycle_state=enumValue(v.cycle_state,['off','idle','running','paused','completed','error','unknown'],'cycle_state');fields.push('cycle_state');
  v.phase=enumValue(v.phase,['washing','rinsing','spinning','soaking','drying','idle','completed','unknown'],'phase');fields.push('phase');
  if(v.program!==undefined&&v.program!==null&&typeof v.program!=='string')throw new TypeError('program must be string or null');v.program=v.program??null;fields.push('program');
  for(const k of['remaining_minutes','current_temperature_c','target_temperature_c']){v[k]=numberValue(v[k],k);fields.push(k);}
 }
 if(type==='refrigerator'){
  v.door_state=enumValue(v.door_state,['open','closed','unknown'],'door_state');fields.push('door_state');
  const compartments=clone(v.compartments||{});
  if(!compartments.fridge&&v.temperature_c!==undefined)compartments.fridge={current_temperature_c:numberValue(v.temperature_c,'temperature_c'),source:v.source,availability:v.availability,updated_at:v.updated_at};
  for(const key of Object.keys(compartments))if(!['fridge','freezer'].includes(key))throw new TypeError('Unknown fridge compartment');
  v.compartments={fridge:zone(compartments.fridge,v),freezer:zone(compartments.freezer,v)};delete v.temperature_c;
 }
 if(type==='cover'){v.cover_state=enumValue(v.cover_state,['open','closed','opening','closing','stopped','unknown'],'cover_state');v.position_pct=numberValue(v.position_pct,'position_pct');fields.push('cover_state','position_pct');}
 if(id==='home_battery'){for(const k of['soc_pct','reserve_pct'])v[k]=numberValue(v[k],k);fields.push('soc_pct','reserve_pct');}
 // Known current values require evidence. Manual entry-door evidence remains
 // separate from task confirmation records; this store does not create either.
 const validManual=type==='manual_check'&&v.source==='manual'&&v.updated_at&&v.availability==='not_applicable';
 const validDevice=type!=='manual_check'&&v.availability==='online'&&v.source!==null&&v.updated_at;
 if(!validManual&&!validDevice)invalidate(v,fields);
 // Per-field metadata can override the shared timestamp/source; a missing
 // measurement never borrows the corresponding setpoint.
 const suppliedMeta=clone(v.field_meta||{});v.field_meta={};
 for(const key of fields.filter(k=>numeric.includes(k))){
  const fm={source:v.source,updated_at:v.updated_at,availability:v.availability,...suppliedMeta[key]};evidence(fm);
  fm.unit=key.includes('temperature')?'°C':key.includes('minutes')?'min':key.endsWith('_pct')?'%':'';
  if(stale(v))fm.availability=v.availability;
  if(stale(fm)||!fm.source||!fm.updated_at){if(v[key]!==null&&fm.source&&fm.updated_at){fm.last_known_value=v[key];fm.last_known_at=fm.updated_at;}v[key]=null;fm.updated_at=null;}
  v.field_meta[key]=fm;
 }
 v.consistency_warnings=[];
 if(v.power_state==='unpowered'&&(v.state==='on'||v.cycle_state==='running'))v.consistency_warnings.push('power_unpowered_with_running_state');
 return v;
}

const ENERGY_UNITS={instant_power_w:'W',today_used_kwh:'kWh',month_used_kwh:'kWh',estimated_cost:'CNY',soc_pct:'%',estimated_runtime_minutes:'min'};
export function normalizeEnergy(input){
 if(input===undefined||input===null)return null;const e=clone(input);e.measurements=e.measurements||{};
 for(const key of Object.keys(e.measurements))if(!(key in ENERGY_UNITS))throw new TypeError('Unknown energy measurement');
 for(const [key,unit]of Object.entries(ENERGY_UNITS)){
  const m=clone(e.measurements[key]||{value:null,unit,source:null,updated_at:null,availability:'stale',data_kind:'simulated'});
  if(m.unit!==unit)throw new TypeError('Invalid energy unit for '+key);m.value=numberValue(m.value,key);if(m.value!==null&&m.value<0)throw new TypeError('Negative energy value');
  m.availability=enumValue(m.availability,available,'energy availability');if(m.availability==='unknown')m.availability='stale';m.updated_at=timestamp(m.updated_at);m.source=m.source??null;
  if(![null,'meter','storage','calculation','simulator'].includes(m.source))throw new TypeError('Invalid energy source');
  m.data_kind=enumValue(m.data_kind,['measured','estimated','simulated'],'data_kind');if(m.data_kind==='unknown')throw new TypeError('Energy data_kind required');
  if(m.data_kind==='estimated'&&(!m.assumptions||!m.basis_kind))throw new TypeError('Estimate needs assumptions and basis_kind');
  if(stale(m)||!m.source||!m.updated_at){if(m.value!==null&&m.source&&m.updated_at){m.last_known_value=m.value;m.last_known_at=m.updated_at;}m.value=null;m.updated_at=null;}
  e.measurements[key]=m;
 }
 for(const k of['today_used_kwh','month_used_kwh','soc_pct'])e[k]=e.measurements[k].value;
 if(e.objective!==undefined&&!['reduce_consumption','reduce_grid_cost','extend_backup'].includes(e.objective))throw new TypeError('Invalid energy objective');
 return e;
}
function validateNumbers(value){if(typeof value==='number'&&!Number.isFinite(value))throw new TypeError('Non-finite number');if(Array.isArray(value))value.forEach(validateNumbers);else if(plain(value))Object.values(value).forEach(validateNumbers);}

export class DeviceStateStore {
 constructor({templateId,objectDefinitions,initialSnapshot}){
  this.templateId=templateId;this.definitions=objectDefinitions.filter(r=>r.object_type!=='room');this.ids=new Set(this.definitions.map(r=>r.shared_id));this.listeners=new Set();this.value=null;this.replaceSnapshot(initialSnapshot);
 }
 prepare(snapshot){
  if(!plain(snapshot)||snapshot.template_id!==this.templateId)throw new TypeError('template_id mismatch');if(typeof snapshot.demo_mode!=='boolean')throw new TypeError('demo_mode required');if(!plain(snapshot.objects))throw new TypeError('objects map required');
  validateNumbers(snapshot);
  for(const id of Object.keys(snapshot.objects))if(!this.ids.has(id))throw new TypeError('Unknown object_id: '+id);
  const next=clone(snapshot);next.schema_version=STATE_SCHEMA_VERSION;next.objects={};
  for(const meta of this.definitions)next.objects[meta.shared_id]=normalize(snapshot.objects[meta.shared_id],meta);
  next.energy=normalizeEnergy(snapshot.energy);
  for(const item of next.plan?.items||[])if(!this.ids.has(item.object_id))throw new TypeError('Unknown plan object');
  for(const item of next.execution||[])if(!this.ids.has(item.object_id)||!['pending','running','awaiting_readback','confirmed','failed','unknown'].includes(item.status))throw new TypeError('Invalid execution result');
  for(const [id,c]of Object.entries(next.capabilities||{})){
   if(!this.ids.has(id)||!['unverified','simulation','physical'].includes(c.verification_scope)||!Array.isArray(c.allowed_actions))throw new TypeError('Invalid capabilities');
  }
  return next;
 }
 replaceSnapshot(snapshot){const next=this.prepare(snapshot);this.value=next;this.emit();return this.getSnapshot();}
 patchObjects(patch){if(!plain(patch)||patch.template_id!==this.templateId||!plain(patch.objects))throw new TypeError('Invalid state patch');const next=merge(this.value,patch);return this.replaceSnapshot(next);}
 getSnapshot(){return clone(this.value);}
 subscribe(listener,{immediate=true}={}){this.listeners.add(listener);if(immediate)listener(this.getSnapshot());return()=>this.listeners.delete(listener);}
 emit(){for(const listener of this.listeners)listener(this.getSnapshot());}
}

export function powerText(v){return ({powered:'仍通电',unpowered:'已断电',unknown:'供电未知'})[v.power_state]||'';}
export function deviceSummary(v,meta){
 if(!v)return '区域';if(stale(v))return '当前未知 · '+(v.availability==='offline'?'离线':'读数过期');
 const type=meta.object_type;let text='当前未知';
 if(type==='manual_check'||type==='contact_sensor')return ({open:'开启',closed:'已合上',unknown:'待核实'})[v.state]+' · '+(v.source==='manual'?'人工':v.source==='sensor'?'门磁':'无证据');
 if(type==='washing_machine')text=({off:'关闭',idle:'待机',running:'运行中',paused:'已暂停',completed:'已完成',error:'故障',unknown:'当前未知'})[v.cycle_state]+(v.remaining_minutes!==null?' · 剩余 '+v.remaining_minutes+' 分钟':'');
 else if(type==='refrigerator')text='冷藏 '+temp(v.compartments.fridge.current_temperature_c)+' / 冷冻 '+temp(v.compartments.freezer.current_temperature_c);
 else if(type==='cover')text=({open:'打开',closed:'关闭',opening:'打开中',closing:'关闭中',stopped:'停止',unknown:'当前未知'})[v.cover_state];
 else text=({on:'开启',off:'关闭',unknown:'当前未知'})[v.state]||'当前未知';
 return text+(v.power_state?' · '+powerText(v):'')+(v.consistency_warnings?.length?' · 读数冲突':'');
}
const temp=v=>v===null||v===undefined?'未知':`${v}°C`;
export function deviceTelemetry(v,meta){
 if(!v)return [];
 const item=(key,label,value,unit='')=>{const m=v.field_meta?.[key]||v;return {key,label,value:value===null||value===undefined?'未知':String(value)+unit,availability:m.availability,updated_at:m.updated_at,source:m.source};};
 if(meta.shared_id==='bedroom_ac')return [item('current_temperature_c','当前室温',v.current_temperature_c,'°C'),item('target_temperature_c','设定温度',v.target_temperature_c,'°C'),item('timer_remaining_minutes','定时关闭',v.timer_state==='disabled'?'未设置':v.timer_state==='active'&&v.timer_remaining_minutes!==null?v.timer_remaining_minutes+' 分钟':null),item('hvac_mode','运行模式',({cool:'制冷',heat:'制热',auto:'自动',dry:'除湿',fan_only:'送风',off:'关闭',unknown:'未知'})[v.hvac_mode])];
 if(meta.object_type==='washing_machine')return [item('program','工作程序',v.program),item('phase','当前阶段',({washing:'洗涤',rinsing:'漂洗',spinning:'脱水',soaking:'浸泡',drying:'烘干',idle:'待机',completed:'完成',unknown:'未知'})[v.phase]),item('remaining_minutes','剩余时间',v.remaining_minutes,' 分钟'),item('current_temperature_c','实测水温',v.current_temperature_c,'°C'),item('target_temperature_c','洗涤设定温度',v.target_temperature_c,'°C')];
 if(meta.object_type==='refrigerator')return ['fridge','freezer'].map(key=>{const z=v.compartments[key];return {key,label:key==='fridge'?'冷藏室':'冷冻室',value:temp(z.current_temperature_c),secondary:'设定 '+temp(z.target_temperature_c),availability:z.availability,updated_at:z.updated_at,source:z.source};});
 return [];
}

export function energyTelemetry(energy){
 if(!energy)return [];const labels={instant_power_w:'实时功率',today_used_kwh:'今日电量',month_used_kwh:'本月电量',estimated_cost:'预计费用',soc_pct:'备电量',estimated_runtime_minutes:'续航估计'};
 return Object.entries(energy.measurements).map(([key,m])=>({key,label:labels[key],value:m.value===null?'未知':m.value+' '+m.unit,secondary:m.data_kind==='estimated'?'估算'+(m.basis_kind==='simulated'?' · 模拟输入':''):m.data_kind==='simulated'?'模拟数据':'实测数据',availability:m.availability,updated_at:m.updated_at,source:m.source,assumptions:m.assumptions}));
}

export function renderTelemetry(container,items){
 container.replaceChildren();container.hidden=items.length===0;
 for(const item of items){const card=document.createElement('div');card.className='telemetry-card';card.dataset.field=item.key;const label=document.createElement('span');label.textContent=item.label;const value=document.createElement('strong');value.textContent=item.value;card.append(label,value);
  if(item.secondary){const extra=document.createElement('small');extra.textContent=item.secondary;card.append(extra);}
  const status=document.createElement('small');const src=({device:'设备',sensor:'传感器',manual:'人工',meter:'计量',storage:'储能',calculation:'计算',simulator:'模拟器'})[item.source]||'来源未知';status.textContent=item.availability==='offline'?'分区/设备离线':item.availability==='stale'?'读数过期':item.value==='未知'?'无有效读数':item.updated_at?src+' · '+item.updated_at.slice(11,19):'无有效读数';if(item.assumptions)card.title=item.assumptions;card.append(status);container.append(card);
 }
}
