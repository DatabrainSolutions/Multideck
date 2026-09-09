// Isolated actual mode fields, review handlers and dialogs; synthetic data only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(`${client}package.json`)('esbuild')
const quote=readFileSync(`${client}src/pages/quotes-page.tsx`,'utf8')
const booking=readFileSync(`${client}src/components/multideck/booking-components.tsx`,'utf8')
function cut(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b)}
function dialog(source){const a=source.indexOf('      <Dialog open={pendingOverallMode !== null}');const b=source.indexOf('</Dialog>',a);assert.ok(a>0&&b>a);return source.slice(a,b+9)}
function warning(source){const a=source.indexOf('      <div role="status" className={fieldPolicy.routingModeMismatch');const b=source.indexOf('</div>',a);assert.ok(a>0&&b>a);return source.slice(a,b+6)}
const quoteField=cut(quote,'          <div ref={overallModeTriggerRef}','\n')
const bookingField=cut(booking,'              <div ref={overallModeTriggerRef}','\n')
const built=await build({stdin:{contents:`
  import React,{useState,useId,useRef} from 'react';import {createRoot} from 'react-dom/client';
  import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';
  import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
  import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
  import {CompactFieldShell,CompactCombobox} from '@/components/multideck/quote-details/quote-detail-fields';
  import {freightFieldPolicy,freightModeKey,freightShipmentAllowed,freightBookingMode as bookingWorkspaceMode} from '@/lib/freight-field-policy';
  import {cn} from '@/lib/utils';import {useLanguage} from '@/i18n/language-provider';
  ${cut(quote,'function QuoteCompactSelect(','function CarrierServiceLevelPill(')}
  ${cut(booking,'function bookingFieldOptions(','function BookingCargoWiseAmountField(')}
  const initialRoutes=[{id:'sea-leg',mode:'Sea',houseTransportReference:'ORIGINAL-HBL',plannedArrivalAt:'2026-10-01'}];
  function QuoteHarness(){
    const [quote,setQuote]=useState({id:'quote-1',mode:'Sea',shipmentType:'FCL',routingLegsJson:JSON.stringify(initialRoutes)});
    const [editable,setEditable]=useState(true),[pendingOverallMode,setPendingOverallMode]=useState(null),[error,setError]=useState('');
    const overallModeTriggerRef=useRef(null),overallModeCancelRef=useRef(null);const {t}=useLanguage();const toast={error:(_,v)=>setError(v.description)};
    const modes=['Sea','Air','Road','Rail','Multimodal'];const requireCoreFields=true,validationAttempted=false;
    const onQuotePatch=patch=>setQuote(q=>({...q,...patch}));
    const fieldPolicy=freightFieldPolicy({mode:quote.mode,shipmentType:quote.shipmentType,legModes:JSON.parse(quote.routingLegsJson).map(r=>r.mode)});
    ${cut(quote,'  function requestOverallMode(','  function baseRoutingLeg(')}
    return <><h1>Quote overall mode QA</h1><Button onClick={()=>setEditable(v=>!v)}>{editable?'View read-only':'Edit draft'}</Button>
      ${warning(quote)}${quoteField}${dialog(quote)}
      <output id="receipt" className="block break-words">{JSON.stringify(quote)}</output><p role="alert">{error}</p></>;
  }
  function BookingHarness(){
    const [value,setValue]=useState({id:'booking-1',mode:'OCEAN',shipmentType:'FCL'});const record={booking:value};const workspace={routes:initialRoutes};
    const [editable,setEditable]=useState(true),[pendingOverallMode,setPendingOverallMode]=useState(null),[error,setError]=useState('');
    const overallModeTriggerRef=useRef(null),overallModeCancelRef=useRef(null);const {t}=useLanguage();const toast={error:(_,v)=>setError(v.description)};
    const modeOptions=['OCEAN','AIR','ROAD','RAIL','MULTIMODAL'];const detailValue=(_,fallback)=>fallback;
    const onBookingChange=(field,next)=>setValue(v=>({...v,[field]:next}));const onDetailChange=onBookingChange;const editField=()=>({editable});
    const fieldPolicy=freightFieldPolicy({mode:value.mode,shipmentType:value.shipmentType,legModes:workspace.routes.map(r=>r.mode)});
    ${cut(booking,'  function requestOverallMode(','  return (')}
    return <><h1>Booking overall mode QA</h1><Button onClick={()=>setEditable(v=>!v)}>{editable?'View read-only':'Edit draft'}</Button>
      ${warning(booking)}${bookingField}${dialog(booking)}
      <output id="receipt" className="block break-words">{JSON.stringify({booking:value,routes:workspace.routes})}</output><p role="alert">{error}</p></>;
  }
  createRoot(document.getElementById('root')).render(<main className="grid grid-cols-1 gap-4 p-4 text-[13px]">{new URLSearchParams(location.search).get('kind')==='booking'?<BookingHarness/>:<QuoteHarness/>}</main>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{name:'qa-language',setup(b){b.onResolve({filter:/i18n\/language-provider$/},()=>({path:'qa',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}`}))}}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const path=new URL(req.url,'http://localhost').pathname
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].text)}
  if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Overall mode QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0,'127.0.0.1',()=>console.log(`Mode QA: http://127.0.0.1:${server.address().port} PID ${process.pid}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
