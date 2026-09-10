type Json = Record<string, unknown>
const object = (value: unknown): value is Json => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export type ResponsesSessionResult = { response: Json; responses: Json[] }
export type ResponsesSessionHooks = {
  send: (event: Json) => void
  reserve: (body: Json) => Promise<string>
  settle: (reservation: string, response: Json | null, failure?: string) => Promise<void>
  onEvent: (event: Json) => void
  onAsyncCall: (call: Json) => void
}

type Steering = { input: string; reservation: string; id?: string; status: 'submitted' | 'queued' }

/** One upstream connection, one active logical run. Never reconnect/replay implicitly. */
export class ResponsesSession {
  private body: Json | null = null
  private responseId: string | null = null
  private running = false
  private closed = false
  private starting = false
  private activeReservation: string | null = null
  private nextReservation: string | null = null
  private steering: Steering | null = null
  private steeringCount = 0
  private steeringSubmitting = false
  private responses: Json[] = []
  private asyncCalls = new Map<string, string>()
  private allowedAsync = new Set<string>()
  private settled = new Set<string>()
  private serial: Promise<void> = Promise.resolve()
  private resolve: ((result: ResponsesSessionResult) => void) | null = null
  private reject: ((error: Error) => void) | null = null

  private readonly hooks: ResponsesSessionHooks
  constructor(hooks: ResponsesSessionHooks) { this.hooks=hooks }

  get isClosed() { return this.closed }
  get currentResponseId() { return this.responseId }
  get canSteer() { return this.running && !this.closed && !this.steering && !this.steeringSubmitting && this.steeringCount < 4 }

  async request(body: Json): Promise<ResponsesSessionResult> {
    if (this.closed || this.running || this.starting || this.resolve) throw new Error('responses_session_busy_or_closed')
    if (body.model !== 'gpt-6-astra' || body.store === true || body.context_management || body.truncation === 'auto')
      throw new Error('responses_session_configuration_invalid')
    this.starting = true
    let reservation: string | null = null
    try {
      // A queued steer waiting for synchronous tool outputs already reserved its continuation.
      reservation = this.steering?.reservation ?? await this.hooks.reserve(body)
      if (this.closed) throw new Error('responses_session_closed')
      this.body = {...body, store: false}
      this.allowedAsync = new Set((Array.isArray(body.tools) ? body.tools : []).filter(object)
        .filter(tool => tool.type === 'function' && tool.async === true && typeof tool.name === 'string').map(tool => String(tool.name)))
      this.responses = []
      this.nextReservation = reservation
      const result = new Promise<ResponsesSessionResult>((resolve,reject) => { this.resolve=resolve;this.reject=reject })
      this.hooks.send({...this.body, type:'response.create', ...(this.responseId ? {previous_response_id:this.responseId} : {})})
      this.starting = false
      return result
    } catch (error) {
      this.starting = false
      this.nextReservation = null
      this.resolve=null;this.reject=null
      if (reservation) await this.settleOnce(reservation,null,'request_not_sent')
      throw error
    }
  }

  async steer(input: string): Promise<boolean> {
    if (!this.canSteer || !this.body || !this.responseId || !input.trim() || input.length > 8000) return false
    this.steeringSubmitting = true
    const target = this.responseId
    let reservation: string | null = null
    try {
      // Reserve before the server can automatically start another response.
      reservation = await this.hooks.reserve({...this.body, input:[...(Array.isArray(this.body.input) ? this.body.input : []),{role:'user',content:input}]})
      if (this.closed || !this.running || this.responseId !== target || this.steering) {
        await this.settleOnce(reservation,null,'steering_target_finished')
        return false
      }
      this.steering={input,reservation,status:'submitted'}
      this.steeringCount += 1
      this.hooks.send({type:'response.steer',previous_response_id:target,input})
      this.hooks.onEvent({type:'steering_status',status:'submitted'})
      return true
    } catch (error) {
      this.steering=null
      if (reservation) await this.settleOnce(reservation,null,'steering_not_sent')
      throw error
    } finally { this.steeringSubmitting=false }
  }

  /** Serialise protocol transitions without awaiting application tool execution. */
  receive(event: Json): Promise<void> {
    this.serial = this.serial.then(()=>this.consume(event)).catch(error=>this.fail(error instanceof Error ? error : new Error('responses_protocol_failed')))
    return this.serial
  }

  private dispatchAsync(item: unknown) {
    if (!object(item) || item.type !== 'function_call' || item.async !== true) return
    if (typeof item.call_id !== 'string' || !item.call_id || typeof item.arguments !== 'string'
      || typeof item.name !== 'string' || !this.allowedAsync.has(item.name)) throw new Error('unexpected_async_tool_call')
    const signature=JSON.stringify([item.name,item.arguments])
    const previous=this.asyncCalls.get(item.call_id)
    if (previous && previous!==signature) throw new Error('async_call_id_reused')
    if (previous) return
    if (this.asyncCalls.size>=24) throw new Error('async_tool_limit')
    this.asyncCalls.set(item.call_id,signature)
    this.hooks.onAsyncCall(item)
  }

