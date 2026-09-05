import assert from 'node:assert/strict'
import test from 'node:test'
import { mutateBookingContainer as mutate, containerFieldTree, nodes } from './booking-container-client-fixture.mjs'

test('actual container updater preserves decimal text, other rows and historical evidence', () => {
  for (const field of ['grossWeightKg','tareWeightKg','verifiedGrossMassKg','reeferSetPoint']) {
    for (const value of ['123456789012.123456','4,000.123456','-18.125','1,00','1.','-','NaN','0','', '  ']) {
      const original = {containers:[{id:'one',[field]:'12',data:{sealNumber:'SEAL'}},{id:'two'}],quoteSnapshot:{accepted:true}}
      const result=mutate(original,0,field,value)
      assert.equal(result.containers[0][field],value.trim()===''?null:value)
      assert.equal(result.containers[0].id,'one')
      assert.equal(result.containers[0].data,original.containers[0].data)
      assert.equal(result.containers[1],original.containers[1])
      assert.equal(result.quoteSnapshot,original.quoteSnapshot)
      assert.equal(original.containers[0][field],'12')
    }
  }
})

test('stale container indices cannot create phantom rows', () => {
  const original={containers:[{id:'one'}]}
  for(const index of [-1,1,0.5,NaN])assert.equal(mutate(original,index,'tareWeightKg','2000'),original)
  assert.equal(mutate(null,0,'tareWeightKg','2000'),null)
})

function fields(container={},seaService=true,editable=true,onChange=()=>{}) {
  return nodes(containerFieldTree({containers:[container],mode:'sea',seaService,editable,onAdd:()=>{},onRemove:()=>{},onChange}))
}
test('VGM appears for Sea or retained evidence, not for an unrelated empty Rail container',()=>{
  assert.equal(fields({},false).filter(node=>node.props.label==='VGM method').length,0)
  for(const [container,sea] of [[{},true],[{verifiedGrossMassKg:'0'},false],[{vgmMethod:'1'},false]]) {
    assert.equal(fields(container,sea).filter(node=>node.props.label==='VGM method').length,1)
  }
})
test('recorded method and unit have explicit clear choices; numeric fields never use stale JSON',()=>{
  const calls=[]
  const rows=fields({tareWeightKg:null,data:{tareWeightKg:'999'},vgmMethod:'1',reeferUnit:'C'},true,true,(...args)=>calls.push(args))
  assert.equal(rows.find(node=>node.props.label==='Tare weight (kg)').props.value,'')
  const method=rows.find(node=>node.props.label==='VGM method').props
  method.onChange('2 - Certified calculation');method.onChange('Not recorded')
  rows.find(node=>node.props.label==='Temperature unit').props.onChange('Not recorded')
  assert.deepEqual(calls,[[0,'vgmMethod','2'],[0,'vgmMethod',''],[0,'reeferUnit','']])
})
test('read-only container controls cannot add, remove or edit and details remain inspectable',()=>{
  const calls=[]
  const rows=fields({number:'SAVED'},true,false,(...args)=>calls.push(args))
  assert.ok(rows.some(node=>node.type==='summary'))
  for(const node of rows.filter(node=>['Input','Select','Button'].includes(node.type)))assert.equal(node.props.disabled,true)
  for(const node of rows.filter(node=>node.type==='BookingCargoWiseField'))assert.equal(node.props.editable,false)
  rows.find(node=>node.type==='Input').props.onChange({target:{value:'UNWANTED'}})
  rows.find(node=>node.type==='Select').props.onValueChange('20GP')
  assert.deepEqual(calls,[])
})
