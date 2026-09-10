export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const efforts = new Set<ReasoningEffort>(['low','medium','high','xhigh','max'])
type Item = Record<string,unknown>
/** Append, never rewrite, an effort change at its original conversation position. */
export function appendReasoningTurn(input: Item[], userMessage: Item, options: {
  baseEffort: ReasoningEffort; previousEffort: ReasoningEffort; nextEffort: ReasoningEffort
}) {
  if (![options.baseEffort,options.previousEffort,options.nextEffort].every(effort=>efforts.has(effort)))
    throw new Error('unsupported_reasoning_effort')
  if (userMessage.role!=='user') throw new Error('reasoning_update_requires_user_turn')
  if (input.at(-1)?.type==='configuration_update') throw new Error('adjacent_reasoning_updates')
  return {
    reasoning: {effort:options.baseEffort,summary:'auto'},
    input:[...input,...(options.previousEffort!==options.nextEffort
      ? [{type:'configuration_update',reasoning:{effort:options.nextEffort}}] : []),userMessage],
  }
}
