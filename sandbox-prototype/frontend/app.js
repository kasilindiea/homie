import { ProductStore, currentState, hasEvidence, trustedHistory, executionItems, awaitingObject } from './data-model.js';
import { LocalGateway } from './local-gateway.js';
import { HttpGateway } from './http-gateway.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => value ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)) : '尚无有效证据';
const title = {entry_door:'玄关门',balcony_door:'阳台门',living_room_light:'客厅灯',bedroom_ac:'卧室空调',entryway:'玄关',living_room:'客厅',bedroom:'卧室',balcony:'阳台'};
const orderedIds = ['entry_door','balcony_door','living_room_light','bedroom_ac'];
const sourceName = {manual:'人工确认',sensor:'门磁',device:'设备读数'};
const statusName = {pending:'待执行',running:'执行中',awaiting_readback:'等待设备回读',confirmed:'执行结果已确认',failed:'执行失败',unknown:'结果待核实'};
const icons = {
  entry_door:'<path d="M5 21V3h12v18M8 21V5l7-2v18M11 12h1"/>',
  balcony_door:'<path d="M3 4h18v16H3ZM12 4v16M9 11v3m6-3v3"/>',
  living_room_light:'<path d="m8 3-3 9h14l-3-9ZM12 12v8m-4 1h8"/>',
  bedroom_ac:'<rect x="3" y="4" width="18" height="10" rx="2"/><path d="M6 10h12M7 17v3m5-3v4m5-4v3"/>'
};
let catalog,mode=new URLSearchParams(location.search).get("mode")||"local",busy=false,lastRetry=null;
let store,gateway,scene,map,view,selected=null,everyone=false,resultMode=false,timer=null,loadingScene=false;
function message(text) { $('#live-message').textContent=text; }
function actual(object) {
  const state=currentState(object);
  if(state==='unknown')return object?.availability==='offline'?'状态未知 · 设备离线':object?.availability==='stale'?'状态未知 · 读数过期':'状态未知';
  return ({on:'开启',off:'已关闭',open:'开启',closed:object.object_id==='entry_door'?'住户已确认关闭':'已合上 · 门磁'})[state];
}
function manualRecord() { return view?.task?.manual_records.find(r=>r.object_id==='entry_door'); }
function focus(id) {
  selected=id;resultMode=false;
  if(scene){try{scene.focus(id);}catch(error){message(error.message);}}
  else message('户型尚未就绪，已打开文字详情');
  render();
  $('#detail-panel').scrollIntoView({block:'nearest'});
}
function updateQueue() {
  const next=gateway?.queue[0];
  $('#queue-status').textContent=next ? `还剩 ${gateway.queue.length} 条 · 下一条：${next.label}` : '尚无待接收响应';
  $('#next-response').disabled=!next;
}
function schedule() {
  clearTimeout(timer);
  if(mode==='local' && !$('#manual-steps').checked && gateway.queue.length) timer=setTimeout(()=>{message(gateway.next());render();schedule();},3000);
}
async function perform(fn) {if(busy)return;busy=true;render();try{await fn();lastRetry=null;$('#request-error').hidden=true;}catch(error){lastRetry=fn;message(error.message);$('#request-error').hidden=false;$('#request-error-text').textContent=error.message;}finally{busy=false;render();}}
function renderRows() {
  const task=view.task,results=executionItems(view),record=manualRecord();
  $('#plan-list').innerHTML=orderedIds.map(id=>{
    const object=view.objects[id];
    const item=task?.plan.items.find(i=>i.object_id===id);
    const group=item?.group ?? ({entry_door:'manual',balcony_door:'check',living_room_light:'action',bedroom_ac:'keep'})[id];
    const result=results.find(r=>r.object_id===id);
    let label=actual(object),kind=group==='manual'?'人工核实':group==='check'?'只读检查':group==='keep'?'保留':'可执行';
    let note='';
    if(id==='entry_door'){label=record?.result==='confirmed_closed'?'住户已确认关闭':record?.result==='deferred'?'稍后核实 · 仍在待办':'待现场确认';note=record?.confirmed_at?`人工确认 · ${time(record.confirmed_at)}`:'普通门，需要现场核实';}
    if(id==='balcony_door')note=hasEvidence(object)?`门磁 · ${time(object.updated_at)}`:'重新读取可核实当前状态';
    if(id==='living_room_light')label=group==='action'?`建议关灯 · 当前${actual(object)}`:actual(object);
    if(id==='bedroom_ac'){label=group==='keep'?(currentState(object)==='on'?'保持运行 · 猫留卧室':`保留空调 · ${actual(object)}`):group==='action'?`关空调候选 · 当前${actual(object)}`:actual(object);note=group==='keep'?'留家约束优先，空调不参与关灯':'默认不勾选，需要单独确认';}
    if(result){kind=statusName[result.status];label=`设备实况：${actual(object)}`;note=statusName[result.status];if(result.status==='confirmed')note+=` · ${time(result.readback_at)}`;if(awaitingObject(result,view.objects))note+=' · 最新设备读数待同步';if(result.status==='awaiting_readback'&&currentState(object)==='off')note+=' · 设备已关闭，执行结果待更新';if(result.error)note+=' · '+(result.error.message??result.error);}
    const checkbox=group==='action'&&task?`<input type="checkbox" data-item="${escape(item.item_id)}" aria-label="${id==='bedroom_ac'?'选择关闭卧室空调':'选择关闭客厅灯'}" ${task.selected.includes(item.item_id)?'checked':''} ${task.activeExecutionId?'disabled':''}>`:'';
    return `<article class="plan-row ${selected===id?'selected':''}" data-row-object="${id}"><span class="row-symbol"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${icons[id]}</svg></span><button class="row-main" data-object="${id}" aria-label="${escape(title[id]+' · '+label)}"><strong>${title[id]}</strong><small>${escape(label)}</small>${note?`<small class="${result?.status==='confirmed'?'result-text':group==='manual'||result?.status==='awaiting_readback'?'pending-text':''}">${escape(note)}</small>`:''}</button><span class="row-end"><span class="mini-pill ${result?.status==='confirmed'?'success':group}">${escape(kind)}</span>${checkbox}</span></article>`;
  }).join('');
  for(const button of document.querySelectorAll('[data-object]'))button.onclick=()=>focus(button.dataset.object);
  for(const input of document.querySelectorAll('[data-item]'))input.onchange=()=>store.select(input.dataset.item,input.checked);
}
function renderDetail() {
  const record=manualRecord(),object=view.objects[selected];
  $('#detail-title').textContent=resultMode?'逐项执行结果':title[selected]??'家的当前状态';
  $('#detail-kind').textContent=resultMode?'本次任务':object?'设备实况':selected?'房间':'全屋';
  let html='';
  if(resultMode) {
    html=executionItems(view).map(item=>`<p class="detail-status">${title[item.object_id]} · ${statusName[item.status]}</p><p class="detail-source">${item.readback_at?'回读证据 · '+time(item.readback_at):'尚无执行回读证据'}${awaitingObject(item,view.objects)?' · 最新设备读数待同步':''}</p>`).join('');
    html+=`<p class="detail-prompt">玄关：${record?.result==='confirmed_closed'?'人工已核实':record?.result==='deferred'?'稍后核实':'仍待现场确认'}。${view.family.retain_room_ids.includes('bedroom')?'卧室空调继续保留。':''}本人声明独立保留。</p>`;
  } else if(!object) {
    html=`<div class="home-summary"><div><b>${selected?'房间概览':'4 个'}</b><span>${selected?'点击对应设备查看实况':'待查看的家庭对象'}</span></div><div><b>${view.family.occupancy==='occupied'?'猫留卧室':'全员离家'}</b><span>${view.family.retain_room_ids.includes('bedroom')?'卧室空调保留 · '+actual(view.objects.bedroom_ac):'按计划逐项确认'}</span></div></div><p class="detail-prompt">${selected?'空间切换会保留任务、勾选与执行进度。':'选择户型中的设备，或右侧清单，查看来源与更新时间。'}</p>`;
  } else {
    const state=actual(object),history=trustedHistory(object);
    html=`<p class="detail-status">${escape(selected==='entry_door'&&record?.result!=='confirmed_closed'?(record?.result==='deferred'?'稍后核实 · 保留在待办':'待现场确认'):state)}</p><p class="detail-source">${hasEvidence(object)?`${sourceName[object.source]} · ${time(object.updated_at)}`:'尚无有效的当前读数'}</p>`;
    if(history)html+=`<p class="detail-source">最后读数：${({on:'开启',off:'关闭',open:'开启',closed:'已合上'})[history.state]} · ${sourceName[history.source]} · ${time(history.at)}</p>`;
    if(object.power_state)html+=`<p class="detail-source">供电：${({powered:'仍通电',unpowered:'已断电',unknown:'未知'})[object.power_state]}</p>`;
    if(selected==='bedroom_ac')html+=`<div class="telemetry"><div><b>${object.current_temperature_c??'—'}<small> °C</small></b><span>当前室温</span></div><div><b>${object.target_temperature_c??'—'}<small> °C</small></b><span>设备设定</span></div></div>`;
    if(selected==='entry_door')html+=`<div class="detail-actions"><button id="manual-confirm" class="button confirm-manual" ${!view.task||record?.result==='confirmed_closed'?'disabled':''}>${record?.result==='confirmed_closed'?'已记录人工确认':'我已确认关闭'}</button><button id="manual-defer" class="button" ${!view.task||record?.result==='confirmed_closed'?'disabled':''}>稍后核实</button></div><p class="field-note">此操作仅确认玄关门，不代表本人已出门。</p>`;
    if(selected==='balcony_door')html+='<p class="detail-prompt">门磁只反映开合，不代表已上锁。</p>';
    const result=executionItems(view).find(r=>r.object_id===selected);
    if(result)html+=`<p class="detail-source ${awaitingObject(result,view.objects)?'status-warning':''}">任务：${statusName[result.status]}${awaitingObject(result,view.objects)?' · 最新设备读数待同步':''}</p>`;
  }
  $('#detail-content').innerHTML=html;
  if(mode==='http'&&object){const refresh=document.createElement('button');refresh.className='button';refresh.textContent='重新读取对象';refresh.onclick=()=>perform(()=>gateway.refresh([selected],false));$('#detail-content').append(refresh);}
  if($('#manual-confirm'))$('#manual-confirm').onclick=()=>perform(async()=>{await gateway.manual('confirmed_closed');message('已记录玄关人工确认，本人出门状态未改变');});
  if($('#manual-defer'))$('#manual-defer').onclick=()=>perform(async()=>{await gateway.manual('deferred');message('玄关保留待办，仍可独立确认关灯');});
}
function render() {
  if(!store)return;
  view=store.view();const task=view.task,results=executionItems(view),selectedCount=task?.selected.length??0;
  $('.task-panel').classList.toggle('has-plan',!!task);
  $('.task-header>p').textContent=task?(view.family.retain_room_ids.includes('bedroom')?'猫留卧室 · 卧室空调保留':'全员离家 · 空调候选需单独勾选'):'检查门窗，照顾好留在家的它。';
  $('#away-status').textContent='本人：'+(view.family.user_away===true?'已出门':view.family.user_away===false?'未出门':'未声明');
  $('#away').disabled=!task||view.family.user_away===true;
  $('#away').textContent=view.family.user_away===true?'已记录出门':'我已出门';
  $('#intent').disabled=!!task;$('#cat-home').disabled=!!task;$('#everyone-away').disabled=!!task;
  $('#constraint-note').textContent=(task?view.family.retain_room_ids.includes('bedroom'):!everyone)?'卧室空调保留':'空调候选默认不选';
  $('#list-count').textContent=task?`${selectedCount} 项动作已选`:'4 个检查对象';
  $('#list-title').textContent=results.length?'逐项结果':'离家清单';
  $('#phase-badge').textContent=results.length?(results.every(r=>r.status==='confirmed')?'执行结果已确认':'等待回读'):task?'计划待确认':'准备计划';
  $('#breadcrumb').textContent=selected?`全屋 / ${title[selected]}`:'全屋概览';
  const room=selected?map.objects.find(o=>o.shared_id===selected)?.room_id:null;
  for(const button of document.querySelectorAll('[data-focus]'))button.classList.toggle('active',button.dataset.focus===(selected?(room??selected):'home'));
  renderRows();renderDetail();
  const primary=$('#primary');primary.disabled=false;primary.classList.remove('waiting');
  if(!task){primary.textContent='查看离家计划';$('#action-note').textContent='先确认留家安排，再查看离家计划';}
  else if(!task.activeExecutionId){primary.textContent=selectedCount===1&&task.selected.includes('item_living_room_light')?'确认关灯（1 项）':`确认执行（${selectedCount} 项）`;primary.disabled=!selectedCount;$('#action-note').textContent=`仅执行已选动作${manualRecord()?.result!=='confirmed_closed'?' · 玄关仍待核实':''}`;}
  else if(results.some(r=>['pending','running','awaiting_readback'].includes(r.status))){primary.textContent='等待设备回读';primary.disabled=true;primary.classList.add('waiting');$('#action-note').textContent='指令已发出 · 当前实况按设备读数显示';}
  else if(results.some(r=>awaitingObject(r,view.objects))){primary.textContent='刷新设备状态';$('#action-note').textContent='执行已确认 · 最新设备读数待同步';}
  else{primary.textContent=resultMode?'刷新状态':'查看逐项结果';$('#action-note').textContent=`${results.filter(r=>r.status==='confirmed').length} 项执行已确认${manualRecord()?.result!=='confirmed_closed'?' · 玄关仍待核实':' · 玄关人工已核实'}`;}
  const alerts=view.energy?.alerts??[];$('#energy-note').hidden=!alerts.length;$('#energy-note').textContent=alerts.map(a=>a.message).join(' · ');
  if(scene){const unknown=orderedIds.filter(id=>id!=='entry_door'&&currentState(view.objects[id])==='unknown');$('#scene-readiness').textContent=unknown.length?'状态未知：'+unknown.map(id=>title[id]).join('、'):'小公寓 · 演示实况';$('#scene-readiness').classList.toggle('status-warning',!!unknown.length);scene.apply(view.objects);scene.preview($('#preview').checked?(task?.plan.items.filter(i=>i.group==='action'&&task.selected.includes(i.item_id)).map(i=>i.object_id)??[]):[]);}
  if(mode==='http'&&results.some(r=>['failed','unknown'].includes(r.status))){primary.textContent='刷新状态后核实 / 重试';primary.disabled=false;$('#action-note').textContent=results.some(r=>r.status==='failed')?'部分失败 · 成功项保留':'结果待核实 · 请先刷新状态';}
  if(mode==='http'&&task?.affected?.length){$('#action-note').textContent='计划已变化，请重新确认受影响条目；无需动作项不重复执行';}
  if(busy||mode==='http'&&!gateway.connected)primary.disabled=true;
  $('#http-session').textContent=mode==='http'?`会话：${gateway.session} · generation=${gateway.serverGeneration??'未连接'}`:'';
  updateQueue();
}
async function loadScene() {
  if(loadingScene)return;loadingScene=true;$('#model-loading').hidden=false;$('#model-error').hidden=true;
  try{const {createHomeScene}=await import('./scene.js');scene=await createHomeScene($('#stage'),map,id=>{selected=id;resultMode=false;render();if(id)$('#detail-panel').scrollIntoView({block:'nearest'});});$('#model-loading').hidden=true;$('#home-reset').disabled=false;$('#scene-readiness').textContent='小公寓 · 演示实况';render();}
  catch(error){$('#model-loading').hidden=true;$('#model-error').hidden=false;$('#model-error-text').textContent='请检查本地模型资源后重试。任务清单仍可使用。';$('#scene-readiness').textContent='模型加载失败';console.error(error);}
  finally{loadingScene=false;}
}

