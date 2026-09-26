import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../multideck.client/package.json', import.meta.url))
const ts = require('typescript')
const source = readFileSync(new URL('../functions/customs-invoice-ocr/index.ts', import.meta.url), 'utf8')
const ast = ts.createSourceFile('ocr.ts', source, ts.ScriptTarget.Latest, true)
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'retainOriginalInvoice')
const context = vm.createContext({ documentBucket: 'multideck-documents', HttpError: class extends Error { constructor(status,message) { super(message); this.status=status } } })
vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target:ts.ScriptTarget.ES2022 } }).outputText, context)
const input = { declarationId:'declaration',extractionId:'upload',fileName:'original.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:new Uint8Array([1,2,3]) }
function fixture(uploadError=null, rpcError=null) {
  const calls=[]
  return { calls, admin:{storage:{from:bucket=>({upload:async(path,bytes,options)=>{calls.push({bucket,path,bytes,options});return {error:uploadError}}})},
    rpc:async(name,args)=>{calls.push({name,args});return {error:rpcError}}} }
}
test('retain exact original bytes privately, without replacing preview or existing objects', async()=>{
  const f=fixture(); await context.retainOriginalInvoice(f.admin,{authUserId:'verified'},input,'hash')
  assert.equal(f.calls[0].bytes,input.bytes)
  assert.equal(f.calls[0].options.upsert,false)
  assert.equal(f.calls[0].options.contentType,input.mimeType)
  assert.equal(f.calls[1].args.caller_auth_user_id,'verified')
  assert.equal(f.calls[1].args.requested_sha256,'hash')
  assert.equal(f.calls[1].args.requested_size,3)
})
test('failed storage stops linking; uncertain registration and duplicate storage remain retry-safe', async()=>{
  const failed=fixture({statusCode:'503'}); await assert.rejects(()=>context.retainOriginalInvoice(failed.admin,{authUserId:'verified'},input,'hash'))
  assert.equal(failed.calls.length,1)
  const duplicate=fixture({statusCode:'409'}); await context.retainOriginalInvoice(duplicate.admin,{authUserId:'verified'},input,'hash')
  assert.equal(duplicate.calls.length,2)
  const uncertain=fixture(null,{}); await assert.rejects(()=>context.retainOriginalInvoice(uncertain.admin,{authUserId:'verified'},input,'hash'))
  const unsaved=fixture(); await assert.rejects(()=>context.retainOriginalInvoice(unsaved.admin,{}, {...input,declarationId:null},'hash'))
  assert.equal(unsaved.calls.length,0)
})
test('commercial originals precede conversion/cache/provider calls; other shared importer workflows are unchanged',()=>{
  assert.match(source,/input.documentType === "commercial_invoice"[\s\S]*retainOriginalInvoice[\s\S]*let prepared =/)
  const cleanup=readFileSync(new URL('../functions/customs-invoice-preview-cleanup/index.ts',import.meta.url),'utf8')
  assert.match(cleanup,/CUSTIE_StoredObjectID/)
  assert.doesNotMatch(cleanup,/original-invoices|Customs_Documents/)
})
