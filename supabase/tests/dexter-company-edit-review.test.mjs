import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {requiresExplicitActionApproval} from '../functions/agent-dexter/email-approval.mjs'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/company-edit-review.ts',import.meta.url),'utf8'))
const {companyEditActionReview:review}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const address={addressId:'address',name:'Main office',line1:'Foundry House',line2:'Floor 2',townCity:'Birmingham',countyState:'West Midlands',postZipCode:'B4 6QE',countryCode:'GB',unlocode:null,email:'office@example.com',phone:'+44 1234',timeZone:'Europe/London',capabilities:[{code:'main',isDefault:true}],weeklyHours:[{dayOfWeek:1,opensAt:'09:00:00',closesAt:'17:00:00',sortOrder:0}],openingOverrides:[{date:'2025-12-25',isClosed:true,opensAt:null,closesAt:null,note:'Christmas'}]}
const company={recordId:'company',sourceTable:'Org_Master',name:'Sample',editVersion:3,accountCode:'CUS5',scopeCode:'standard',isPotential:false,responsibleOffices:[],addresses:[address]}
const records=()=>new Map([['company',structuredClone(company)]])
const args=()=>({target_id:'company',address_id:'address',expected_version:3,address:structuredClone(address)})
test('postcode-only approval retains all other evidence and displays only the changed field',()=>{
 const input=args();input.address.postZipCode='B4 6QF'
 const result=review(records(),input,'upsert_company_address')
 assert.deepEqual(result.changes.map(c=>[c.field,c.before,c.after]),[['Postcode','B4 6QE','B4 6QF']])
 assert.match(result.description,/Sample \(Main office\)/)
 assert.equal(input.address.openingOverrides[0].date,'2025-12-25')
 assert.equal(requiresExplicitActionApproval('upsert_company_address','full'),true)
})
test('full replacement cannot hide removal of historical exceptions or contact details',()=>{
 const input=args();input.address.openingOverrides=[];input.address.email=null
 const result=review(records(),input,'upsert_company_address')
 assert.deepEqual(result.changes.map(c=>c.field),['Email','Opening exceptions'])
 assert.match(result.changes[1].before,/2025-12-25: Closed — Christmas/)
 assert.equal(result.changes[1].after,'None')
})
test('missing snapshots, unknown addresses and stale versions never become approvals',()=>{
 for(const patch of [{target_id:'foreign'},{address_id:'foreign'},{expected_version:2}])assert.throws(()=>review(records(),{...args(),...patch},'upsert_company_address'))
 for(const field of ['line2','phone','openingOverrides','weeklyHours']) {
  const rows=records();delete rows.get('company').addresses[0][field]
  assert.throws(()=>review(rows,args(),'upsert_company_address'),/Read all/)
 }
 assert.throws(()=>review(records(),args(),'upsert_company_address'),/already match/)
})
test('company code approval identifies its exact before value and refuses unverified offices',()=>{
 const input={target_id:'company',expected_version:3,account_code:'QA5',scope_code:'standard',is_potential:false,office_assignments:[]}
 assert.deepEqual(review(records(),input,'update_company_foundation').changes.map(c=>[c.field,c.before,c.after]),[['Account code','CUS5','QA5']])
 assert.throws(()=>review(records(),{...input,office_assignments:[{officeId:'unknown',isPrimary:true}]},'update_company_foundation'),/available offices/)
 assert.equal(requiresExplicitActionApproval('update_company_foundation','full'),true)
})
