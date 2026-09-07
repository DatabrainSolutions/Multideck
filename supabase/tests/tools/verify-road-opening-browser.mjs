// Real pages and native controls; explicitly synthetic transport, no tenant I/O.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
const [packagePath,screenshotPath]=process.argv.slice(2)
assert.ok(packagePath&&screenshotPath,'Pass Playwright directory and screenshot path')
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(`${client}package.json`)('esbuild')
const built=await build({stdin:{contents:`
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {DomesticRoadBookingPage} from '@/pages/domestic-road-booking-page';
  function Harness(){const [left,setLeft]=useState(false);return left?<p>Fixture left</p>:<>
    <button onClick={()=>setLeft(true)}>Leave fixture</button>
    <DomesticRoadBookingPage roadJobId={new URLSearchParams(location.search).get('case')==='legacy'?'RD-91134':undefined}
      navigate={path=>{window.qa.destinations.push(path);setLeft(true)}}/>
  </>}
  createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{name:'isolated-boundaries',setup(b){
  b.onResolve({filter:/i18n\/language-provider$/},()=>({path:'language',namespace:'qa'}))
  b.onResolve({filter:/lib\/workspace-environment$/},()=>({path:'environment',namespace:'qa'}))
  b.onResolve({filter:/lib\/booking-workflow-api$/},()=>({path:'api',namespace:'qa'}))
  b.onLoad({filter:/.*/,namespace:'qa'},({path})=>({contents:path==='environment'
    ? `export const workspaceStorageKey=key=>'isolated:'+key;`
    :path==='language'?`export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')||'en-GB',t:value=>value}}`
    :`window.qa={requests:[],destinations:[],resolve:null};
      export function openBookingWorkflow(key,mode){window.qa.requests.push({key,mode});
        const scenario=new URLSearchParams(location.search).get('case');
        if(scenario==='retry'&&window.qa.requests.length===1)return Promise.reject(Error('Synthetic permission or service failure'));
        if(scenario==='delayed')return new Promise(resolve=>window.qa.resolve=()=>resolve({bookingReference:'JD-QA-ONLY'}));
        return Promise.resolve({bookingReference:'JD-QA-ONLY'});
      }`}))
}}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname
  res.setHeader('Cache-Control','no-store')
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].text)}
  if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}/`
const {chromium}=createRequire(import.meta.url)(packagePath)
let browser
try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
  for(const language of ['en-GB','en-US']){
    const context=await browser.newContext({locale:language,reducedMotion:'reduce',viewport:{width:1280,height:900}})
    const page=await context.newPage(),errors=[],external=[]
    page.setDefaultTimeout(10000)
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
    await page.route('**/*',route=>{if(!route.request().url().startsWith(url)){external.push(route.request().url());return route.abort()}return route.continue()})
    await page.goto(url+'?case=legacy&language='+language)
    await page.getByRole('heading',{name:'Open this job from Road control'}).waitFor()
    assert.equal(await page.evaluate(()=>window.qa.requests.length),0)
    for(const width of [320,768,1280]){
      await page.setViewportSize({width,height:900})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)
    }
    await page.getByRole('button',{name:'Return to Road control',exact:true}).focus()
    await page.keyboard.press('Enter')
    await page.getByText('Fixture left',{exact:true}).waitFor()
    assert.deepEqual(await page.evaluate(()=>window.qa.destinations),['/road-control'])
    await page.goto(url+'?case=retry&language='+language)
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('alert').textContent(),'Synthetic permission or service failure')
    await page.setViewportSize({width:320,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320)
    if(language==='en-GB')await page.screenshot({path:screenshotPath,fullPage:true})
    await page.getByRole('button',{name:'Try again',exact:true}).focus();await page.keyboard.press('Enter')
    await page.getByText('Fixture left',{exact:true}).waitFor()
    const retry=await page.evaluate(()=>window.qa)
    assert.equal(retry.requests.length,2);assert.equal(retry.requests[0].key,retry.requests[1].key)
    assert.equal(retry.requests[1].mode,'road');assert.deepEqual(retry.destinations,['/bookings/jd-qa-only'])
    await page.goto(url+'?case=delayed&language='+language)
    await page.getByText('Opening a new booking...',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Leave fixture',exact:true}).click()
    await page.getByText('Fixture left',{exact:true}).waitFor()
    await page.evaluate(async()=>{window.qa.resolve();await new Promise(resolve=>setTimeout(resolve,0))})
    assert.deepEqual(await page.evaluate(()=>window.qa.destinations),[])
    assert.equal(await page.evaluate(()=>window.qa.requests.length),1)
    assert.deepEqual(errors,[]);assert.deepEqual(external,[])
    console.log(language+': actual pages, keyboard retry/recovery, reflow, Strict Mode and cancelled navigation passed; no tenant requests')
    await context.close()
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
