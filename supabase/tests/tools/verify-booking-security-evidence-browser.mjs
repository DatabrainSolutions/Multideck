// Actual component and existing gallery preview, isolated from tenant services.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
const [packagePath,screenshotPath]=process.argv.slice(2)
assert.ok(packagePath&&screenshotPath,'Pass Playwright package directory and screenshot path')
const client=fileURLToPath(new URL('../../../multideck.client/',import.meta.url))
const {build}=createRequire(`${client}package.json`)('esbuild')
const source=readFileSync(`${client}src/pages/components-gallery-page.tsx`,'utf8')
const start=source.indexOf('export function BookingSecurityEvidencePreview()'),end=source.indexOf('export function BookingDangerousGoodsPreview()',start)
assert.ok(start>=0&&end>start)
const built=await build({stdin:{contents:`
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {Button} from '@/components/ui/button';
  import {BookingSecurityEvidenceEditor} from '@/components/multideck/booking-security-evidence';
  ${source.slice(start,end)}
  createRoot(document.getElementById('root')).render(<main className="min-w-0 p-4 text-[13px]"><BookingSecurityEvidencePreview/></main>);
`,loader:'tsx',resolveDir:client},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':`${client}src`},plugins:[{name:'isolated-boundaries',setup(b){
  b.onResolve({filter:/i18n\/language-provider$/},()=>({path:'language',namespace:'qa'}))
  b.onResolve({filter:/lib\/booking-workflow-api$/},()=>({path:'api',namespace:'qa'}))
  b.onLoad({filter:/.*/,namespace:'qa'},({path})=>({contents:path==='api'
    ? `export async function saveBookingSecurityEvidence(){throw Error('Tenant API must never run in this fixture')}`
    : `export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',t:value=>value}}`}))
}}]})
const css=readFileSync(`${client}dist/assets/multideck-app.css`)
const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store')
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(built.outputFiles[0].text)}
  if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Screening isolated QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}/`
const {chromium}=createRequire(import.meta.url)(packagePath)
let browser
try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
  for(const language of ['en-GB','en-US'])for(const motion of ['reduce','no-preference']){
    const context=await browser.newContext({locale:language,reducedMotion:motion,viewport:{width:1280,height:900}})
    const page=await context.newPage(),errors=[],external=[]
    page.setDefaultTimeout(10000)
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
    await page.route('**/*',route=>{if(!route.request().url().startsWith(url)){external.push(route.request().url());return route.abort()}return route.continue()})
    await page.goto(url+'?language='+language)
    const open=page.getByRole('button',{name:'Record screening evidence',exact:true})
    await open.focus();await page.keyboard.press('Enter')
    const dialog=page.getByRole('dialog'),un=page.getByRole('textbox',{name:'Security status as supplied',exact:true})
    await un.waitFor()
    await page.waitForFunction(()=>document.activeElement?.getAttribute('name')==='securityStatus')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Close')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('name')),'securityStatus')
    for(const width of [320,768,1280]){
      await page.setViewportSize({width,height:900})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)
      assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true)
      const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1)
      await page.getByRole('button',{name:'Save evidence',exact:true}).focus()
      const saveBox=await page.getByRole('button',{name:'Save evidence',exact:true}).boundingBox()
      assert.ok(saveBox.y>=0&&saveBox.y+saveBox.height<=900,'Save remains reachable')
      if(width===320&&language==='en-GB'&&motion==='reduce')await page.screenshot({path:screenshotPath,fullPage:true})
    }
    await page.evaluate(()=>{document.body.style.zoom='2'})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1280)
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true)
    await page.evaluate(()=>{document.body.style.zoom='1'})
    if(motion==='reduce'){
      // The existing app-wide reduced-motion policy uses a single 1ms cycle
      // so animation-end consumers still resolve; it does not remove names.
      const animation=await dialog.evaluate(el=>({name:getComputedStyle(el).animationName,duration:getComputedStyle(el).animationDuration,
        iterations:getComputedStyle(el).animationIterationCount,transition:getComputedStyle(el).transitionDuration}))
      assert.ok(animation.name==='none'||(animation.duration.split(',').every(value=>parseFloat(value)<=0.001)
        &&animation.iterations.split(',').every(value=>Number(value)===1)),JSON.stringify(animation))
      assert.ok(animation.transition.split(',').every(value=>parseFloat(value)<=0.001),JSON.stringify(animation))
    }
    await un.fill(' Supplied status ')
    await page.getByRole('textbox',{name:'Source reference · Required',exact:true}).fill('Synthetic source only')
    await page.getByRole('textbox',{name:'Reason · Required',exact:true}).fill('Browser verification')
    await page.locator('input[name="screenedAt"]').fill('2026-09-07T10:30:45.123')
    await page.getByRole('button',{name:'Save evidence',exact:true}).click()
    await dialog.waitFor({state:'hidden'}).catch(async error=>{console.error(await dialog.innerText());throw error})
    await page.waitForFunction(()=>document.activeElement?.textContent==='Record screening evidence')
    assert.equal(await page.getByText('Supplied status',{exact:true}).count()>0,true)
    await page.getByRole('button',{name:/Correct screening evidence:/}).click()
    assert.equal(await page.locator('input[name="screenedAt"]').inputValue(),'2026-09-07T10:30:45.123')
    assert.equal(await page.getByRole('textbox',{name:'Security status as supplied',exact:true}).inputValue(),' Supplied status ')
    await page.getByRole('button',{name:'Cancel',exact:true}).click()
    await page.getByRole('button',{name:'Preview read-only',exact:true}).click()
    assert.equal(await open.isDisabled(),true)
    assert.deepEqual(errors,[]);assert.deepEqual(external,[])
    console.log(`${language} / ${motion}: focus loop, 320/768/1280 reflow, 200% zoom, reachable save, synthetic save, read-only and no external requests passed`)
    await context.close()
  }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