$('#demo-open').onclick=()=>{$('#demo-dialog').showModal();updateQueue();};
$('#primary').onclick=()=>perform(async()=>{
  if(!view.task){await gateway.createPlan({intent:$('#intent').value,everyone});message('计划已生成，卧室留家条件已纳入');return;}
  if(!view.task.activeExecutionId){await gateway.execute({planVersion:view.task.plan.plan_version,selectedIds:view.task.selected,confirmationId:crypto.randomUUID(),order:$('#readback-order').value});message('模拟指令已发出，等待独立的设备回读');schedule();return;}
  if(mode==='http'){await gateway.refresh();resultMode=true;return;}
  if(gateway.queue.length){message(gateway.next());schedule();return;}
  if(!resultMode){resultMode=true;selected=null;message('人工检查、设备读数与执行结果分别列示');}else message('当前没有新的模拟读数，已有结果保持不变');
});
$('#away').onclick=()=>perform(async()=>{await gateway.userAway();message('本人已出门；玄关核实与留家条件保持独立');});
$('#cat-home').onclick=()=>{everyone=false;$('#cat-home').classList.add('selected');$('#everyone-away').classList.remove('selected');$('#cat-home').setAttribute('aria-pressed','true');$('#everyone-away').setAttribute('aria-pressed','false');$('#intent').value='我出门两小时，猫留在卧室。';render();};
$('#everyone-away').onclick=()=>{everyone=true;$('#everyone-away').classList.add('selected');$('#cat-home').classList.remove('selected');$('#cat-home').setAttribute('aria-pressed','false');$('#everyone-away').setAttribute('aria-pressed','true');$('#intent').value='我出门两小时，家中没有人或宠物留下。';render();};
$('#home-reset').onclick=()=>{scene?.reset();message('已回到全屋，任务与勾选保持不变');};
for(const button of document.querySelectorAll('[data-focus]'))button.onclick=()=>button.dataset.focus==='home'?scene?.reset():focus(button.dataset.focus);
$('#preview').onchange=()=>render();$('#labels').onchange=()=>scene?.setLabels($('#labels').value);
$('#retry-model').onclick=loadScene;
$('#manual-steps').onchange=()=>schedule();
$('#next-response').onclick=()=>perform(()=>{clearTimeout(timer);message(gateway.next());schedule();});
$('#demo-reset').onclick=()=>perform(async()=>{clearTimeout(timer);await gateway.reset(mode==='http'?{scenario:$('#http-scenario').value,clock:'manual'}:undefined);everyone=false;selected=null;resultMode=false;$('#cat-home').click();scene?.reset();$('#demo-dialog').close();message('本地演示已复位；所有数据均为模拟');});
window.addEventListener('beforeunload',()=>{clearTimeout(timer);scene?.destroy();});


