// Isolated visual/interaction fixture: real review panel and shared primitives,
// synthetic version data and delivery callbacks. Never connects to Supabase.
// Run the client build first for current product CSS, then run this with Node.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const client = fileURLToPath(new URL('../../../multideck.client/', import.meta.url))
const require = createRequire(`${client}package.json`)
const { build } = require('esbuild')
const source = readFileSync(`${client}src/components/multideck/booking-components.tsx`, 'utf8')
const start = source.indexOf('function bookingQuoteSyncValue(')
const end = source.indexOf('function BookingDetailTabPage(', start)
assert.ok(start > 0 && end > start)
const parentCallback = source.match(/onApply=\{(\(fields, confirmModeChange\) => void applyQuoteSyncFields\(fields, confirmModeChange\))\}/)?.[1]
assert.ok(parentCallback, 'The parent must forward explicit mode confirmation')
const built = await build({
  stdin: { contents: `
    import React, {useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
    import {Button} from '@/components/ui/button';import {Checkbox} from '@/components/ui/checkbox';
    import {Dialog,DialogClose,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
    import {ArrowRight,Check,TriangleAlert} from '@/components/icons/hugeicons';
    import {StatusPill} from '@/components/multideck/status-pill';import {Surface} from '@/components/multideck/surface';
    import {cn} from '@/lib/utils';import {useLanguage} from '@/i18n/language-provider';
    ${source.slice(start,end)}
    const cargoKey='cargo:00000000-0000-4000-8000-000000000001:grossWeightKg';
    const initial={reviewId:'synthetic-review',reviewToken:'a'.repeat(64),jobId:'synthetic-booking',quoteId:'synthetic-quote',quoteReference:'QA-QUOTE',
      appliedVersionNumber:1,proposedVersionNumber:2,status:'pending',appliedFields:[],differences:[
      {key:cargoKey,label:'Gross weight (kg)',cargoDescription:'Machinery crates — long goods description preserved for operational review',section:'Cargo',bookingValue:110,newQuoteValue:125,previousQuoteValue:100,conflict:true,requiresConfirmation:true,recommendation:'review'},
      {key:'mode',label:'Mode',section:'Job data',bookingValue:'Sea',newQuoteValue:'Air',conflict:false,requiresConfirmation:true,recommendation:'review',warningCode:'mode_change'},
      {key:'cargo',label:'Shipment goods value',section:'Goods',bookingValue:6000,newQuoteValue:6500,blockedReason:'Shipment goods value and cargo allocations need a separate review before applying this change.',requiresConfirmation:true,recommendation:'review'}]};
    function Harness(){const [review,setReview]=useState(initial);const [selected,setSelected]=useState(new Set());const [error,setError]=useState(null);
      const [busy,setBusy]=useState(false);const [refreshing,setRefreshing]=useState(false);const [receipt,setReceipt]=useState(null);
      function applyQuoteSyncFields(fields,confirmed){setBusy(true);setTimeout(()=>{setBusy(false);
        if(review.reviewToken===initial.reviewToken){setError('The Booking or quote review changed. Refresh the review and check your selections before applying.');return;}
        setReceipt({fields,confirmed,reviewToken:review.reviewToken});setReview({...review,status:'partially_applied',appliedFields:fields});setSelected(new Set());
      },350);}
      return <main className="p-4"><h1 className="mb-4 text-[18px]">Quote review QA — synthetic data, no live writes</h1>
        <BookingQuoteSyncReviewPanel busy={busy} refreshing={refreshing} detailsDirty={false} expanded error={error} review={review} selectedFields={selected}
          onApply={${parentCallback}} onOpenDetails={()=>{}}
          onToggle={(key,checked)=>setSelected(current=>{const next=new Set(current);checked?next.add(key):next.delete(key);return next;})}
          onRefresh={()=>{setRefreshing(true);setTimeout(()=>{setReview({...review,reviewToken:'b'.repeat(64)});setError(null);setSelected(new Set());setRefreshing(false);},350);}} />
        <output id="receipt" className="mt-4 block break-words text-[12px]" aria-live="polite">{receipt?JSON.stringify(receipt):'No fixture update applied'}</output>
      </main>;
    }createRoot(document.getElementById('root')).render(<Harness/>);
  `, loader: 'tsx', resolveDir: client },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', alias: { '@': `${client}src` },
  plugins: [{ name: 'isolated-english-provider', setup(builder) {
    builder.onResolve({ filter: /i18n\/language-provider$/ }, () => ({ path: 'qa-language', namespace: 'qa' }))
    builder.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}` }))
  } }],
})
const css = readFileSync(`${client}dist/assets/multideck-app.css`)
const server = createServer((request,response)=>{
  const path = new URL(request.url,'http://localhost').pathname
  response.setHeader('Cache-Control','no-store')
  if(path==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(built.outputFiles[0].text);return}
  if(path==='/style.css'){response.setHeader('Content-Type','text/css');response.end(css);return}
  response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote review isolated QA</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0,'127.0.0.1',()=>console.log(`Quote review QA: http://127.0.0.1:${server.address().port}`))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
