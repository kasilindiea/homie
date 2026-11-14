import * as THREE from 'three';
import { GLTFLoader } from '../house-modeling/viewer/vendor/GLTFLoader.js';
import { OrbitControls } from '../house-modeling/viewer/vendor/OrbitControls.js';
import { StateMotion, CameraTravel } from '../house-modeling/viewer/interaction-runtime.js';

export async function createHomeScene(host, map, onSelect) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label','小公寓 3D 户型，可拖动旋转、滚轮缩放或点击设备');
  host.prepend(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({canvas,antialias:true}); } catch(error) { canvas.remove(); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0xe9ece6);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(map.home_camera.vertical_fov_degrees,1,.05,200);
  const controls = new OrbitControls(camera,canvas);
  Object.assign(controls,{enableDamping:true,enablePan:true,zoomToCursor:true,zoomSpeed:1.25,minDistance:.65,maxDistance:90});
  controls.minPolarAngle = THREE.MathUtils.degToRad(20); controls.maxPolarAngle = THREE.MathUtils.degToRad(55);
  const travel = new CameraTravel(camera,controls);
  scene.add(new THREE.HemisphereLight(0xf6f8ed,0x879387,2));
  for (const [position,intensity] of [[[-3,12,6],3],[[8,8,-3],1.1],[[3,6,15],.7]]) {
    const light = new THREE.DirectionalLight(0xfff7e9,intensity); light.position.set(...position); scene.add(light);
    if (intensity === 3) { light.castShadow = true; light.shadow.mapSize.set(2048,2048); Object.assign(light.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:50}); light.shadow.bias=-.0002; light.shadow.normalBias=.025; }
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.37; ground.receiveShadow=true; scene.add(ground);
  let model;
  try { model = (await new GLTFLoader().loadAsync(new URL('../house-modeling/releases/v0.1/future-home-v0.1.glb',import.meta.url).href)).scene; }
  catch(error) { controls.dispose();renderer.dispose();canvas.remove();throw error; }
  scene.add(model);
  const names={},roots={};
  model.traverse(o=>{names[o.name]=o;if(o.userData.shared_id)roots[o.userData.shared_id]=o;if(o.isMesh){o.castShadow=o.material.transparent!==true;o.receiveShadow=true;}});
  model.updateMatrixWorld(true);
  const world = name => { if(!names[name]) throw new Error('模型映射缺少节点：'+name); return names[name].getWorldPosition(new THREE.Vector3()); };
  for (const item of map.objects.filter(o=>o.spatial)) { world(item.anchor_name); world(item.focus_name); }
  const lamp = new THREE.PointLight(0xffdca5,0,4,2);lamp.position.copy(world('living_room_light__light_origin'));scene.add(lamp);
  const motion = new StateMotion({model,names,roots,lights:{living_room_light:lamp},templateId:'baseline_apartment'});
  const selectionLayer=new THREE.Group(),planLayer=new THREE.Group();scene.add(selectionLayer,planLayer);
  const clear = group => {for(const child of [...group.children]){group.remove(child);child.geometry?.dispose();child.material?.dispose();}};
  let selected=null, planIds=[], labelMode='all', interacted=false, destroyed=false, frameId, first=true;
  const outlines=[];
  const tags = map.objects.filter(o=>o.spatial&&o.object_type!=='room').map(meta=>{
    const button=document.createElement('button');button.className='hotspot';button.dataset.objectId=meta.shared_id;
    const title=document.createElement('strong'),status=document.createElement('span');title.textContent=meta.display_name;button.append(title,status);
    button.addEventListener('click',()=>focus(meta.shared_id));host.append(button);return {meta,button,status};
  });
  function outline(id) {
    clear(selectionLayer);outlines.length=0;
    if(!id)return;
    const meta=map.objects.find(o=>o.shared_id===id);
    const root=meta?.object_type==='room'?names[id+'__floor']:roots[id];
    root?.traverse(o=>{if(!o.isMesh||o.userData.runtimeEffect)return;const line=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,36),new THREE.LineBasicMaterial({color:0x327a70,depthTest:false,transparent:true,opacity:.8}));line.matrixAutoUpdate=false;line.matrix.copy(o.matrixWorld);selectionLayer.add(line);outlines.push([line,o]);});
  }
  function focus(id) {
    const meta=map.objects.find(o=>o.shared_id===id&&o.spatial);if(!meta)throw new Error('暂无法定位该对象');
    selected=id;interacted=true;
    const target=world(meta.focus_name);
    travel.go(target.clone().add(new THREE.Vector3(...meta.camera_offset_gltf_m)),target);
    outline(id);motion.setSelected(id);onSelect(id);
  }
  function reset(immediate=false) {
    selected=null;interacted=false;
    const target=world(map.home_camera.target_node),box=new THREE.Box3().setFromObject(model);
    let radius=0;
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])radius=Math.max(radius,new THREE.Vector3(x,y,z).distanceTo(target));
    const vf=THREE.MathUtils.degToRad(camera.fov),hf=2*Math.atan(Math.tan(vf/2)*camera.aspect);
    const distance=1.10*radius/Math.sin(Math.min(vf,hf)/2);
    travel.go(target.clone().add(new THREE.Vector3(...map.home_camera.camera_offset_gltf_m).normalize().multiplyScalar(distance)),target,immediate);
    outline(null);motion.setSelected(null);onSelect(null);
  }
  function preview(ids) {
    if(JSON.stringify(ids)===JSON.stringify(planIds))return;
    planIds=[...ids];clear(planLayer);
    for(const id of ids){const meta=map.objects.find(o=>o.shared_id===id&&o.spatial);if(!meta)continue;const p=world(meta.anchor_name),pts=[];
      for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;pts.push(new THREE.Vector3(p.x+.42*Math.cos(a),p.y,p.z+.42*Math.sin(a)));}
      const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:0xb67b36,dashSize:.09,gapSize:.055,depthTest:false}));ring.computeLineDistances();planLayer.add(ring);
    }
  }
  function apply(objects) {
    motion.applySnapshot({objects},{immediate:first});first=false;
    for(const {meta,button,status} of tags){const o=objects[meta.shared_id],unknown=!o||o.state==='unknown';button.classList.toggle('unknown',unknown);status.textContent=({on:'开启',off:'已关闭',open:'开启',closed:meta.shared_id==='entry_door'?'人工已确认':'已合上',unknown:meta.shared_id==='entry_door'?'待现场核实':'状态未知'})[o?.state]||'状态未知';}
  }
  function project(point) {const p=point.clone().project(camera);return {x:(p.x+1)*host.clientWidth/2,y:(1-p.y)*host.clientHeight/2,visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.94};}
  function labels() {
    const used=[];
    for(const {meta,button} of [...tags].sort((a,b)=>(b.meta.shared_id===selected)-(a.meta.shared_id===selected))){const p=project(world(meta.anchor_name));button.hidden=!p.visible||labelMode==='hidden'||(labelMode==='clean'&&meta.shared_id!==selected);if(button.hidden)continue;let y=p.y;for(const q of used)if(Math.abs(p.x-q.x)<125&&Math.abs(y-q.y)<54)y=q.y+56;y=Math.max(45,Math.min(host.clientHeight-45,y));button.style.left=p.x+'px';button.style.top=y+'px';button.classList.toggle('selected',meta.shared_id===selected);used.push({x:p.x,y});}
  }
  const owner = object => {while(object&&!object.userData.shared_id)object=object.parent;return object?.userData.shared_id;};
  const ray=new THREE.Raycaster();let down=null,lastPick=null;
  canvas.addEventListener('pointerdown',e=>{travel.cancel();down=[e.clientX,e.clientY];});
  canvas.addEventListener('pointerup',e=>{if(e.button!==0||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const b=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2),camera);const hit=ray.intersectObject(model,true).find(h=>!h.object.userData.runtimeEffect);const id=hit&&owner(hit.object);if(id){lastPick='mesh';focus(id);}});
  controls.addEventListener('start',()=>interacted=true);
  const resize = ()=>{if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();if(!interacted)reset(true);};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  let previous=performance.now();
  function frame(now){if(destroyed)return;frameId=requestAnimationFrame(frame);const dt=Math.min(.1,(now-previous)/1000);previous=now;travel.tick(dt);controls.update();motion.tick(dt,now/1000);for(const [line,source]of outlines)line.matrix.copy(source.matrixWorld);labels();renderer.render(scene,camera);}
  frameId=requestAnimationFrame(frame);
  return {focus,reset,preview,apply,setLabels:value=>labelMode=value,
    inspect:()=>({selected,planIds:[...planIds],lastPick,animation:motion.snapshot(),camera:camera.position.toArray(),target:controls.target.toArray(),emissive:names.living_room_light__emitter.material.emissiveIntensity}),
    destroy:()=>{destroyed=true;cancelAnimationFrame(frameId);observer.disconnect();controls.dispose();renderer.dispose();tags.forEach(t=>t.button.remove());canvas.remove();}
  };
}
