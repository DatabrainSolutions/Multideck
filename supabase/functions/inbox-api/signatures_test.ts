import assert from 'node:assert/strict'
import {signatureCompanyText} from '../../../shared/email-signatures.ts'
import {providerSend} from './runtime.ts'
import {cleanSignatureImport,resolveSignature} from './signatures.ts'
import {buildMimeMessage,sha256Hex,editableDraftMetadata} from './core.ts'
import {newSignatureDocument,newSignatureBlock,validateSignatureDocument,renderSignature,eligibleSignatures,type SignatureTemplate,type SignatureValues} from '../../../shared/email-signatures.ts'
const values:SignatureValues={name:'Alex <Morgan>',jobTitle:'Operations',email:'alex@example.test',phone:'',mobile:'',company:'Example',website:'https://example.test',address:''}
Deno.test('company block resolves shared details, hides blanks and escapes content',()=>{
 const doc=newSignatureDocument('stacked');doc.rows[0].columns=[[{...newSignatureBlock('contact'),field:'companyDetails'}]];
 const companyDetails=signatureCompanyText({name:'Company <Ltd>',website:'https://example.test',phone:'01234',address:'Main Street',email:''});
 assert.equal(companyDetails,'Company <Ltd>\nhttps://example.test\n01234\nMain Street');
 const result=renderSignature(validateSignatureDocument(doc),{...values,companyDetails});
 assert.match(result.html,/Company &lt;Ltd&gt;/);assert.match(result.html,/01234<br>Main Street/);
 assert.equal(renderSignature(doc,{...values,companyDetails:''}).text,'');
})
Deno.test('three and four column signatures preserve custom spacing through save and email rendering',()=>{
 for(const count of [3,4]){
  const doc=newSignatureDocument();doc.columnGap=32;doc.rows[0].columns=Array.from({length:count},()=>[newSignatureBlock('text')]);
  const saved=validateSignatureDocument(JSON.parse(JSON.stringify(doc)));
  assert.equal(saved.columnGap,32);assert.equal(saved.rows[0].columns.length,count);
  assert.equal((renderSignature(saved,values).html.match(/padding-right:32px/g)||[]).length,count-1);
  saved.columnGap=0;assert.match(renderSignature(saved,values).html,/padding-right:0px/);
 }
})
Deno.test('saved draft editing preserves signature and recipient removals without exposing other owners or provider drafts',()=>{
 const metadata={mode:'reply_all',sourceMessageId:'source',signature:{enabled:false,templateId:'signature',revision:5},openTrackingEnabled:false,draftEdits:{addedTo:[],addedCc:[],addedBcc:[],removedAddresses:['removed@example.test']}}
 const row={CommMessage_IsDraft:true,CommMessage_CreatedBy:'owner',CommMessage_SourceTypeCode:'manual',CommMessage_ProviderMessageID:null,CommMessage_BodyJSON:JSON.stringify(metadata)}
 assert.deepEqual(editableDraftMetadata(row,'owner',true),{mode:'reply_all',sourceMessageId:'source',signature:metadata.signature,trackOpens:false,...metadata.draftEdits})
 assert.equal(editableDraftMetadata(row,'colleague',true),null)
 assert.equal(editableDraftMetadata(row,'owner',false),null)
 assert.equal(editableDraftMetadata({...row,CommMessage_ProviderMessageID:'provider-id'},'owner',true),null)
 assert.equal(editableDraftMetadata({...row,CommMessage_IsDraft:false},'owner',true),null)
 assert.equal(editableDraftMetadata({...row,CommMessage_BodyJSON:{...metadata,draftEdits:undefined}},'owner',true),null)
})
function template(id:string,assignments:SignatureTemplate['assignments'],ownerUserId:string|null=null):SignatureTemplate{return {id,name:id,document:newSignatureDocument('stacked'),revision:1,publishedDocument:newSignatureDocument('stacked'),publishedRevision:1,assignments,publishedAssignments:assignments,ownerUserId,sourceTemplateId:null,archived:false,updatedAt:'2026-09-11'}}
Deno.test('assignment precedence retains multiple departments, individual overrides, and private allowed copies',()=>{
 const all=[template('all',[{kind:'everyone',id:null}]),template('ops',[{kind:'department',id:'ops'}]),template('sales',[{kind:'department',id:'sales'}]),template('direct',[{kind:'user',id:'alex'}]),template('mine',[],'alex'),template('other',[],'bob')]
 assert.deepEqual(eligibleSignatures(all,'alex',['ops','sales'],true).map(t=>t.id),['direct','mine'])
 assert.deepEqual(eligibleSignatures(all.filter(t=>t.id!=='direct'),'alex',['ops','sales'],false).map(t=>t.id),['ops','sales'])
 assert.deepEqual(eligibleSignatures(all,'new',[],false).map(t=>t.id),['all'])
 assert.deepEqual(eligibleSignatures(all.map(t=>({...t,archived:true})),'alex',['ops'],true),[])
})
Deno.test('email rendering escapes personal fields, omits empty details and rejects unsafe links and malformed blocks',()=>{
 const doc=newSignatureDocument('stacked');const out=renderSignature(doc,values)
 assert.match(out.html,/Alex &lt;Morgan&gt;/);assert.match(out.html,/mailto:alex@example.test/);assert.ok(!out.html.includes('tel:'));assert.ok(!out.text.includes('undefined'))
 const bad=structuredClone(doc);bad.rows[0].columns[0][0].href='javascript:alert(1)';assert.throws(()=>validateSignatureDocument(bad),/HTTPS/)
 bad.rows[0].columns[0][0].href='';bad.rows[0].columns[0].push({...bad.rows[0].columns[0][0]});assert.throws(()=>validateSignatureDocument(bad),/unique/)
 assert.throws(()=>validateSignatureDocument({...doc,rows:Array.from({length:21},()=>doc.rows[0])}),/20 rows/)
})
Deno.test('imports strip scripts, handlers, tracking pixels and dangerous styling while retaining safe tables and text',()=>{
 const html=cleanSignatureImport('<table><tr><td style="color:#123456;position:fixed;background-image:url(https://tracker.test)"><b>Alex</b><script>alert(1)</script><img src="https://tracker.test/pixel"><a href="javascript:alert(1)" onclick="evil()">Call</a></td></tr></table>')
 assert.match(html,/<table>/);assert.match(html,/<b>Alex<\/b>/);assert.doesNotMatch(html,/script|onclick|javascript|tracker|position|background-image/)
})
function fixture(){
 const user='11111111-1111-4111-8111-111111111111';const company='22222222-2222-4222-8222-222222222222';const id='33333333-3333-4333-8333-333333333333'
 const tables:Record<string,any[]>={cmp_Users:[{User_ID:user,Company_ID:company,Auth_User_ID:user,User_AccessStatus:'active',User_Firstname:'Alex',User_Lastname:'Morgan',User_Email:'alex@example.test',User_JobTitle:'Operations'}],cmp_Company:[{Company_ID:company,Company_Name:'Example'}],cmp_Users_Roles:[{User_ID:user,sys_UserRole_ID:'operator'}],sys_UserRole_Permissions:[{sys_UserRole_ID:'operator',sys_Permission_ID:'send'}],sys_Permissions:[{sys_Permission_ID:'send',sys_Permission_Value:'Email.Send'}],email_signature_templates:[{id,company_id:company,name:'Operations',document:newSignatureDocument('stacked'),published_document:newSignatureDocument('stacked'),published_revision:1,revision:1,owner_user_id:null,published_assignments:[{kind:'everyone',id:null}],assignments:[],archived:false}],email_signature_profiles:[],email_signature_policies:[],cmp_Departments:[],cmp_Users_Departments:[],cmp_Offices:[],cmp_Users_Offices:[]}
 const db:any={rpc(){return Promise.resolve({data:[],error:null})},from(name:string){let rows=tables[name]||[];let one=false;const q:any={select(){return q},eq(k:string,v:any){rows=rows.filter(r=>r[k]===v);return q},in(k:string,v:any[]){rows=rows.filter(r=>v.includes(r[k]));return q},order(){return q},limit(n:number){rows=rows.slice(0,n);return q},maybeSingle(){one=true;return q},then(resolve:any){return Promise.resolve({data:one?rows[0]||null:rows,error:null}).then(resolve)}};return q}}
 return {db,tables,id,user,company,actor:{userId:user,authUserId:user,companyId:company,email:'alex@example.test',displayName:'Alex Morgan'},mailbox:{CommMailbox_Address:'shared@example.test'}}
}
Deno.test('send resolution uses authorised shared sender, validates revision/profile, keeps off universal, rejects inactive actors',async()=>{
 const f=fixture();const profile={...values,name:'Alex Morgan',email:'shared@example.test',website:'',companyDetails:'Example'};const selection={enabled:true,templateId:f.id,revision:1,fingerprint:await sha256Hex(JSON.stringify([f.id,1,profile]))}
 const resolved=await resolveSignature(f.db,f.actor,f.mailbox,selection);assert.match(resolved.html,/shared@example.test/);assert.ok(!resolved.text.includes('alex@example.test'))
 await assert.rejects(()=>resolveSignature(f.db,f.actor,f.mailbox,{...selection,revision:0}),/signature changed/)
 f.tables.cmp_Users[0].User_Firstname='Changed';await assert.rejects(()=>resolveSignature(f.db,f.actor,f.mailbox,selection),/signature changed/)
 const off=await resolveSignature(f.db,f.actor,f.mailbox,{...selection,enabled:false});assert.equal(off.html,'');assert.equal(off.attachments.length,0)
 await assert.rejects(()=>resolveSignature(f.db,f.actor,f.mailbox,{...selection,templateId:'foreign'}),/Choose and review/)
 f.tables.cmp_Users[0].User_AccessStatus='inactive';await assert.rejects(()=>resolveSignature(f.db,f.actor,f.mailbox,{...selection,enabled:false}),/no longer active/)
})
Deno.test('personal template survives source unassignment and cannot reference another person’s asset',async()=>{
 const f=fixture();const t=f.tables.email_signature_templates[0];t.owner_user_id=f.user;t.source_template_id='old-template';t.published_assignments=[]
 const block={...newSignatureBlock('image'),assetId:'44444444-4444-4444-8444-444444444444'};t.published_document.rows.push({id:crypto.randomUUID(),columns:[[block]]})
 f.tables.email_signature_assets=[{id:block.assetId,company_id:f.company,owner_user_id:'someone-else'}]
 const fingerprint=await sha256Hex(JSON.stringify([f.id,1,{...values,name:'Alex Morgan',email:'shared@example.test',website:'',companyDetails:'Example'}]));await assert.rejects(()=>resolveSignature(f.db,f.actor,f.mailbox,{enabled:true,templateId:f.id,revision:1,fingerprint}),/image is unavailable/)
})

