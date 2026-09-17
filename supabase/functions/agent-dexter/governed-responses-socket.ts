import WebSocket from 'npm:ws@8.18.3'
import {redactModelSecrets,reserveModelEgress,settleModelEgress,type ModelGatewayContext} from '../_shared/model-gateway.ts'
import {ResponsesSession,type ResponsesSessionResult} from './responses-session.ts'
type Json=Record<string,unknown>
const object=(value:unknown):value is Json=>Boolean(value && typeof value==='object' && !Array.isArray(value))

/** Server-owned upstream transport. The browser never receives credentials or a provider socket. */
export function governedResponsesSocket(context:ModelGatewayContext,apiKey:string,callbacks:{
  onEvent:(event:Json)=>void;onAsyncCall:(call:Json)=>void
}) {
  let socket:WebSocket|null=null
  let connecting:Promise<void>|null=null
  let closed=false
  let contextUnits=0
  let deadline:ReturnType<typeof setTimeout>|null=null
  let acknowledgement:ReturnType<typeof setTimeout>|null=null
  const connect=async()=>{
    if (closed) throw new Error('responses_connection_closed')
    if (socket?.readyState===WebSocket.OPEN) return
    if (connecting) return connecting
    connecting=new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>{socket?.terminate();reject(new Error('responses_connect_timeout'))},10000)
      socket=new WebSocket('wss://api.openai.com/v1/responses',{headers:{Authorization:`Bearer ${apiKey}`},maxPayload:8*1024*1024})
      socket.once('open',()=>{clearTimeout(timeout);resolve()})
      socket.once('error',()=>{clearTimeout(timeout);reject(new Error('responses_connect_failed'))})
      socket.on('message',(data:{toString():string})=>{
        let event:unknown
        try {event=JSON.parse(data.toString())} catch {void session.close();socket?.terminate();return}
        if(object(event))void session.receive(event).then(()=>{if(session.isClosed)socket?.terminate()})
      })
      socket.on('close',()=>{clearTimeout(timeout);closed=true;void session.close();reject(new Error('responses_connection_closed'))})
      // Protocol errors after connection also close the logical session.
      socket.on('error',()=>{void session.close();socket?.terminate()})
      // Leave time for partial artifacts and the final error to reach the 120s client deadline.
      deadline=setTimeout(()=>{void close('responses_run_timeout')},95000)
    })
    return connecting
  }
  const session=new ResponsesSession({
    send:event=>{
      if(socket?.readyState!==WebSocket.OPEN)throw new Error('responses_connection_not_open')
      socket.send(JSON.stringify(redactModelSecrets(event)))
      if(event.type==='response.create') {
        if(acknowledgement)clearTimeout(acknowledgement)
        acknowledgement=setTimeout(()=>{void close('responses_start_timeout')},20000)
      }
    },
    reserve:async body=>{
      const bytes=JSON.stringify(redactModelSecrets(body)).length
      const estimatedInput=contextUnits+Math.ceil(bytes/4)
      const estimatedOutput=Math.max(0,Number(body.max_output_tokens)||2400)
      const reservation=await reserveModelEgress(context,{provider:'openai',model:String(body.model),purpose:'dexter_chat',
        dataCategories:['operator_instruction','business_record'],byteCount:bytes,estimatedInputUnits:estimatedInput,
        estimatedOutputUnits:estimatedOutput})
      // previous_response_id bills the retained context as well as new input.
      contextUnits=estimatedInput+estimatedOutput
      try {await connect();return reservation} catch(error) {
        await settleModelEgress(context,{reservationId:reservation,outcome:'failed',errorCode:'responses_connect_failed'})
        throw error
      }
    },
    settle:async(reservation,response,failure)=>{
      const usage=response && object(response.usage)?response.usage:{}
      if(response)contextUnits=Math.max(0,Number(usage.input_tokens)||0)+Math.max(0,Number(usage.output_tokens)||0)
      const {error}=await context.admin.rpc('multideck_dexter_settle_responses_egress',{
        p_reservation_id:reservation,p_company_id:context.companyId,p_user_id:context.userId,p_outcome:failure?'failed':'succeeded',
        p_response_id:response && typeof response.id==='string'?response.id:null,p_usage:usage,p_error_code:failure??null,
      })
      if(error)throw new Error('responses_usage_settlement_failed')
    },
    onAsyncCall:callbacks.onAsyncCall,
    onEvent:event=>{
      if(event.type==='response.created' && acknowledgement) {
        clearTimeout(acknowledgement);acknowledgement=null
      }
      callbacks.onEvent(event)
    },
  })
  const close=async(reason='responses_connection_closed')=>{
    closed=true
    if(deadline)clearTimeout(deadline)
    if(acknowledgement)clearTimeout(acknowledgement)
    try {await session.close(reason)} finally {
      if(socket && socket.readyState!==WebSocket.CLOSED)socket.terminate()
    }
  }
  return {
    request:(body:Json):Promise<ResponsesSessionResult>=>{
      const {stream:_stream,...request}=redactModelSecrets(body) as Json
      return session.request(request)
    },
    steer:(input:string)=>session.steer(String(redactModelSecrets(input))),
    get canSteer(){return session.canSteer},
    close,
  }
}
