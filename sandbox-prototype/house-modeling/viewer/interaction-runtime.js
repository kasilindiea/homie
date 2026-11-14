import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0),ease=t=>t*t*(3-2*t);
const center=o=>new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
const size=o=>new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
const localDelta=(parent,delta)=>parent.worldToLocal(parent.getWorldPosition(new THREE.Vector3()).add(delta));

// Rendering consumes normalized snapshots only. Selection and plan preview
// never mutate this state; semantic roots and anchors stay in their original pose.
export class StateMotion {
 constructor({model,names,roots,lights={},templateId}){
  Object.assign(this,{model,names,roots,lights,templateId});this.doors=new Map();this.power=new Map();this.selected=null;this.time=0;this.washerRunning=false;
  model.updateMatrixWorld(true);this.makeEntry();this.makeSliders();this.makeAC();this.makeWasher();
  for(const id of Object.keys(roots))if(names[id+'__emitter']||id==='bedroom_ac'||names[id+'__screen'])this.power.set(id,{current:0,target:0,known:false});
 }
 makeEntry(){
  const root=this.roots.entry_door,leaf=this.names.entry_door__leaf;if(!root||!leaf)return;
  const box=new THREE.Box3().setFromObject(leaf),c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()),axis=s.x>s.z?'x':'z';
  const handle=this.names.entry_door__handle;const h=handle?center(handle)[axis]:box.max[axis];
  const hinge=c.clone();hinge[axis]=h>=c[axis]?box.min[axis]:box.max[axis];hinge.y=box.min.y;
  const pivot=new THREE.Group();pivot.name='entry_door__demo_hinge';pivot.userData={owner_id:'entry_door',role:'demo_hinge'};root.add(pivot);pivot.position.copy(root.worldToLocal(hinge));root.updateMatrixWorld(true);
  const parts=[...root.children].filter(o=>o!==pivot&&/leaf|handle|rosette|door_detail/.test(o.name)&&!/__anchor|__focus|frame|hinge|threshold/.test(o.name));
  for(const part of parts)pivot.attach(part);
  const q=root.getWorldQuaternion(new THREE.Quaternion()).invert(),up=UP.clone().applyQuaternion(q).normalize();
  this.doors.set('entry_door',{kind:'hinge',node:pivot,base:pivot.quaternion.clone(),axis:up,sign:this.templateId==='large_flat_128'?-1:1,current:0,target:0});
 }
 makeSliders(){
  for(const id of ['balcony_door','laundry_balcony_door']){
   const sliding=this.names[id+'__sliding'],fixed=this.names[id+'__fixed'];if(!sliding||!fixed)continue;
   const delta=center(fixed).sub(center(sliding));delta.y=0;if(Math.abs(delta.x)>Math.abs(delta.z))delta.z=0;else delta.x=0;
   const parent=sliding.parent;this.doors.set(id,{kind:'slide',node:sliding,base:sliding.position.clone(),delta:localDelta(parent,delta.multiplyScalar(.94)),current:0,target:0});
  }
 }
 frameAt(root,point,front,name){
  const right=new THREE.Vector3().crossVectors(UP,front).normalize();
  const group=new THREE.Group();group.name=name;group.userData={owner_id:root.userData.shared_id,role:'demo_effect',runtimeEffect:true};root.add(group);
  group.position.copy(root.worldToLocal(point.clone()));
  const worldQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,UP,front));
  group.quaternion.copy(root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQ));return group;
 }
 makeAC(){
  const root=this.roots.bedroom_ac,vent=this.names.bedroom_ac__vent,body=this.names.bedroom_ac__body;if(!root||!vent||!body)return;
  const c=center(vent),front=c.clone().sub(center(body));front.y=0;front.normalize();
  const flow=this.frameAt(root,c.clone().addScaledVector(front,.06),front,'bedroom_ac__demo_airflow');
  const blade=this.frameAt(root,c.clone().addScaledVector(front,.025).addScaledVector(UP,.03),front,'bedroom_ac__demo_blade');
  const sz=size(vent),width=Math.max(sz.x,sz.z);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.018,.075),new THREE.MeshStandardMaterial({color:0xdedfd4,roughness:.55}));mesh.position.set(0,-.025,.025);mesh.userData.runtimeEffect=true;blade.add(mesh);
  const lines=[];for(const x of[-.28,-.09,.09,.28]){
   const pts=[];for(let i=0;i<=30;i++){const u=i/30;pts.push(new THREE.Vector3(x,-.36*u*u,.95*u));}
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x65bcd0,transparent:true,opacity:0,depthWrite:false}));line.userData.runtimeEffect=true;flow.add(line);lines.push(line);
  }
  const particles=[],geom=new THREE.SphereGeometry(.016,8,6),mat=new THREE.MeshBasicMaterial({color:0x8cdaeb,transparent:true,opacity:.8,depthWrite:false});
  for(let i=0;i<16;i++){const p=new THREE.Mesh(geom,mat);p.userData.runtimeEffect=true;flow.add(p);particles.push(p);}
  this.ac={flow,blade,base:blade.quaternion.clone(),lines,particles};
 }
 makeWasher(){
  const root=this.roots.washing_machine,drum=this.names.washing_machine__drum,body=this.names.washing_machine__body;if(!root||!drum||!body)return;
  const c=center(drum),front=c.clone().sub(center(body));front.y=0;front.normalize();
  const group=this.frameAt(root,c.addScaledVector(front,.018),front,'washing_machine__demo_drum');
  const geo=new THREE.SphereGeometry(.009,8,6),mat=new THREE.MeshBasicMaterial({color:0x899b97});
  for(let i=0;i<12;i++){const a=i*Math.PI/6,p=new THREE.Mesh(geo,mat);p.position.set(Math.cos(a)*.13,Math.sin(a)*.13,0);p.userData.runtimeEffect=true;group.add(p);}
  this.washer={group,base:group.quaternion.clone(),angle:0};
 }
 applySnapshot(snapshot,{immediate=false}={}){
  const values=snapshot.objects||{};
  for(const [id,r] of this.doors){
   const v=values[id]||{};const valid=id==='entry_door'?v.availability==='not_applicable'&&v.source==='manual'&&!!v.updated_at:v.availability==='online'&&!!v.source&&!!v.updated_at;
   r.known=!!valid&&['open','closed'].includes(v.state);r.state=v.state||'unknown';
   r.target=r.known?(v.state==='open'?1:0):r.current;
   if(immediate&&r.known)r.current=r.target;
  }
  for(const [id,r] of this.power){
   const v=values[id]||{};r.known=v.availability==='online'&&!!v.source&&!!v.updated_at&&['on','off'].includes(v.state);r.state=v.state||'unknown';r.powerState=v.power_state||'unknown';
   r.target=r.known&&v.state==='on'&&v.power_state!=='unpowered'?1:0;
   if(immediate)r.current=r.target;
  }
  const w=values.washing_machine||{};this.washerRunning=w.availability==='online'&&!!w.source&&!!w.updated_at&&w.cycle_state==='running'&&w.power_state!=='unpowered';
  this.washerCycle=w.cycle_state||'unknown';
 }
 setSelected(id){this.selected=id;}
 tick(dt,now){
  this.time=now;const alpha=1-Math.exp(-8*dt);
  for(const r of this.doors.values()){
   r.current+=(r.target-r.current)*alpha;if(Math.abs(r.current-r.target)<.0005)r.current=r.target;
   if(r.kind==='hinge')r.node.quaternion.copy(r.base).multiply(new THREE.Quaternion().setFromAxisAngle(r.axis,r.sign*r.current*Math.PI*.44));
   else r.node.position.copy(r.base).addScaledVector(r.delta,r.current);
  }
  for(const [id,r] of this.power){
   r.current+=(r.target-r.current)*(1-Math.exp(-11*dt));if(Math.abs(r.current-r.target)<.001)r.current=r.target;
   const visual=r.known?r.current:0;r.visual=visual;
   const emitter=this.names[id+'__emitter'];if(emitter){emitter.material.emissive.setHex(0xffd7a0);emitter.material.emissiveIntensity=2*visual;if(this.lights[id])this.lights[id].intensity=5*visual;}
   const screen=this.names[id+'__screen'];if(screen){screen.material.emissive.setHex(0x6b8a8f);screen.material.emissiveIntensity=.5*visual;}
   if(id==='bedroom_ac'&&this.ac){
    const ac=this.ac;ac.blade.quaternion.copy(ac.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.72*visual));
    ac.flow.visible=r.known&&visual>.01;for(const l of ac.lines)l.material.opacity=.25*visual;
    for(let i=0;i<ac.particles.length;i++){const u=(now*.65+i/4)%1;ac.particles[i].position.set([-.28,-.09,.09,.28][i%4],-.36*u*u,.95*u);ac.particles[i].scale.setScalar(.5+(1-u)*visual);}
    const indicator=this.names[id+'__indicator'];if(indicator){indicator.material.emissive.setHex(0x5b8e85);indicator.material.emissiveIntensity=.65*visual;}
   }
  }
  if(this.washer){if(this.washerRunning)this.washer.angle+=dt*5;this.washer.group.quaternion.copy(this.washer.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),this.washer.angle));this.washer.group.visible=true;}
  this.model.updateMatrixWorld(true);
 }
 snapshot(){return {doors:Object.fromEntries([...this.doors].map(([id,r])=>[id,{progress:r.current,target:r.target,known:r.known,state:r.state,kind:r.kind}])),power:Object.fromEntries([...this.power].map(([id,r])=>[id,{current:r.current,target:r.target,visual:r.visual,known:r.known,state:r.state,powerState:r.powerState}])),airflowVisible:this.ac?.flow.visible||false,washerAngle:this.washer?.angle||0,washerRunning:this.washerRunning,washerCycle:this.washerCycle};}
}

