import assert from 'node:assert/strict'
import test from 'node:test'
import { equipmentPolicy as policy, addBookingEquipment, mutateBookingContainer, containerFieldTree, nodes } from './booking-container-client-fixture.mjs'

test('physical modes drive equipment choices without confusing cargo packaging or direction',()=>{
  for(const direction of ['Import','Export','Cross trade','Domestic']) {
    const context={stage:'booking',direction}
    assert.deepEqual(policy.bookingEquipmentKindChoices({...context,mode:'Air'}),['uld'])
    assert.deepEqual(policy.bookingEquipmentKindChoices({...context,mode:'Road'}),['vehicle','trailer'])
    assert.deepEqual(policy.bookingEquipmentKindChoices({...context,mode:'Rail',shipmentType:'WAGON'}),['wagon'])
    assert.deepEqual(policy.bookingEquipmentKindChoices({...context,mode:'Ocean',shipmentType:'FCL'}),['container'])
    assert.deepEqual(policy.bookingEquipmentKindChoices({...context,mode:'Multimodal',shipmentType:'FCL',legModes:['road','air','rail']}),['container','uld','vehicle','trailer','wagon'])
  }
  for(const mode of ['Warehouse','Customs only','Docs only','Multimodal']) assert.deepEqual(policy.bookingEquipmentKindChoices({mode,stage:'booking'}),[])
  assert.deepEqual(policy.bookingEquipmentKindChoices({mode:'Air',stage:'draft'}),[])
  assert.deepEqual(policy.bookingEquipmentKindChoices({mode:'Sea',shipmentType:'LCL',stage:'booking'}),[])
  assert.deepEqual(policy.bookingEquipmentKindChoices({mode:'Rail',shipmentType:'WAGON',stage:'booking',hasContainers:true}),['container','wagon'])
  assert.ok(!Object.values(policy.bookingEquipmentKinds).some(kind=>kind.types.includes('Carton')||kind.types.includes('Loose')))
})

test('new rows carry explicit kinds, never allocate totals or alter existing evidence',()=>{
  const original={containers:[{id:'saved',equipmentKind:'uld',type:'AKE',data:{sealNumber:'S'}}],quoteSnapshot:{version:1}}
  for(const kind of Object.keys(policy.bookingEquipmentKinds)) {
    const result=addBookingEquipment(original,kind)
    assert.equal(result.containers[0],original.containers[0])
    assert.equal(result.quoteSnapshot,original.quoteSnapshot)
    assert.deepEqual(result.containers[1],{number:'',type:'',equipmentKind:kind,status:'planned',grossWeightKg:null,data:{}})
    assert.equal(mutateBookingContainer(result,1,'number','NEW').containers[1].equipmentKind,kind)
  }
  assert.throws(()=>addBookingEquipment(original,'carton'),/equipment kind/)
  assert.equal(addBookingEquipment(null,'uld'),null)
})

test('equipment labels use saved identity; retained off-mode evidence is visible and VGM stays container-specific',()=>{
  for(const kind of ['container','uld','vehicle','trailer','wagon','legacy-special']) {
    const calls=[]
    const tree=containerFieldTree({containers:[{equipmentKind:kind,type:'SAVED-TYPE',number:'SAVED'}],mode:'Air',equipmentKinds:['uld'],seaService:true,editable:true,onAdd:kind=>calls.push(kind),onRemove:()=>{},onChange:()=>{}})
    const rows=nodes(tree),presentation=policy.bookingEquipmentPresentation(kind)
    assert.ok(rows.some(node=>node.props['aria-label']===presentation.numberLabel))
    assert.equal(rows.filter(node=>node.props.label==='VGM method').length,kind==='container'?1:0)
    const type=rows.find(node=>node.type==='CompactCombobox')
    assert.ok(type.props.options.some(option=>option.value==='SAVED-TYPE'))
    assert.equal(type.props.allowCustom,true)
    const warning=JSON.stringify(rows).includes('Retained equipment:')
    assert.equal(warning,kind!=='uld')
    rows.find(node=>node.type==='Button'&&node.props.ref)?.props.onClick()
    assert.deepEqual(calls,['uld'])
  }
  assert.equal(policy.bookingEquipmentPresentation(undefined).key,'container')
  const rows=nodes(containerFieldTree({containers:[{equipmentKind:'uld',verifiedGrossMassKg:'12'}],mode:'Air',seaService:false,editable:true,onAdd:()=>{},onRemove:()=>{},onChange:()=>{}}))
  assert.equal(rows.find(node=>node.props.label==='Verified gross mass (kg)').props.editable,false)
})
