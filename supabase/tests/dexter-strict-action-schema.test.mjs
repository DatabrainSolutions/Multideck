import './register-typescript.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {strictNestedSchemaError}=await import('../functions/agent-dexter/strict-action-schema.ts')
const read=name=>readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8')
const original=JSON.parse(read('20260922140000_crm_deal_sales_workflow').match(/'(\{"type":"object","properties":\{"target_id"[\s\S]*?)',36,true/)[1])
const fixed=JSON.parse(read('20260922160940_dexter_deal_sales_strict_schema').split('$input_schema$')[1])
test('nested schemas reject the actual deal-sales defect before it can break an unrelated Gmail request',()=>{
 assert.equal(strictNestedSchemaError(original),'parameters.input:required_not_array')
 assert.equal(strictNestedSchemaError({...original,properties:{...original.properties,input:fixed}}),null)
})
test('each operation requires its own keys without forcing unrequested assignment clearing',()=>{
 const alternatives=fixed.anyOf
 assert.equal(alternatives.length,7)
 assert.ok(alternatives.some(s=>s.required.length===1&&s.required[0]==='ownerId'))
 assert.ok(alternatives.some(s=>s.required.length===1&&s.required[0]==='primaryContactId'))
 for(const variant of alternatives){
  assert.deepEqual(variant.required,Object.keys(variant.properties))
  assert.equal(variant.additionalProperties,false)
 }
 const completion=alternatives.find(s=>s.properties.actionId)
 assert.deepEqual(completion.properties.note.type,['string','null'])
 assert.deepEqual(completion.required,['actionId','note'])
})
test('validation reaches array items, nullable objects, alternatives and definitions',()=>{
 const invalid={type:['object','null'],properties:{note:{type:'string'}},additionalProperties:false}
 for(const schema of [{type:'array',items:invalid},{anyOf:[{type:'null'},invalid]},{$defs:{nested:invalid}}]) assert.match(strictNestedSchemaError(schema),/required_not_array/)
 const valid={...invalid,required:['note']}
 assert.equal(strictNestedSchemaError({type:'array',items:{anyOf:[valid,{type:'null'}]}}),null)
 assert.match(strictNestedSchemaError({...valid,required:['missing']}),/required_properties_mismatch/)
 assert.match(strictNestedSchemaError({...valid,additionalProperties:true}),/additional_properties_not_false/)
})