Deno.test('signature images travel as CID MIME resources with HTML and plain alternatives',()=>{
 const mime=buildMimeMessage({from:{address:'alex@example.test',displayName:null},to:[{address:'recipient@example.test',displayName:null}],cc:[],bcc:[],subject:'Update',bodyText:'Hello\nAlex',bodyHtml:'<p>Hello</p><img src="cid:signature-logo@multideck">',attachments:[{fileName:'logo.png',mimeType:'image/png',bytes:new Uint8Array([137,80,78,71]),isInline:true,contentId:'signature-logo@multideck'},{fileName:'quote.pdf',mimeType:'application/pdf',bytes:new Uint8Array([37,80,68,70])}]})
 assert.match(mime,/multipart\/alternative/);assert.match(mime,/multipart\/related/);assert.match(mime,/multipart\/mixed/);assert.match(mime,/Content-ID: <signature-logo@multideck>/);assert.match(mime,/Content-Disposition: inline; filename="logo.png"/);assert.match(mime,/Content-Disposition: attachment; filename="quote.pdf"/);assert.ok(mime.includes('Hello\r\nAlex'))
})

Deno.test('Outlook signature-only provider draft refresh replaces inline files and respects toggle off',async()=>{
 const original=globalThis.fetch;const calls:{url:string;method:string;body:any}[]=[]
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push({url,method:init?.method||'GET',body:init?.body?JSON.parse(String(init.body)):null});
 if(url.endsWith('/attachments?$select=id,isInline,contentId'))return Response.json({value:[{id:'old-logo',isInline:true,contentId:'signature-44444444-4444-4444-8444-444444444444@multideck'}]});
 if(url.includes('?$select=id,isDraft'))return Response.json({id:'draft-1',isDraft:true,hasAttachments:false});return Response.json({id:'ok'})}) as typeof fetch
 try{await providerSend('outlook','fixture-token',{CommMailbox_Address:'alex@example.test'},{command:'new',source:null,to:[{address:'recipient@example.test',displayName:null}],cc:[],bcc:[]},'Update','Hello',null,'id',false,[],'draft-1');
 assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/old-logo')));assert.equal(calls.filter(c=>c.url.endsWith('/send')).length,1);assert.equal(calls.find(c=>c.method==='PATCH')?.body.body.content,'Hello');assert.ok(!calls.some(c=>c.method==='POST'&&c.url.endsWith('/attachments')))
 }finally{globalThis.fetch=original}
})
Deno.test('Outlook unseen ordinary attachments stop provider draft send',async()=>{
 const original=globalThis.fetch;let sent=false;
 globalThis.fetch=(async(input:RequestInfo|URL)=>{const url=String(input);if(url.endsWith('/send'))sent=true;return Response.json(url.includes('/attachments?')?{value:[{id:'unseen',isInline:false}]}:{id:'draft-1',isDraft:true,hasAttachments:true})}) as typeof fetch
 try{await assert.rejects(()=>providerSend('outlook','fixture-token',{CommMailbox_Address:'alex@example.test'},{command:'new',source:null,to:[{address:'recipient@example.test',displayName:null}],cc:[],bcc:[]},'Update','Hello',null,'id',false,[],'draft-1'),/now has attachments/);assert.equal(sent,false)}finally{globalThis.fetch=original}
})