  private async consume(event: Json) {
    if (this.closed) return
    const response=object(event.response)?event.response:null
    if (event.type==='response.created' && response && typeof response.id==='string') {
      if (this.running) throw new Error('overlapping_responses')
      const reservation=this.nextReservation ?? this.steering?.reservation
      if (!reservation) throw new Error('unreserved_response')
      this.nextReservation=null;this.activeReservation=reservation
      this.responseId=response.id;this.running=true
      if (this.steering) {
        // The successor's creation commits the input; a later disconnect must
        // not label it unconfirmed or cause the application to replay it.
        const committed=this.steering;this.steering=null
        this.hooks.onEvent({type:'steering_status',status:'incorporated',steerId:committed.id ?? null,input:committed.input,responseId:response.id})
      }
    } else if (event.type==='response.output_item.done') {
      this.dispatchAsync(event.item)
    } else if (event.type==='response.steer.accepted') {
      if (!this.steering || !object(event.steer) || typeof event.steer.id!=='string') throw new Error('unexpected_steering_ack')
      this.steering.id=event.steer.id;this.steering.status='queued'
      this.hooks.onEvent({type:'steering_status',status:'queued',steerId:event.steer.id})
    } else if (event.type==='response.steer.failed') {
      if (this.steering) {
        await this.settleOnce(this.steering.reservation,null,'steering_failed')
        this.hooks.onEvent({type:'steering_status',status:'failed',steerId:this.steering.id ?? null})
        this.steering=null
      }
      // Do not resubmit rejected steering. The original response may still finish.
      if (!this.running && this.responses.length) this.finish(this.responses.at(-1)!)
    } else if (event.type==='response.steer.pending') {
      if (!this.steering || !object(event.steer) || (this.steering.id && event.steer.id!==this.steering.id))
        throw new Error('unexpected_pending_steering')
      this.hooks.onEvent({type:'steering_status',status:'waiting_for_tools',steerId:this.steering.id ?? null})
    } else if (['response.completed','response.incomplete','response.failed'].includes(String(event.type)) && response) {
      if (response.id!==this.responseId || !this.activeReservation) throw new Error('unexpected_response_terminal')
      const reservation=this.activeReservation;this.activeReservation=null;this.running=false
      const steered=event.type==='response.incomplete' && object(response.incomplete_details) && response.incomplete_details.reason==='steered'
      await this.settleOnce(reservation,response,event.type==='response.failed'?'response_failed':undefined)
      this.responses.push(response)
      for (const item of Array.isArray(response.output)?response.output:[]) this.dispatchAsync(item)
      if (event.type==='response.failed' || (event.type==='response.incomplete' && !steered)) throw new Error('response_did_not_complete')
      const needsTools=(Array.isArray(response.output)?response.output:[]).some(item=>object(item) && item.type==='function_call' && item.async!==true)
      if (!this.steering || needsTools) this.finish(response)
      // Otherwise wait for the automatic continuation, even if this response completed normally.
    } else if (event.type==='error') {
      throw new Error('responses_provider_error')
    }
    this.hooks.onEvent(event)
  }

  private finish(response: Json) {
    const resolve=this.resolve;this.resolve=null;this.reject=null
    resolve?.({response,responses:[...this.responses]})
  }
  private async settleOnce(reservation: string,response: Json|null,failure?: string) {
    if (this.settled.has(reservation)) return
    this.settled.add(reservation)
    await this.hooks.settle(reservation,response,failure)
  }
  private async fail(error: Error) {
    if (this.closed) return
    this.closed=true;this.running=false
    const reject=this.reject;this.resolve=null;this.reject=null
    try {
      // Attempt every reservation even when the ledger is unavailable. A failed
      // settlement remains reserved; it must not prevent the request closing.
      const results=await Promise.allSettled([...new Set([this.activeReservation,this.nextReservation,this.steering?.reservation]
        .filter((id):id is string=>Boolean(id)))].map(id=>this.settleOnce(id,null,error.message)))
      if (results.some(result=>result.status==='rejected'))
        this.hooks.onEvent({type:'usage_settlement_failed'})
      if (this.steering) this.hooks.onEvent({type:'steering_status',status:'unconfirmed',steerId:this.steering.id ?? null})
    } finally {
      reject?.(error)
    }
  }
  async close(reason = 'responses_connection_closed') { await this.fail(new Error(reason)) }
}
