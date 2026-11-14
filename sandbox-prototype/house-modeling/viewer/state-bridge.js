import {DeviceStateStore,deviceTelemetry,renderTelemetry,energyTelemetry} from './state-provider.js';

// The bridge exposes state input / view output only. It has no control-command API.
export async function connectState({templateId,map,fixtureUrl,onSnapshot,focus,resetView,setPlanPreview,setLabelMode,getSelected,enableDebug=false}){
 const fixtures=await fetch(fixtureUrl).then(r=>{if(!r.ok)throw new Error('Cannot load fixture');return r.json();});
 if(fixtures.template_id!==templateId)throw new TypeError('Fixture template mismatch');
 const store=new DeviceStateStore({templateId,objectDefinitions:map.objects,initialSnapshot:fixtures.scenarios[0].snapshot});
 const panel=document.querySelector('#debug-scenarios'),select=document.querySelector('#scenario-select');
 for(const s of fixtures.scenarios){const option=document.createElement('option');option.value=s.id;option.textContent=s.label;select.append(option);}
 const injectScenario=id=>{
  if(!enableDebug||!store.getSnapshot().demo_mode)throw new Error('Debug scenario injection disabled');
  const s=fixtures.scenarios.find(s=>s.id===id);if(!s)throw new TypeError('Unknown scenario');select.value=id;document.querySelector('#scenario-description').textContent=s.description;store.replaceSnapshot(s.snapshot);return store.getSnapshot();
 };
 select.onchange=()=>injectScenario(select.value);
 let first=true;store.subscribe(snapshot=>{
  panel.hidden=!enableDebug||!snapshot.demo_mode;select.disabled=!snapshot.demo_mode;
  const mode=document.querySelector('#data-mode');if(mode)mode.textContent=snapshot.demo_mode?'模拟数据':'外部状态';
  document.querySelector('#baseline').disabled=!enableDebug||!snapshot.demo_mode;
  renderTelemetry(document.querySelector('#energy-telemetry'),energyTelemetry(snapshot.energy));
  const goals={reduce_consumption:'减少用电',reduce_grid_cost:'降低购电费用',extend_backup:'延长备电时间'};
  document.querySelector('#energy-goal').textContent=snapshot.energy?'当前目标：'+(goals[snapshot.energy.objective]||'未指定')+'。三类目标分别评价。':'';
  document.querySelector('#energy-alerts').textContent=(snapshot.energy?.alerts||[]).map(a=>a.message).join(' ');
  onSnapshot(snapshot,{immediate:first});first=false;
 });
 const known=id=>{if(!map.objects.some(r=>r.shared_id===id&&r.spatial))throw new TypeError('Unknown spatial object');};
 const api=Object.freeze({version:'0.3',schemaVersion:'0.5',templateId,
  replaceSnapshot:s=>store.replaceSnapshot(s),patchObjects:p=>store.patchObjects(p),getSnapshot:()=>store.getSnapshot(),subscribe:(f,o)=>store.subscribe(f,o),
  focusObject:id=>{known(id);focus(id);},resetView:()=>resetView(),getSelected:()=>getSelected(),
  setPlanPreview:ids=>{if(!Array.isArray(ids))throw new TypeError('Array required');ids.forEach(known);setPlanPreview(ids);},setLabelMode,
  subscribeSelection:listener=>{const fn=e=>{if(e.detail.template_id===templateId)listener(structuredClone(e.detail));};window.addEventListener('futurehome:selection',fn);return()=>window.removeEventListener('futurehome:selection',fn);},
  debug:Object.freeze({listScenarios:()=>fixtures.scenarios.map(({id,label,description})=>({id,label,description})),injectScenario})});
 window.futureHome=api;
 document.querySelector('#baseline').onclick=()=>{injectScenario('baseline');setPlanPreview([]);resetView();};
 document.querySelector('#scenario-description').textContent=fixtures.scenarios[0].description;
 return {store,api};
}
export function emitSelection(templateId,id,map){const r=map.objects.find(r=>r.shared_id===id);window.dispatchEvent(new CustomEvent('futurehome:selection',{detail:{template_id:templateId,shared_id:id,room_id:r?.room_id??null,object_type:r?.object_type??null}}));}
export function showTelemetry(record,meta){renderTelemetry(document.querySelector('#telemetry'),deviceTelemetry(record,meta));}
