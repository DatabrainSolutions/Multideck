import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {requiresExplicitActionApproval} from '../functions/agent-dexter/email-approval.mjs'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/contact-transfer-review.ts',import.meta.url),'utf8'))
const {contactTransferReview:review}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const records=()=>new Map([['contact',{sourceTable:'Org_Contacts',name:'Maya',organisationId:'old',organisationName:'Old company',editVersion:3,role:'buyer',jobTitle:'Buyer',department:null}],['new',{sourceTable:'Org_Master',name:'New company'}]])
const args={contact_id:'contact',target_organisation_id:'new',expected_version:3,startedAt:'2026-09-10',role:null,jobTitle:null,department:null}
test('transfer review names both companies and preserves unspecified details',()=>{
 const result=review(records(),args)
 assert.equal(result.title,'Move Maya')
 assert.deepEqual(result.changes.map(c=>[c.field,c.before,c.after]),[['Company','Old company','New company'],['Effective date',null,'2026-09-10']])
 assert.equal(requiresExplicitActionApproval('transfer_company_contact','full'),true)
 assert.equal(review(records(),{...args,jobTitle:'  Manager  '}).changes[2].after,'Manager')
})
test('unverified contacts, targets, details and stale versions cannot become approvals',()=>{
 for(const patch of [{contact_id:'unknown'},{target_organisation_id:'unknown'},{expected_version:1}]) assert.throws(()=>review(records(),{...args,...patch}),/Read/)
 const rows=records(); delete rows.get('contact').role
 assert.throws(()=>review(rows,args),/Read all/)
 const same=records();same.get('contact').organisationId='new'
 assert.throws(()=>review(same,args),/already belongs/)
})
test('invalid calendar dates produce actionable validation',()=>{
 for(const startedAt of ['2026-02-30','2026-13-10','tomorrow','']) assert.throws(()=>review(records(),{...args,startedAt}),/valid effective date/)
})