async function switchMode(next){
 clearTimeout(timer);gateway.deactivate?.();mode=next;selected=null;resultMode=false;
 if(mode==='http'){
  const initial=structuredClone(catalog.baseline_snapshot);initial.objects={};initial.plan=null;initial.execution=[];store.reset(initial);
  gateway=new HttpGateway(store,{base:$('#http-base').value,session:$('#http-session-input').value||'frontend-'+crypto.randomUUID()});
  $('#http-session-input').value=gateway.session;
 }else{store.reset(catalog.baseline_snapshot);gateway=new LocalGateway(catalog,store);}
 $('.demo-badge').innerHTML='<i></i>'+(mode==='http'?'模拟服务':'本地样例');$('#data-mode').value=mode;
 $('#http-controls').hidden=mode!=='http';
 if(mode==='http')await gateway.connect();
 render();
}
$('#connect-mode').onclick=()=>perform(()=>switchMode($('#data-mode').value));
$('#retry-request').onclick=()=>{if(lastRetry)perform(lastRetry);};
$('#advance-clock').onclick=()=>perform(async()=>{const r=await gateway.advance(Number($('#advance-ms').value));message('模拟时钟：'+r.simulation_now);});
$('#query-execution').onclick=()=>perform(()=>gateway.query());
$('#refresh-http').onclick=()=>perform(()=>gateway.refresh());
$('#retry-failed').onclick=()=>perform(()=>gateway.retryFailed());
$('#insert-energy').onclick=()=>perform(async()=>{for(const step of catalog.scenarios.find(s=>s.id==='daily_excess').steps)await gateway.energy(step.request.body);message('能源采样已更新，离家任务与设备实况保留');});

try {
  const loadJSON=async url=>{const response=await fetch(url);if(!response.ok)throw new Error('本地资源读取失败：'+url);return response.json();};
  const [mapping,loadedCatalog]=await Promise.all([loadJSON('../house-modeling/releases/v0.1/object-map.actual.json'),loadJSON('../backend/离家检查联调样例.json')]);
  catalog=loadedCatalog;map=mapping;store=new ProductStore(map,catalog.baseline_snapshot);gateway=new LocalGateway(catalog,store);store.subscribe(render);await loadScene();if(mode==='http')await perform(()=>switchMode('http'));
  // Read-only diagnostic export, no hidden commands or device controls.
  window.frontendDiagnostics=Object.freeze({inspect:()=>({view:store.view(),scene:scene?.inspect(),queue:gateway.queue.map(e=>e.label),selected,mode,session:gateway.session,generation:gateway.serverGeneration,trace:gateway.trace??[]})});
} catch(error){message(error.message);$('#primary').textContent='本地数据未就绪，请重新加载页面';$('#primary').disabled=true;$('#model-loading').hidden=true;$('#model-error').hidden=false;$('#model-error-text').textContent=error.message;console.error(error);}