Deno.test('trust badges retain managed assets and render safe image rows',()=>{
 const block={...newSignatureBlock('badges'),images:[{assetId:'11111111-1111-4111-8111-111111111111',alt:'Accreditation <one>',href:'https://example.test/accreditation'},{assetId:'22222222-2222-4222-8222-222222222222',alt:'Membership',href:''}]};
 const document=validateSignatureDocument({version:1,width:480,colour:'#ffffff',rows:[{id:'row-badges',columns:[[block]]}]});
 const rendered=renderSignature(document,values,{'11111111-1111-4111-8111-111111111111':'cid:badge-one','22222222-2222-4222-8222-222222222222':'cid:badge-two'});
 assert.match(rendered.html,/cid:badge-one/);assert.match(rendered.html,/cid:badge-two/);assert.match(rendered.html,/Accreditation &lt;one&gt;/);assert.match(rendered.html,/https:\/\/example.test\/accreditation/);
 assert.equal(rendered.text,'Accreditation <one> · Membership');
 assert.throws(()=>validateSignatureDocument({...document,rows:[{id:'row',columns:[[{...block,images:[{...block.images[0],href:'javascript:alert(1)'}]}]]}]}),/HTTPS/);
 assert.throws(()=>validateSignatureDocument({...document,rows:[{id:'row',columns:[[{...block,images:Array(9).fill(block.images[0])}]]}]}),/eight/);
});

Deno.test('resized columns survive repeated save validation and field edits, including email output',()=>{
 const doc=newSignatureDocument('side');doc.rows[0].columnWidths=[33,67]
 let saved=validateSignatureDocument(JSON.parse(JSON.stringify(doc)))
 saved.rows[0].columns[1][0].label='Contact'
 saved=validateSignatureDocument(JSON.parse(JSON.stringify(saved)))
 assert.deepEqual(saved.rows[0].columnWidths,[33,67])
 const output=renderSignature(saved,values)
 assert.match(output.html,/<td width="33%"/)
 assert.match(output.html,/<td width="67%"/)
 assert.deepEqual(validateSignatureDocument(newSignatureDocument('side')).rows[0].columnWidths,[50,50])
})
