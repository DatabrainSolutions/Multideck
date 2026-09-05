// Production routing JSX, callbacks and controls with synthetic state only.
// No tenant connection, customer email or operational writes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
const client = fileURLToPath(new URL('../../../multideck.client/', import.meta.url))
const { build } = createRequire(`${client}package.json`)('esbuild')
const source = readFileSync(`${client}src/pages/quotes-page.tsx`, 'utf8')
const cut = (a,b) => { const start=source.indexOf(a),end=source.indexOf(b,start); assert.ok(start>=0&&end>start); return source.slice(start,end) }
const start = source.indexOf('          {routingLegs.length > 0 ? (')
const end = source.indexOf('\n        </div>\n      </CompactSectionShell>',start)
assert.ok(start>0&&end>start)
const routing = source.slice(start,end)
const built = await build({stdin:{contents:`
  import React,{useState,useId} from 'react';import {createRoot} from 'react-dom/client';
  import {Button} from '@/components/ui/button';import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
  import {Trash2} from '@/components/icons/hugeicons';import {cn} from '@/lib/utils';
  import {CompactFieldShell,CompactCombobox} from '@/components/multideck/quote-details/quote-detail-fields';
  import {MultideckDatePicker} from '@/components/multideck/date-picker';import {useLanguage} from '@/i18n/language-provider';
  ${cut('function quoteRoutingLegs(', 'function quoteCountryFlag(')}
  ${cut('function quoteDateInputValue(', 'const transportModeOptions')}
  ${cut('function QuoteCompactDatePicker(', 'function LockedQuoteTextarea(')}
  ${cut('function QuoteCompactSelect(', 'function CarrierServiceLevelPill(')}
  const loc=(unlocode)=>({countryCode:unlocode.slice(0,2),countryName:'',place:'',unlocode});
  const first={id:'keep-me',mode:'Air',origin:loc('GBLHR'),destination:loc('USJFK'),estimatedDeparture:'2026-09-18',estimatedArrival:'',carrierId:'carrier-1',carrierName:'Air carrier',serviceLevel:'Express'};
  const initial={mode:'Sea',origin:'GBLHR',destination:'USCHI',estimatedDeparture:'2026-09-18',estimatedArrival:'2026-10-01',routingLegsJson:JSON.stringify([first,{...first,id:'remove-me',mode:'Road',origin:loc('USJFK'),destination:loc('USCHI'),estimatedArrival:'2026-10-01'}])};
  function Harness(){
    const [quote,setQuote]=useState(initial);const [editable,setEditable]=useState(true);const {t}=useLanguage();
    const routingLegs=quoteRoutingLegs(quote.routingLegsJson);const originLocation=first.origin,destinationLocation=first.destination;
    const modes=['Sea','Air','Road','Rail','Multimodal'];const locationOptions=[];const routeLocationOptions=[];
    const organisationDirectories={carrier:{options:[{id:'carrier-1',value:'Air carrier',label:'Air carrier'}]}};
    const organisationsById=new Map([['carrier-1',{name:'Air carrier'}]]);const relatedOptions=()=>[];
    const onQuotePatch=(patch)=>setQuote(current=>({...current,...patch}));
    ${cut('  function updateLocation(prefix:', '  function updateRecurrence(')}
    return <main className="p-4"><h1 className="mb-4 text-[18px]">Routing QA — synthetic data</h1>
      <div className="mb-4 flex flex-wrap gap-2"><Button disabled={!editable||routingLegs.length>=30} onClick={addRoutingLeg}>Add routing leg</Button><Button onClick={()=>setEditable(v=>!v)}>{editable?'View read-only':'Edit draft'}</Button><Button onClick={()=>setQuote(current=>({...current,routingLegsJson:quoteRoutingLegsValue(quoteRoutingLegs(current.routingLegsJson))}))}>Save/reopen fixture</Button></div>
      <p className="mb-4">Overall mode: {quote.mode} · Destination: {quote.destination||'TBC'} · ETA: {quote.estimatedArrival||'TBC'}</p>
      ${routing}
      <output className="mt-4 block break-words text-[12px]" id="receipt">{quote.routingLegsJson}</output>
    </main>;
  }createRoot(document.getElementById('root')).render(<Harness/>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{
  name:'isolated-language',setup(builder){builder.onResolve({filter:/i18n\/language-provider$/},()=>({path:'qa',namespace:'qa'}));builder.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}`}))}
}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((request,response)=>{
  response.setHeader('Cache-Control','no-store');const path=new URL(request.url,'http://localhost').pathname
  if(path==='/app.js'){response.setHeader('Content-Type','text/javascript');return response.end(built.outputFiles[0].text)}
  if(path==='/style.css'){response.setHeader('Content-Type','text/css');return response.end(css)}
  response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Quote routing QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0,'127.0.0.1',()=>console.log(`Routing QA: http://127.0.0.1:${server.address().port} PID ${process.pid}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
