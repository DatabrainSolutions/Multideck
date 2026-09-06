// Actual production schedule group, field primitives and draft updater;
// synthetic state only, with no tenant or provider calls.
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import {cut} from '../booking-container-client-fixture.mjs'
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(`${client}package.json`)('esbuild')
const built=await build({stdin:{contents:`
import React,{useState,useId} from 'react';import {createRoot} from 'react-dom/client';
import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {CompactCombobox} from '@/components/multideck/quote-details/quote-detail-fields';
import {cn} from '@/lib/utils';import {useLanguage} from '@/i18n/language-provider';
import {bookingRouteScheduleFields,routeScheduleParts,changeRouteScheduleDate,changeRouteScheduleTime} from '@/lib/booking-route-schedule';
import {changeBookingRouteMode} from '@/lib/booking-route-mode-change';
${cut('function bookingFieldOptions(', 'function BookingCargoWiseAmountField(')}
function App(){
  const initial={booking:{mode:'sea'},routes:[{id:'synthetic',mode:'sea',plannedDepartureAt:'2026-09-18T00:30:45.123456+05:30',plannedArrivalAt:'2026-10-18T10:00:00Z',routeData:{actualArrivalAt:'retained-history'}}],quoteSnapshot:{version:1}};
  if(new URLSearchParams(location.search).has('invalid')) initial.routes[0].plannedDepartureAt='2026-09-18T08:45:00';
  const [draftWorkspace,setDraftWorkspace]=useState(initial),[editable,setEditable]=useState(true);
  const loadedRecord={workspace:initial};
  ${cut('  function updateDraftRoute(', '  function selectDraftRouteOrganisation(')}
  return <><h1>Planned routing schedule QA</h1><Button onClick={()=>setEditable(v=>!v)}>{editable?'Read only':'Edit'}</Button>
    <BookingRouteScheduleFields route={draftWorkspace.routes[0]} editable={editable} onChange={(field,value)=>updateDraftRoute(0,field,value)}/>
    <details><summary>Inspect test state</summary><output id="receipt" className="break-all">{JSON.stringify(draftWorkspace)}</output></details></>;
}
createRoot(document.getElementById('root')).render(<main className="grid min-w-0 gap-4 p-4 [--md-field-label-width:110px]"><App/></main>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{name:'qa-language',setup(b){
  b.onResolve({filter:/i18n\/language-provider$/},()=>({path:'qa',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}`}))
}}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');const path=new URL(req.url,'http://localhost').pathname
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].text)}
  if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Schedule QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0,'127.0.0.1',()=>console.log('Schedule QA: http://127.0.0.1:'+server.address().port+' PID '+process.pid))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
