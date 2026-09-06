import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mapping } from './quote-cargo-client-fixture.mjs'

const client = fileURLToPath(new URL('../../multideck.client/', import.meta.url))
export const require = createRequire(`${client}package.json`)
const { build, transformSync } = require('esbuild')
export const React = require('react')
export const { renderToStaticMarkup } = require('react-dom/server')
const compiled = await build({ entryPoints: [`${client}src/components/multideck/quote-details/quote-submitted-details.tsx`], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react','react/jsx-runtime'], alias: { '@': `${client}src` },
  plugins: [{ name: 'test-language', setup(build) {
    build.onResolve({ filter: /i18n\/language-provider$/ }, () => ({ path: 'language', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useLanguage=()=>({t:value=>value,language:globalThis.quoteTestLanguage||"en-GB"})' }))
  } }],
})
const module = { exports: {} }
new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports)
export const { QuoteSubmittedDetails } = module.exports
const projection = await build({ entryPoints: [`${client}src/lib/quote-version-presentation.ts`], bundle:true,write:false,platform:'node',format:'cjs',alias:{'@':`${client}src`} })
const projected = { exports:{} }
new Function('module','exports',projection.outputFiles[0].text)(projected,projected.exports)
export const { quoteWorkspaceFromVersion, quoteVersionSnapshot } = projected.exports

// Execute the real page's view-state expressions, not a duplicate selector.
const ts = require('typescript')
const source = readFileSync(`${client}src/pages/quotes-page.tsx`,'utf8')
const ast = ts.createSourceFile('quotes-page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const names = ['currentVersion','currentVersionIsSubmitted','viewedVersion','presentedVersion','viewingSubmittedVersion','viewedVersionWorkspace','viewingHistoricalVersion','workspaceEditable','presentedQuote','activeCharges']
const expressions = new Map()
let createVersionSource
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) expressions.set(node.name.getText(ast),node.initializer.getText(ast))
  if (ts.isFunctionDeclaration(node) && node.name?.text==='createNewQuoteVersion') createVersionSource=node.getText(ast)
  ts.forEachChild(node,visit)
}
visit(ast)
for (const name of names) assert.ok(expressions.has(name), `Page selection ${name} must exist`)
const charges = ast.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text==='quoteChargesFromWorkspace').getText(ast)
const compiledSelection = transformSync(`${charges}\nfunction select(workspace,viewedVersionId,draftQuote,draftCharges,lookups){
  ${names.map(name=>`const ${name}=${expressions.get(name)};`).join('\n')}
  return {presentedVersion,viewingSubmittedVersion,viewedVersionWorkspace,viewingHistoricalVersion,workspaceEditable,presentedQuote,activeCharges};
}`,{loader:'ts'}).code
export const selectVersion = new Function('useMemo','quoteWorkspaceFromVersion','quoteRecordFromWorkspace',`${compiledSelection};return select`)(
  callback=>callback(),quoteWorkspaceFromVersion,mapping.quoteRecordFromWorkspace)

export async function attemptRevisionWithUnavailableSnapshot() {
  assert.ok(createVersionSource)
  const errors=[]
  const body=transformSync(createVersionSource,{loader:'ts'}).code
  const attempt=new Function('currentQuoteId','workspace','currentVersionIsSubmitted','creatingVersion','saving','viewingSubmittedVersion','viewedVersionWorkspace','setWorkflowError','setCreatingVersion',`${body};return createNewQuoteVersion`)(
    'quote-id',{},true,false,false,true,null,error=>errors.push(error),()=>{throw new Error('An unreadable source must not start a revision')})
  await attempt('copy')
  await attempt('blank')
  return errors
}

// Exercise the page's real submitted-panel gate as well as its state selector.
const panelStart=source.indexOf('  function renderActiveWorkspacePanel() {')
const panelBodyStart=source.indexOf('\n',panelStart)
const panelEnd=source.indexOf('    if (activeTab === "overview")',panelBodyStart)
assert.ok(panelStart>=0 && panelEnd>panelBodyStart)
const panelModule={exports:{}}
const panelCode=transformSync(`export function renderSelectedPanel(state,activeTab){
 const {viewingSubmittedVersion,viewedVersionWorkspace,presentedVersion}=state;
 const workspace={quote:{reference:'JQ20020'}};
 ${source.slice(panelBodyStart,panelEnd)}
 return 'Draft panel';
}`,{loader:'tsx',jsx:'automatic',format:'cjs'}).code
new Function('require','module','exports','QuoteSubmittedDetails','Surface','t',panelCode)(
 require,panelModule,panelModule.exports,QuoteSubmittedDetails,props=>React.createElement('section',props),value=>value)
export const renderSelectedPanel=(state,tab)=>renderToStaticMarkup(panelModule.exports.renderSelectedPanel(state,tab))

export const makeVersion = (number, quote = {}) => ({ CusQuoteVersion_ID:`version-${number}`,CusQuoteVersion_Number:number,
  CusQuoteVersion_StatusCode:'sent',CusQuoteVersion_IsSubmitted:true,CusQuoteVersion_IsCurrent:number===2,
  CusQuoteVersion_SubmittedAt:'2026-09-05T10:00:00Z',CusQuoteVersion_SnapshotJSON:{quote:{customerName:'Saved customer',shipmentFacts:{},charges:[],...quote}} })
export const makeWorkspace = (versions) => ({ quote:{id:'master-id',reference:'JQ20020',lifecycle:'draft',customerId:'current-customer',customerName:'CURRENT CUSTOMER',
  terms:'CURRENT TERMS',customerNotes:'CURRENT NOTES',contactEmail:'current@example.test',shipmentFacts:{knownCargo:'CURRENT CARGO'},payer:{name:'CURRENT PAYER'}},
  versions,charges:[{id:'current-charge',costLocal:999,sellLocal:9999}],totals:{cost:999,sell:9999,profit:9000,marginPct:90} })
export const renderVersion = (version, overview=false, chargesOnly=false) => renderToStaticMarkup(React.createElement(QuoteSubmittedDetails,{version,reference:'JQ20020',overview,chargesOnly}))
