import { TEMPLATE } from './data-model.js';

export class HttpGateway {
  constructor(store,{base='http://127.0.0.1:8787',session='frontend-'+crypto.randomUUID(),fetcher=(...args)=>globalThis.fetch(...args)}={}) {
    this.store=store;this.base=base.replace(/\/$/,'');this.session=session;this.fetcher=fetcher;
    this.queue=[];this.epoch=0;this.serverGeneration=null;this.connected=false;this.trace=[];this.confirmations=new Map();this.retryEligible=[];this.retryIntent=null;
  }
  async request(method,path,body,kind='task',context={}) {
    const epoch=this.epoch,generation=this.store.generation;
    const payload=body===undefined?undefined:{template_id:TEMPLATE,...body};
    let response,data;
    try { response=await this.fetcher(this.base+path,{method,headers:{'Content-Type':'application/json','X-Demo-Session':this.session},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});data=await response.json(); }
    catch(error){this.trace.push({session:this.session,method,path,request:payload,error:error.message});throw new Error('模拟服务连接失败，请检查服务地址后重试。');}
    this.trace.push({session:this.session,method,path,request:payload,status:response.status,response:data});
    if(epoch!==this.epoch || generation!==this.store.generation)return null;
    if(kind!=='reset' && this.serverGeneration!==null && data.generation!==this.serverGeneration)throw new Error('模拟会话代次已变化，请重新读取基线或复位。');
    if(!response.ok){
      if(response.status===409&&data.plan){this.store.applyResponse({http_status:response.status,body:data},{kind:'task',generation,...context});this.confirmations.clear();}
      const error=new Error(`${response.status} ${data.error?.code??''}：${data.error?.message??'请求失败'}`);error.status=response.status;throw error;
    }
    if(kind==='reset'||this.serverGeneration===null)this.serverGeneration=data.generation;
    if(kind!=='clock')this.store.applyResponse({http_status:response.status,body:data},{kind,generation,...context});
    if(data.retry_eligible_item_ids)this.retryEligible=data.retry_eligible_item_ids;
    this.connected=true;return data;
  }
  async connect(){return this.request('GET',`/demo/leave-check/state?template_id=${TEMPLATE}`,undefined,'snapshot');}
  async reset({scenario='normal',clock='manual'}={}) {this.epoch++;const result=await this.request('POST','/demo/leave-check/reset',{scenario,clock},'reset');if(result){this.confirmations.clear();this.retryEligible=[];this.retryIntent=null;}return result;}
  deactivate(){this.epoch++;}
  async createPlan({intent,everyone=false}) {return this.request('POST','/demo/leave-check/plans',{intent_text:intent,occupancy:everyone?'empty':'occupied',retain_room_ids:everyone?[]:['bedroom'],room_occupancy:{entryway:'empty',living_room:'empty',bedroom:everyone?'empty':'occupied',balcony:'empty'},...(this.store.view().task?{task_id:this.store.view().task.id}:{})});}
  taskPath(){const task=this.store.view().task;if(!task)throw new Error('请先生成离家计划');return `/demo/leave-check/tasks/${task.id}`;}
  manual(result){return this.request('PUT',this.taskPath()+'/manual-records/entry_door',{result});}
  userAway(){return this.request('PUT',this.taskPath()+'/user-away',{user_away:true});}
  execute({planVersion,selectedIds,confirmationId}) {
    const task=this.store.view().task;
    const key=JSON.stringify([task.id,planVersion,[...selectedIds].sort()]);
    if(!this.confirmations.has(key))this.confirmations.set(key,confirmationId??crypto.randomUUID());
    return this.request('POST',this.taskPath()+'/executions',{plan_version:planVersion,selected_item_ids:selectedIds,confirmation_id:this.confirmations.get(key)});
  }
  query(){const task=this.store.view().task;if(!task?.activeExecutionId)throw new Error('尚无执行记录');return this.request('GET',this.taskPath()+'/executions/'+task.activeExecutionId);}
  refresh(objectIds=['living_room_light','balcony_door','bedroom_ac'],withExecution=true){const task=this.store.view().task;return this.request('POST','/demo/leave-check/state/refresh',{object_ids:objectIds,...(task?{task_id:task.id}:{}),...(withExecution&&task?.activeExecutionId?{execution_id:task.activeExecutionId}:{})},'task');}
  advance(ms){return this.request('POST','/demo/leave-check/debug/advance',{ms},'clock');}
  async next(){await this.query();return '已查询执行结果；设备读数保持独立';}
  async retryFailed(){if(!this.retryIntent){if(!this.retryEligible.length)throw new Error('请先刷新状态，服务尚未允许重试');const task=this.store.view().task;this.retryIntent={plan_version:task.plan.plan_version,selected_item_ids:[...this.retryEligible],confirmation_id:crypto.randomUUID()};}const result=await this.request('POST',this.taskPath()+'/executions',this.retryIntent);if(result){this.retryIntent=null;this.retryEligible=[];}return result;}
  energy(body){return this.request('POST','/demo/energy/samples',body,'energy');}
}
