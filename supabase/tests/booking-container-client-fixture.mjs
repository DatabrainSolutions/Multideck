import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { transformSync } = createRequire(new URL('../../multideck.client/package.json', import.meta.url))('esbuild')
export const source = readFileSync(new URL('../../multideck.client/src/components/multideck/booking-components.tsx', import.meta.url), 'utf8')
export function cut(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `Missing production boundary: ${start}`)
  return source.slice(a, b)
}
export const containerComponentSource = cut('function bookingContainerDataValue(', 'function BookingRecordDetails(')
export const containerMutationSource = cut('  function updateDraftContainer(', '  function addDraftContainer(')
const mutation = transformSync(containerMutationSource, { loader: 'ts' }).code
export function mutateBookingContainer(workspace, index, field, value) {
  let result = workspace
  const update = new Function('setDraftWorkspace', `${mutation}; return updateDraftContainer`)(callback => { result = callback(result) })
  update(index, field, value)
  return result
}

// Exercise the production component's field policy/callbacks. Shared primitives
// are inspectable nodes here; keyboard/rendering checks use the browser fixture.
export function containerFieldTree(props) {
  const code = transformSync(containerComponentSource, { loader: 'tsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }).code
  const symbols = ['BookingCargoWiseGroup','Button','Plus','Input','Select','SelectTrigger','SelectValue','SelectContent','SelectItem','Trash2','BookingCargoWiseField','Container']
  const factory = new Function('React','useId','useLanguage','bookingEquipmentOptionsByMode','bookingModeKey','asRecord',...symbols, `${code};return BookingContainerDetails`)
  return factory({createElement:(type,props,...children)=>({type,props:props??{},children}),Fragment:'fragment'},()=> 'container-qa',()=>({t:value=>value}),{sea:['20GP','40RF']},()=> 'sea',value=>value??{},...symbols)(props)
}
export function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.children), ...nodes(tree.props?.action)]
}
