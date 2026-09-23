import { HttpError } from './backend.ts'
import { erpNextOrigin } from './erpnext.ts'
import { accountingPartyIdentity, addressIdentityField, adoptReviewedPartyIdentity, loadPartySource, partyIdentityField, projectPartyFields, transport, uniqueField, type PartyTransport } from './accounting-party-sync.ts'
type Row = Record<string, any>
const fail = (message: string): never => { throw new HttpError(409, message) }
const digest = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('')
async function rows(query: any) { const {data,error}=await query;if(error)throw new HttpError(503,'The accounting identity review could not be loaded.');return data }

export async function preparePartyReview(admin: any, connectionId: string, jobId: string, io: PartyTransport = transport) {
 const job=await rows(admin.from('ACCI_PartySyncQueue').select('*').eq('id',jobId).eq('connection_id',connectionId).maybeSingle())
 if(!job || job.status==='processing' || job.verified_payload)fail('This account is no longer awaiting its initial identity review.')
 const source=await loadPartySource(admin,job)
 if(source.connection.ACCIC_ProviderCode!=='erpnext' || source.settings.enabled!==true || source.settings.siteOrigin!==erpNextOrigin())fail('Review the active ERPNext site and automatic account settings first.')
 const providerId=source.mapping?.ACCIPM_ProviderPartyID
 if(!providerId)fail('This account has no existing reviewed mapping.')
 const type=job.party_type==='customer'?'Customer':'Supplier',customer=job.party_type==='customer'
 const record=await io.get(type,providerId),key=await accountingPartyIdentity(source.entity,job)
 if(record.name!==providerId || record.disabled===1 || record.disabled===true || record.disabled==='1')fail('The mapped provider account is missing or disabled.')
 if(record[partyIdentityField] && record[partyIdentityField]!==key)fail('The provider account belongs to a different Multideck identity.')
 if(!record.modified)fail('The provider account has no concurrency version.')
 const expected: Row={ [customer?'customer_name':'supplier_name']:source.org.Org_Name,[customer?'customer_type':'supplier_type']:'Company',default_currency:source.currency,
  [customer?'customer_group':'supplier_group']:customer?source.settings.customerGroup:source.settings.supplierGroup,
  ...(customer?{territory:source.settings.territory}:{}),[partyIdentityField]:key }
 const previous={...projectPartyFields(record,expected),[partyIdentityField]:key}
 // Titles find candidates only. An exact, exclusive parent link is required
 // before an existing address can be proposed for adoption.
 const titles=[...new Set([source.org.Org_Name,record[customer?'customer_name':'supplier_name']].filter(Boolean))]
 const addressNames=await io.list('Address',['name'],[['address_title','in',titles],['address_type','=','Billing']])
 if(addressNames.length>=200)fail('The address review is too large. Review this account separately.')
 const addresses=await Promise.all(addressNames.map(row=>io.get('Address',String(row.name))))
 const linked=addresses.filter(a=>Array.isArray(a.links)&&a.links.some((l:Row)=>l.link_doctype===type&&l.link_name===providerId))
 if(linked.length>1)fail('This account has multiple provider billing addresses. Choose the accounting address before linking it.')
 const address=linked[0]??null
 if(address && (address.links.length!==1 || !address.modified || (address[addressIdentityField]&&address[addressIdentityField]!==key)))fail('The provider billing address has another owner or no concurrency version.')
 const expectedAddress={...source.address,[addressIdentityField]:key}
 const snapshot={party:previous,address:address?{id:address.name,payload:{...projectPartyFields(address,expectedAddress),[addressIdentityField]:key}}:null}
 const changes=(actual:Row,wanted:Row)=>Object.keys(wanted).filter(k=>k!==partyIdentityField&&k!==addressIdentityField&&JSON.stringify(actual[k]??'')!==JSON.stringify(wanted[k])).map(field=>({field,from:actual[field]??'',to:wanted[field]}))
 const fingerprint=await digest({jobId,revision:job.revision,source,record,address})
 return {job,source,type,providerId,key,record,address,snapshot,view:{jobId,orgId:job.org_id,partyType:job.party_type,organisationName:source.org.Org_Name,providerId,providerName:record[customer?'customer_name':'supplier_name'],fingerprint,changes:changes(record,expected),addressChanges:address?changes(address,expectedAddress):[],addressAction:address?'Review existing billing address':'Create accounting address from Multideck'}}
}

export async function reviewPartyIdentities(admin:any,connectionId:string,actorId:string,input?:unknown,io:PartyTransport=transport){
 if(input===undefined){
  const jobs=await rows(admin.from('ACCI_PartySyncQueue').select('id').eq('connection_id',connectionId).is('verified_payload',null).neq('status','processing').limit(26))
  if(jobs.length>25)fail('Review no more than 25 existing links at a time.')
  const reviews:Row[]=[],issues:Row[]=[]
  for(const job of jobs){try{reviews.push((await preparePartyReview(admin,connectionId,job.id,io)).view)}catch(error){issues.push({jobId:job.id,message:error instanceof Error?error.message:'This link needs individual review.'})}}
  return {reviews,issues}
 }
 const requested=(input as Row)?.reviews
 if(!Array.isArray(requested)||!requested.length||requested.length>25||new Set(requested.map(r=>r.jobId)).size!==requested.length)throw new HttpError(400,'Choose between one and 25 distinct links to review.')
 const prepared=[]
 for(const request of requested){const next=await preparePartyReview(admin,connectionId,String(request.jobId),io);if(next.view.fingerprint!==request.fingerprint)fail('An account changed since this review was opened. Reload before confirming.');prepared.push(next)}
 const results=[]
 for(const next of prepared){
  try{
   await uniqueField(next.type,partyIdentityField,io)
   await uniqueField('Address',addressIdentityField,io)
   await adoptReviewedPartyIdentity(admin,connectionId,next.job.org_id,next.job.party_type,next.providerId,io)
   if(next.address){
    const owners=await io.list('Address',['name'],[[addressIdentityField,'=',next.key]])
    if(owners.some(r=>r.name!==next.address.name))fail('Another provider address already has this identity.')
    if(!next.address[addressIdentityField])await io.update('Address',next.address.name,{[addressIdentityField]:next.key,modified:next.address.modified})
    const saved=await io.get('Address',next.address.name)
    if(saved.name!==next.address.name || saved[addressIdentityField]!==next.key)fail('The billing-address identity was not confirmed.')
   }
   const {error}=await admin.rpc('multideck_accounting_review_party',{p_job:next.job.id,p_revision:next.job.revision,p_provider_id:next.providerId,p_snapshot:next.snapshot,p_actor:actorId})
   if(error)fail('The review could not be retained. Reload this account before retrying.')
   results.push({jobId:next.job.id,queued:true})
  }catch(error){results.push({jobId:next.job.id,queued:false,message:error instanceof Error?error.message:'The link could not be reviewed.'})}
 }
 return {results,scope:'party_master',fullLedgerReconciled:false}
}
