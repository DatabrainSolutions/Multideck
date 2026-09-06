// Actual equipment editor in an isolated synthetic fixture, never a tenant.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const [url,packagePath,screenshotPath]=process.argv.slice(2)
if(!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)||!packagePath||!screenshotPath)throw Error('Pass the isolated fixture URL, Playwright package directory and screenshot path')
const {chromium}=createRequire(import.meta.url)(packagePath)
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
  const page=await browser.newPage({viewport:{width:1280,height:960},reducedMotion:'reduce'})
  page.setDefaultTimeout(10000)
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
  const state=async()=>JSON.parse(await page.locator('#receipt').textContent())
  for(const [language,motion] of [['en-GB','reduce'],['en-US','reduce'],['en-GB','no-preference'],['en-US','no-preference']]) {
    await page.emulateMedia({reducedMotion:motion})
    await page.goto(url+'?language='+language)
    await page.getByRole('button',{name:'Add Container',exact:true}).waitFor()
    const original=await state()
    assert.equal(await page.locator('vite-error-overlay').count(),0)
    await page.getByLabel('QA mode').selectOption('road')
    for(let attempt=0;attempt<3;attempt++) {
      await page.getByRole('button',{name:'Add equipment',exact:true}).focus()
      await page.keyboard.press('Enter');await page.getByRole('menuitem',{name:'Vehicle',exact:true}).waitFor()
      await page.keyboard.press('Escape')
      await page.waitForFunction(()=>!document.querySelector('[role="menu"]'))
    }
    assert.deepEqual(await state(),original)
    for(const [mode,kind,label,numberLabel] of [['air','uld','ULD','ULD number'],['road','trailer','Trailer','Trailer number'],['rail','wagon','Wagon','Wagon number']]) {
      await page.getByLabel('QA mode').selectOption(mode)
      const prior=(await state()).containers.length
      const add=page.getByRole('button',{name:mode==='air'?'Add ULD':'Add equipment',exact:true})
      await add.focus();await page.keyboard.press('Enter')
      if(mode!=='air') {await page.getByRole('menuitem',{name:label,exact:true}).focus();await page.keyboard.press('Enter')}
      const row=page.locator('fieldset').nth(prior)
      await page.waitForFunction(label=>document.activeElement?.getAttribute('aria-label')===label,numberLabel).catch(async error=>{
        console.log({mode,state:await state(),focus:await page.evaluate(()=>document.activeElement?.outerHTML)})
        await page.screenshot({path:screenshotPath,fullPage:true});throw error
      })
      await row.getByRole('textbox',{name:numberLabel,exact:true}).fill('SYNTHETIC-'+kind)
      await row.getByRole('combobox',{name:label+' type',exact:true}).fill('CUSTOM-'+kind)
      await page.keyboard.press('Tab')
      assert.equal((await state()).containers[prior].type,'CUSTOM-'+kind)
      assert.equal((await state()).containers[prior].equipmentKind,kind)
      await row.locator('summary').click()
      assert.ok(!(await row.innerText()).includes('VGM method'))
      // Confirmation defaults to the safe action; cancel/Escape does not mutate.
      await row.getByRole('button',{name:`Remove ${label} ${prior+1}`,exact:true}).click()
      await page.waitForFunction(()=>document.activeElement?.textContent==='Keep equipment')
      await page.keyboard.press('Escape')
      await page.waitForFunction(name=>document.activeElement?.getAttribute('aria-label')===name,`Remove ${label} ${prior+1}`)
      assert.equal((await state()).containers.length,prior+1)
      if(mode==='road') {
        await row.getByRole('button',{name:`Change equipment kind ${prior+1}: Trailer`,exact:true}).click()
        await page.getByRole('menuitem',{name:'Vehicle',exact:true}).click()
        await page.waitForFunction(()=>document.activeElement?.textContent==='Keep current kind')
        await page.keyboard.press('Escape')
        assert.equal((await state()).containers[prior].equipmentKind,'trailer')
        await row.getByRole('button',{name:`Change equipment kind ${prior+1}: Trailer`,exact:true}).click()
        await page.getByRole('menuitem',{name:'Vehicle',exact:true}).click()
        await page.getByRole('button',{name:'Change kind and review',exact:true}).click()
        await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'))
        assert.equal((await state()).containers[prior].equipmentKind,'vehicle')
        assert.equal((await state()).containers[prior].number,'SYNTHETIC-trailer')
        assert.equal((await state()).containers[prior].type,'CUSTOM-trailer')
        assert.match(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')??''),/Change equipment kind/)
      }
    }
    await page.getByLabel('QA mode').selectOption('multimodal')
    await page.getByRole('button',{name:'Add equipment',exact:true}).click()
    assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Container','ULD','Vehicle','Trailer','Wagon'])
    await page.keyboard.press('Escape')
    const before=await state()
    assert.deepEqual(before.containers.slice(0,2),original.containers)
    assert.deepEqual(before.quoteSnapshot,original.quoteSnapshot)
    await page.locator('fieldset').last().getByRole('button',{name:'Remove Wagon 5',exact:true}).click()
    await page.getByRole('button',{name:'Remove equipment',exact:true}).click()
    await page.waitForFunction(()=>document.querySelectorAll('fieldset').length===4)
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'))
    await page.waitForFunction(()=>document.activeElement?.textContent==='Add equipment')
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Add equipment')
    await page.getByRole('button',{name:'View read-only',exact:true}).click()
    assert.equal(await page.locator('fieldset input:not(:disabled)').count(),0)
    assert.equal(await page.locator('fieldset button:not(:disabled)').count(),0)
    for(const width of [320,768,1280]) {
      await page.setViewportSize({width,height:960})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)
    }
    await page.evaluate(()=>{document.body.style.zoom='2'})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1280)
    await page.evaluate(()=>{document.body.style.zoom='1'})
    console.log(language+' / '+motion+': mode-specific add, custom types, confirmation/cancel/focus, repeated menus, retained history, mixed modes, read-only and reflow passed')
  }
  assert.deepEqual(errors,[])
  await page.getByRole('button',{name:'Edit draft',exact:true}).click()
  await page.screenshot({path:screenshotPath,fullPage:true})
  console.log('No browser errors. Screenshot: '+screenshotPath)
} finally {await browser.close()}
