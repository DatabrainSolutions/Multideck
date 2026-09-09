// Real queue component, hooks, timers, motion and readiness observer in Chrome.
// Realtime transport, notification persistence and page loading are explicit
// synthetic boundaries. This never connects to a tenant or sends an email.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url)
const packagePath=process.argv[2]
assert.ok(packagePath,'Pass the installed Playwright package path')
const {chromium}=require(packagePath)
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(client+'package.json')('esbuild')
const source=readFileSync(client+'src/components/multideck/app-shell.tsx','utf8')
const queue=source.slice(source.indexOf('async function retryNotificationAction('),source.indexOf('function readWarehouseItemsScrollTop('))
assert.ok(queue.includes('function CustomerResponseNotificationQueue'))
const built=await build({stdin:{resolveDir:client,loader:'tsx',contents:`
  import React,{useState,useRef,useEffect,useLayoutEffect,useCallback} from 'react';import{createRoot}from'react-dom/client';
  import{AnimatePresence,motion,useReducedMotion}from'motion/react';
  import{ArrowRight,CheckCircle2,PencilEdit01,TriangleAlert,X,XCircle}from'@/components/icons/hugeicons';
  import{Button}from'@/components/ui/button';import{cn}from'@/lib/utils';
  import{quoteWorkspaceRoute,waitForQuoteWorkspace}from'@/lib/quote-workspace-readiness';
  const useLanguage=()=>({t:value=>value});
  window.receipts=[];window.channels=[];window.failActions=false;
  const write=async(kind,id)=>{window.receipts.push({kind,id,at:Date.now()});if(window.failActions)throw Error('Synthetic offline failure');};
  const dismissWorkspaceNotification=id=>write('dismiss',id),markWorkspaceNotificationRead=id=>write('read',id);
  const workspaceNotificationFromRow=row=>row;
  const supabase={channel(){const channel={on(_,__,callback){this.emit=callback;return this},subscribe(callback){this.status=callback;callback('SUBSCRIBED');return this}};window.channels.push(channel);return channel},removeChannel(channel){channel.status('CLOSED')}};
  ${queue}
  function Harness(){const[user,setUser]=useState('operator-a'),[route,setRoute]=useState('/'),[state,setState]=useState('loading');
    window.emit=(row,index=window.channels.length-1)=>window.channels[index].emit({new:row});
    window.ready=()=>setState('ready');window.failLoad=()=>setState('error');window.switchUser=()=>setUser('operator-b');
    return <><main data-quote-workspace-route={quoteWorkspaceRoute(route)??undefined} data-quote-workspace-state={state}><h1>Synthetic Quote workspace</h1><p>{state}</p></main>
      <CustomerResponseNotificationQueue key={user} currentUser={{id:user,internalUserId:user}} route={route} navigate={path=>{setRoute(path);setState('loading')}}/></>;
  }createRoot(document.getElementById('root')).render(<Harness/>);
`},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':client+'src'}})
const css=readFileSync(client+'dist/assets/multideck-app.css')
const server=createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text)}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css)}
  else {res.setHeader('Content-Type','text/html');res.end('<html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url='http://127.0.0.1:'+server.address().port+'/'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 for(const locale of ['en-GB','en-US']){
  const context=await browser.newContext({locale,reducedMotion:'reduce',viewport:{width:1280,height:960}})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort())
  await page.clock.install()
  await page.goto(url);await page.waitForFunction(()=>window.emit&&window.channels.length===1)
  const emit=async(id,seconds=1,user='operator-a')=>page.evaluate(({id,seconds,user})=>window.emit({id,title:'Quote '+id,body:'Synthetic customer response',status:'unread',createdAt:'2026-09-06T12:00:'+String(seconds).padStart(2,'0')+'Z',CommNotif_UserID:user,metadata:{event_type:'quote_response',decision:'accepted',action_url:'/quotes/JQTEST'}}),{id,seconds,user})
  const tick=async(ms)=>{await page.clock.runFor(ms);await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,0)))}
  const popup=page.getByRole('region',{name:'Customer quote response'})
  await emit('first',3);await popup.waitFor();await emit('late-older',1);await emit('third',2);await emit('first',3)
  assert.match(await popup.textContent(),/Quote first/)
  await tick(5_000);assert.match(await popup.textContent(),/Quote first/)
  await tick(700);assert.match(await popup.textContent(),/Quote late-older/)
  assert.deepEqual(await page.evaluate(()=>window.receipts),[],'Timeout must not mark read/dismissed')
  await popup.getByRole('button',{name:/Open quote/}).focus();await page.keyboard.press('Enter')
  await tick(6_000);assert.match(await popup.textContent(),/Quote late-older/,'Loading page must hold the queue')
  await page.evaluate(()=>window.failLoad());await tick(100)
  assert.match(await popup.textContent(),/has not finished loading/)
  await page.evaluate(()=>window.ready());await tick(200)
  assert.match(await popup.textContent(),/Quote third/)
  await page.evaluate(()=>{window.failActions=true})
  await popup.getByRole('button',{name:'Dismiss notification'}).click();await tick(2_300)
  assert.equal(await popup.count(),0)
  assert.equal((await page.evaluate(()=>window.receipts.filter(x=>x.kind==='dismiss'))).length,3)
  await emit('old-user',4);await popup.waitFor();await page.evaluate(()=>window.switchUser());await tick(100)
  assert.equal(await popup.count(),0)
  await page.evaluate(()=>window.channels[0].emit({new:{id:'stale',CommNotif_UserID:'operator-a',status:'unread',metadata:{event_type:'quote_response'}}}))
  await tick(100);assert.equal(await popup.count(),0)
  await emit('current-user',5,'operator-b');await popup.waitFor()
  for(const width of [320,768,1280]){await page.setViewportSize({width,height:960});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)}
  if(locale==='en-GB')await page.screenshot({path:'/tmp/multideck-quote-response-queue.png',fullPage:true})
  assert.deepEqual(errors,[])
  console.log(locale+': timer, non-preempting FIFO, deduplication, delayed/error/ready navigation, keyboard, three retries, account isolation and responsive checks passed')
  await context.close()
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
