import {appendReasoningTurn,type ReasoningEffort} from './reasoning-history.ts'
export type ProviderHistory={model:'gpt-6-astra';baseEffort:ReasoningEffort;lastEffort:ReasoningEffort;contract:string;responseId?:string;items:Record<string,unknown>[]}
type Json=Record<string,unknown>
const object=(value:unknown):value is Json=>Boolean(value&&typeof value==='object'&&!Array.isArray(value))
const efforts=['low','medium','high','xhigh','max']
/** Only server-read snapshots are passed here; never ingest client-supplied tool history. */
export function continueProviderHistory(saved:unknown,fallback:Json[],user:Json,effort:ReasoningEffort,contract:string):ProviderHistory {
 const valid=object(saved)&&saved.model==='gpt-6-astra'&&saved.contract===contract&&efforts.includes(String(saved.baseEffort))
  &&efforts.includes(String(saved.lastEffort))&&Array.isArray(saved.items)&&saved.items.every(object)
 const baseEffort=valid?saved.baseEffort as ReasoningEffort:effort
 const previousEffort=valid?saved.lastEffort as ReasoningEffort:effort
 const {input}=appendReasoningTurn(valid?saved.items as Json[]:fallback,user,{baseEffort,previousEffort,nextEffort:effort})
 return {model:'gpt-6-astra',baseEffort,lastEffort:effort,contract,items:input}
}
/** Store provider items unchanged and steering at the successor's commit point. */
export function recordProviderEvent(history:ProviderHistory,event:Json) {
 if(event.type==='steering_status'&&event.status==='incorporated'&&typeof event.input==='string')
  history.items.push({role:'user',content:event.input})
 if(['response.completed','response.incomplete'].includes(String(event.type))&&object(event.response)&&Array.isArray(event.response.output))
  {
    history.items.push(...event.response.output.filter(object))
    if(typeof event.response.id==='string')history.responseId=event.response.id
  }
}