export class CameraTravel {
 constructor(camera,controls){this.camera=camera;this.controls=controls;this.travel=null;controls.addEventListener('start',()=>this.cancel());}
 go(position,target,immediate=false){if(immediate){this.cancel();this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();return;}this.travel={from:this.camera.position.clone(),look:this.controls.target.clone(),to:position.clone(),target:target.clone(),elapsed:0};this.controls.enabled=false;}
 tick(dt){if(!this.travel)return;const t=this.travel;t.elapsed+=dt;const u=Math.min(1,t.elapsed/.5),v=ease(u);this.camera.position.lerpVectors(t.from,t.to,v);this.controls.target.lerpVectors(t.look,t.target,v);if(u===1)this.cancel();}
 cancel(){this.travel=null;this.controls.enabled=true;}
}

export function installInteractionUI({host,camera,controls,onHome,key}){
 const bar=document.createElement('div');bar.className='view-tools';bar.innerHTML='<button type="button" id="zoom-in" aria-label="放大">＋</button><button type="button" id="zoom-out" aria-label="缩小">−</button><button type="button" id="fit-view">全屋</button><label>标签 <select id="label-mode" aria-label="标签模式"><option value="clean">简洁</option><option value="all">全部</option><option value="hidden">隐藏</option></select></label><output id="zoom-factor">1×</output>';
 host.append(bar);const select=bar.querySelector('select');try{select.value=localStorage.getItem(key)||'clean';}catch{}if(!select.value)select.value='clean';
 select.onchange=()=>{try{localStorage.setItem(key,select.value);}catch{}host.dispatchEvent(new Event('labels-change'));};
 const zoom=f=>{controls.dispatchEvent({type:'start'});const v=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(v.setLength(THREE.MathUtils.clamp(v.length()*f,controls.minDistance,controls.maxDistance)));controls.update();};
 bar.querySelector('#zoom-in').onclick=()=>zoom(.75);bar.querySelector('#zoom-out').onclick=()=>zoom(1/.75);bar.querySelector('#fit-view').onclick=onHome;
 host.addEventListener('wheel',()=>{controls.enabled=true;},{capture:true,passive:true});
 addEventListener('keydown',e=>{if(e.code==='KeyL'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){select.value={clean:'all',all:'hidden',hidden:'clean'}[select.value];select.onchange();}});
 return {get labelMode(){return select.value;},set labelMode(v){if(!['clean','all','hidden'].includes(v))throw new TypeError('Invalid label mode');select.value=v;select.onchange();},tick(homeDistance){const d=camera.position.distanceTo(controls.target);bar.querySelector('output').textContent=(homeDistance/d).toFixed(1)+'×';}};
}
