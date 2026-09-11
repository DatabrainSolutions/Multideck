import type {DexterActor} from './security.ts'
type Json=Record<string,unknown>
type RpcClient={rpc:(name:string,args:Json)=>PromiseLike<{data:unknown;error:{code?:string}|null}>}
const uuid=(value:unknown):value is string=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

/** The authenticated edge owns actor identity; browser input never selects it. */
export async function steeringRequest(admin:RpcClient,actor:DexterActor,body:Json) {
  if (!uuid(body.runId) || !uuid(body.clientSessionId)) return {
    status:400,body:{code:'invalid_active_run',message:'That active Dexter request is unavailable.'},
  }
  const enqueue=body.operation==='steer'
  if (enqueue && (!uuid(body.inputId) || typeof body.input!=='string' || !body.input.trim() || body.input.length>8000))
    return {status:400,body:{code:'invalid_steering',message:'Enter a correction of up to 8,000 characters.'}}
  const {data,error}=await admin.rpc('multideck_dexter_active_run',{
    p_operation:enqueue?'enqueue':'status',p_run_id:body.runId,p_company_id:actor.companyId,
    p_user_id:actor.userId,p_auth_user_id:actor.authUserId,p_client_session_id:body.clientSessionId,
    ...(enqueue?{p_input_id:body.inputId,p_input:body.input}:{}),
  })
  if (error) {
    const unavailable=error.code==='42501'
    return {status:unavailable?404:error.code==='55000'||error.code==='54000'?409:503,
      body:{code:unavailable?'active_run_unavailable':'steering_unavailable',
        message:unavailable?'That active Dexter request is unavailable.':'Dexter could not accept this correction. Your text is kept; check the request before trying again.'}}
  }
  return {status:200,body:{run:data}}
}

/** Durable status tracks provider acknowledgement, not the fact that HTTP accepted input. */
export async function activeRunWorker(admin:RpcClient,actor:DexterActor,context:{
  clientSessionId:string;conversationId:string|null
},callbacks:{
  canSteer:()=>boolean;steer:(input:string)=>Promise<boolean>;emit:(event:Json)=>void;
  incorporated:(input:string,responseId:string)=>Promise<void>
}) {
  const id=crypto.randomUUID(),workerToken=crypto.randomUUID()
  const args={p_run_id:id,p_company_id:actor.companyId,p_user_id:actor.userId,p_auth_user_id:actor.authUserId,
    p_client_session_id:context.clientSessionId,p_conversation_id:context.conversationId,p_worker_token:workerToken}
  const rpc=async(operation:string,extra:Json={})=>{
    const result=await admin.rpc('multideck_dexter_active_run',{...args,p_operation:operation,...extra})
    if(result.error)throw new Error('active_run_storage_failed')
    return result.data
  }
  await rpc('begin')
  let current:{id:string;input:string}|null=null
  let serial:Promise<void>=Promise.resolve()
  let polling:Promise<void>|null=null
  let stopped=false
  let failure:unknown=null
  const queue=(task:()=>Promise<void>)=>{
    serial=serial.then(task).catch(error=>{failure=error})
  }
  const flush=async()=>{await serial;if(failure)throw failure}
  const event=(value:Json)=>{
    if(value.type!=='steering_status' || !current)return
    const input=current
    const status=value.status
    if(!['submitted','queued','incorporated','failed','unconfirmed'].includes(String(status)))return
    queue(async()=>{
      await rpc('transition',{p_input_id:input.id,p_status:status,p_response_id:value.responseId??null})
      if(status==='incorporated')await callbacks.incorporated(input.input,String(value.responseId))
      callbacks.emit({...value,inputId:input.id,runId:id})
    })
    if(['incorporated','failed','unconfirmed'].includes(String(status)))current=null
  }
  const poll=():Promise<void>=>{
    if(polling)return polling
    if(stopped || current || !callbacks.canSteer())return Promise.resolve()
    polling=(async()=>{
      await flush()
      const value=await rpc('claim') as {id?:unknown;input?:unknown}|null
      if(!value)return
      if(typeof value.id!=='string'||typeof value.input!=='string')throw new Error('invalid_claimed_steering')
      current={id:value.id,input:value.input}
      try {
        const accepted=await callbacks.steer(value.input)
        if(!accepted)event({type:'steering_status',status:'failed'})
      } catch(error) {
        event({type:'steering_status',status:'unconfirmed'})
        throw error
      }
      await flush()
    })().finally(()=>{polling=null})
    return polling
  }
  return {
    id,poll,event,flush,
    announce:(canSteer=true)=>callbacks.emit({type:'active_run',runId:id,canSteer}),
    finish:async(status:'completed'|'failed')=>{
      stopped=true
      try {await polling;await flush()} finally {await rpc('finish',{p_status:status})}
    },
  }
}
