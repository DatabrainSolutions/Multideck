// Isolated production container editor and updater; no tenant/provider calls.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { cut, containerComponentSource, containerMutationSource } from '../booking-container-client-fixture.mjs'
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(`${client}package.json`)('esbuild')
const built=await build({stdin:{contents:`
  import React,{useState,useId,useRef,useEffect} from 'react';import {createRoot} from 'react-dom/client';
  import {Button} from '@/components/ui/button';import {Input} from '@/components/ui/input';
  import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
  import {CompactCombobox} from '@/components/multideck/quote-details/quote-detail-fields';
  import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
  import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
  import {bookingEquipmentKindChoices,bookingEquipmentPresentation,newBookingEquipment} from '@/lib/booking-equipment-policy';
  import {Plus,Trash2,Container,ChevronDown} from '@/components/icons/hugeicons';import {cn} from '@/lib/utils';
  import {useLanguage} from '@/i18n/language-provider';
  ${cut('const bookingEquipmentOptionsByMode:', 'function bookingTabSlug(')}
  ${cut('function bookingModeKey(', 'function bookingModeOptionValue(')}
  ${cut('function asRecord(', 'function recordText(')}
  ${cut('function bookingFieldOptions(', 'function BookingCargoWiseAmountField(')}
  ${cut('function BookingCargoWiseGroup(', 'function chartPointPath(')}
  ${containerComponentSource}
  function App(){
    const [editable,setEditable]=useState(true),[seaService,setSeaService]=useState(true);
    const [mode,setMode]=useState('sea');
    const [draftWorkspace,setDraftWorkspace]=useState({containers:[
      {id:'one',number:'SYNTHETIC-1',type:'40RF',grossWeightKg:'20000.123456',tareWeightKg:'4000.123456',verifiedGrossMassKg:null,reeferSetPoint:'-18.125',reeferUnit:'C',data:{packages:'450',packageType:'Cartons',volumeCbm:'30',sealNumber:'SEAL-1'}},
      {id:'two',number:'SYNTHETIC-2',type:'20GP',data:{}}],quoteSnapshot:{version:1}});
    ${containerMutationSource}
    return <><h1>Container operations QA</h1><div className="flex flex-wrap gap-2">
      <Button onClick={()=>setEditable(v=>!v)}>{editable?'View read-only':'Edit draft'}</Button>
      <label>QA mode<select aria-label="QA mode" value={mode} onChange={event=>setMode(event.target.value)}>{['sea','air','road','rail','multimodal'].map(value=><option key={value}>{value}</option>)}</select></label>
      <Button onClick={()=>setSeaService(v=>!v)}>{seaService?'Use Rail':'Use Sea'}</Button></div>
      <BookingContainerDetails containers={draftWorkspace.containers} mode={mode} equipmentKinds={bookingEquipmentKindChoices({mode,shipmentType:'FCL',stage:'booking',legModes:mode==='multimodal'?['air','road','rail']:[],hasContainers:mode==='rail'})} editable={editable} seaService={seaService && (mode==='sea'||mode==='multimodal')}
        onChange={updateDraftContainer} onAdd={kind=>setDraftWorkspace(v=>({...v,containers:[...v.containers,newBookingEquipment(kind)]}))}
        onRemove={index=>setDraftWorkspace(v=>({...v,containers:v.containers.filter((_,i)=>i!==index)}))}/>
      <details><summary>Inspect test state</summary><output id="receipt" className="block break-words">{JSON.stringify(draftWorkspace)}</output></details></>;
  }
  createRoot(document.getElementById('root')).render(<main className="grid grid-cols-1 gap-4 p-4 text-[13px]"><App/></main>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{name:'qa-language',setup(b){
  b.onResolve({filter:/i18n\/language-provider$/},()=>({path:'qa',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}`}))
}}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].text)}
  if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Container operations QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0,'127.0.0.1',()=>console.log('Container QA: http://127.0.0.1:'+server.address().port+' PID '+process.pid))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
