import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/_shared/dexter-uploads.ts', import.meta.url), 'utf8')
const implementation = ts.transpileModule(source.slice(source.indexOf('export async function previewDexterUpload')), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const id='11111111-1111-4111-8111-111111111111'
async function run(overrides={}, permission=true) {
 const row={AIDexterUpload_ID:id,AIDexterUpload_CompanyID:'company',AIDexterUpload_UserID:'owner',AIDexterUpload_StatusCode:'active',AIDexterUpload_ScanStatusCode:'clean',AIDexterUpload_ExpiresAt:'2099-01-01T00:00:00Z',AIDexterUpload_FileName:'enquiry.pdf',AIDexterUpload_MimeType:'application/pdf',AIDexterUpload_FileSizeBytes:100,DOC_StoredObjects:{DOCStoredObject_StatusCode:'active',DOCStoredObject_Container:'private',DOCStoredObject_BlobName:'owned/file'},...overrides}
 const filters=[];let signed=0
 const query={select(){return this},in(k,v){filters.push(r=>v.includes(r[k]));return this},eq(k,v){filters.push(r=>r[k]===v);return this},gt(k,v){filters.push(r=>r[k]>v);return this},async maybeSingle(){return {data:filters.every(f=>f(row))?row:null,error:null}}}
 const admin={from(name){assert.equal(name,'AI_DexterUploads');return query},storage:{from(bucket){assert.equal(bucket,'private');return {async createSignedUrl(path,ttl){assert.equal(path,'owned/file');assert.equal(ttl,300);signed++;return {data:{signedUrl:'https://example.test/private-preview'}}}}}}}
 class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}
 const exports={}
 new Function('exports','runtimeClients','requireActor','requirePermission','InboxHttpError',implementation)(exports,()=>({user:{},admin}),async()=>({companyId:'company',userId:'owner'}),async()=>{if(!permission)throw new HttpError(403,'Denied','forbidden')},HttpError)
 try{return {result:await exports.previewDexterUpload('Bearer test',id),signed}}catch(error){return {error,signed}}
}
test('owned active clean upload receives a five-minute preview link',async()=>{const out=await run();assert.equal(out.result.originalName,'enquiry.pdf');assert.equal(out.signed,1)})
for(const [label,change] of Object.entries({other_user:{AIDexterUpload_UserID:'other'},other_company:{AIDexterUpload_CompanyID:'other'},unclean:{AIDexterUpload_ScanStatusCode:'pending'},expired:{AIDexterUpload_ExpiresAt:'2000-01-01'},deleted:{AIDexterUpload_StatusCode:'deleted'},deleted_object:{DOC_StoredObjects:{DOCStoredObject_StatusCode:'deleted'}}}))test(`denies ${label} before signing`,async()=>{const out=await run(change);assert.equal(out.error.status,404);assert.equal(out.signed,0)})
test('revoked Dexter permission denies preview before signing',async()=>{const out=await run({},false);assert.equal(out.error.status,403);assert.equal(out.signed,0)})

test("validated document is readable without claiming a malware verdict",async()=>{const out=await run({AIDexterUpload_ScanStatusCode:"validated"});assert.equal(out.result.originalName,"enquiry.pdf");assert.equal(out.signed,1)})
