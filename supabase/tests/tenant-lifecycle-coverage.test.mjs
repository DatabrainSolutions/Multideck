import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync,existsSync} from 'node:fs'

test('every operational deployment entrypoint registers through the lifecycle boundary',()=>{
  const root=new URL('../functions/',import.meta.url)
  let guarded=0
  for(const entry of readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.name.startsWith('_'))continue
    const path=new URL(`${entry.name}/index.ts`,root)
    if(!existsSync(path))continue
    const source=readFileSync(path,'utf8')
    if(entry.name==='multideck-cloud-product'){
      assert.match(source,/validProductAuthentication/)
      continue
    }
    assert.match(source,/import \{ serveTenant \} from ["']\.\.\/_shared\/tenant-lifecycle\.ts["']/ ,entry.name)
    assert.match(source,/serveTenant\(/,entry.name)
    assert.doesNotMatch(source,/Deno\.serve\(/,entry.name)
    guarded++
  }
  assert.ok(guarded>=59,'Operational functions cannot disappear from this security inventory')
})
