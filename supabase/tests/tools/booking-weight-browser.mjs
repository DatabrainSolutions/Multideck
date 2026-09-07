// Real Booking weight JSX, controls, draft callback, Save validation and focus
// effects; surrounding state is synthetic. No Auth or hosted writes are used.
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const client=new URL('../../../multideck.client/',import.meta.url).pathname
const {build}=createRequire(client+'package.json')('esbuild')
const {chromium}=createRequire('/Users/leewright/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright')
const source=readFileSync(client+'src/components/multideck/booking-components.tsx','utf8')
const cut=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end)}
const cargoStart=source.indexOf('<TabsContent value="cargo"')
const surfaceStart=source.indexOf('<Surface padding="none"',cargoStart)
const surface=source.slice(surfaceStart,source.indexOf('</Surface>',surfaceStart)+10)
const lineStart=source.indexOf('{showChargeableWeight ? <div ref={lineWeightField}>')
const line=source.slice(lineStart,source.indexOf('\n',lineStart))
assert.ok(surfaceStart>cargoStart&&lineStart>surfaceStart)
const guard=cut('  async function saveDetails() {','    const allocationIssue')
const built=await build({stdin:{contents:`
import React,{useState,useRef,useEffect,useId} from 'react';import {createRoot} from 'react-dom/client';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';import {Surface} from '@/components/multideck/surface';
import {Plus,Trash2} from '@/components/icons/hugeicons';import {cn} from '@/lib/utils';
import {useLanguage} from '@/i18n/language-provider';
import {bookingChargeableWeightSummary,bookingChargeableWeightError} from '@/lib/booking-chargeable-weight';
${cut('function BookingCargoWiseField({','function BookingRouteScheduleFields(')}
const asRecord=value=>value||{};const recordText=(value,key)=>value[key]==null?'':String(value[key]);
const initial={booking:{editableDetails:{}},cargo:[{description:'First goods',chargeableWeightKg:'0.1'},{description:'Second goods',chargeableWeightKg:'0.2'},{description:'Unknown goods',chargeableWeightKg:null}]};
function Harness(){
const [workspace,setDraftWorkspace]=useState(initial),[selectedCargoIndex,setSelectedCargoIndex]=useState(0),[weightValidation,setWeightValidation]=useState();
const [detailSection,setDetailSection]=useState('cargo'),[editable,setEditable]=useState(true),[receipt,setReceipt]=useState(0);
const {t}=useLanguage();const cargoIndex=Math.min(selectedCargoIndex,workspace.cargo.length-1),cargo=workspace.cargo[cargoIndex];
${cut('  const lineWeightField = useRef<HTMLDivElement>(null)','  const updatedDate =')}
const facts={},editableDetails=workspace.booking.editableDetails,showChargeableWeight=true,chargeableSummary=bookingChargeableWeightSummary(workspace.cargo);
const detailValue=key=>recordText(editableDetails,key),cargoValue=key=>cargo?.[key]==null?'':String(cargo[key]);
const editDetail=key=>({editable,onChange:value=>setDraftWorkspace(current=>({...current,booking:{...current.booking,editableDetails:{...current.booking.editableDetails,[key]:value}}}))});
${cut('  function updateDraftCargo(', '  function addDraftCargo(')}
const editCargo=(index,key)=>({editable,onChange:value=>updateDraftCargo(index,key,value)});
const onCargoAdd=()=>setDraftWorkspace(current=>({...current,cargo:[...current.cargo,{description:'Added goods'}]}));
const setRemovingCargoIndex=index=>setDraftWorkspace(current=>({...current,cargo:current.cargo.filter((_,i)=>i!==index)}));
const draftBooking={},draftWorkspace=workspace,detailsDirty=true,savingDetails=false,loadedRecord={workspace:{}};
${guard} setReceipt(value=>value+1); }
return <main className="grid min-w-0 gap-4 p-4"><h1 className="text-[18px]">Air weight QA – synthetic state only</h1>
<div className="flex gap-2"><Button onClick={saveDetails} disabled={!editable}>Validate draft</Button><Button onClick={()=>setEditable(v=>!v)}>{editable?'Read only':'Edit'}</Button></div>
${surface}<section aria-label="Selected cargo line">${line}</section><output aria-label="Validated drafts">{receipt}</output></main>;
}createRoot(document.getElementById('root')).render(<Harness/>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':client+'src'},plugins:[{
name:'local-language',setup(builder){builder.onResolve({filter:/i18n\/language-provider$/},()=>({path:'qa',namespace:'qa'}));builder.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')||'en-GB',t:value=>value}}`}))}
}]})
const css=readFileSync(client+'dist/assets/multideck-app.css')
const server=createServer((request,response)=>{
 const path=new URL(request.url,'http://localhost').pathname;response.setHeader('Cache-Control','no-store');
 if(path==='/app.js'){response.setHeader('Content-Type','text/javascript');return response.end(built.outputFiles[0].text)}
 if(path==='/style.css'){response.setHeader('Content-Type','text/css');return response.end(css)}
 response.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({channel:'chrome',headless:true})
const directory=mkdtempSync(join(tmpdir(),'multideck-air-mobile-'))
const evidence=[]
try{
 for(const language of ['en-GB','en-US'])for(const width of [320,390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
  await page.goto(base+'/?language='+language)
  await page.getByRole('button',{name:'3. Unknown goods',exact:true}).click()
  const field=page.getByRole('textbox',{name:'Line chargeable weight (kg)',exact:true})
  if(width<640)assert.equal(await field.evaluate(element=>getComputedStyle(element).fontSize),'16px')
  if(width<400){
    const comparison=page.getByRole('region',{name:'Cargo line comparison',exact:true})
    await comparison.focus();await comparison.press('ArrowRight')
    await page.waitForFunction(()=>document.querySelector('[aria-label="Cargo line comparison"]').scrollLeft>0)
  }
  await field.fill('bad');await page.getByRole('button',{name:'Validate draft',exact:true}).click()
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Line chargeable weight (kg)')
  assert.equal(await field.getAttribute('aria-invalid'),'true')
  assert.ok(await field.getAttribute('aria-describedby'))
  assert.equal(await page.getByRole('status',{name:'Validated drafts'}).textContent(),'0')
  await field.fill('0.000000001');await field.press('Tab')
  assert.equal(await field.evaluate(element=>element===document.activeElement),false)
  assert.equal(await page.getByText('0.300000001',{exact:true}).count(),1)
  await page.getByRole('textbox',{name:'Shipment override (kg)',exact:true}).fill('-1')
  await page.getByRole('button',{name:'Validate draft',exact:true}).click()
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Shipment override (kg)')
  await page.getByRole('textbox',{name:'Shipment override (kg)',exact:true}).fill('')
  await page.getByRole('button',{name:'Validate draft',exact:true}).click()
  assert.equal(await page.getByRole('status',{name:'Validated drafts'}).textContent(),'1')
  const bounds=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(bounds.document<=bounds.viewport+1,JSON.stringify(bounds))
  await page.screenshot({path:join(directory,language+'-'+width+'-editing.png'),fullPage:true})
  await page.getByRole('button',{name:'Read only',exact:true}).click()
  assert.equal(await page.getByRole('textbox').count(),0)
  assert.deepEqual(errors,[])
  const screenshot=join(directory,language+'-'+width+'.png');await page.screenshot({path:screenshot,fullPage:true})
  evidence.push({language,width,bounds,screenshot,errors});await page.close()
 }
 console.log(JSON.stringify({status:'passed',scope:'real weight controls with synthetic surrounding state; not hosted persistence',evidence},null,2))
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
