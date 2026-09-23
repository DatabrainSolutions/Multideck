import '../../../supabase/tests/register-typescript.mjs'
const { normalizeMileageRoute } = await import('../../../supabase/functions/_shared/mileage-route.ts')
const { calculateRoadRoute } = await import('../../../supabase/functions/_shared/mileage-provider.ts')
// Standalone local-only QA: real migration + disposable PostgreSQL, never hosted data.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { createMileageFixture } from '../../../supabase/tests/mileage-fixture.mjs'
const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const root = resolve(import.meta.dirname, '../..')
const directory = mkdtempSync(join(tmpdir(),'multideck-mileage-preview-'))
const run = (command,args,input) => spawnSync(join(bin,command),args,{input,encoding:'utf8'})
const ok = result => assert.equal(result.status,0,result.stderr)
const sql = input => run('psql',['-X','-At','-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input)
ok(run('initdb',['-D',join(directory,'data'),'-A','trust','-U','postgres','--no-locale','-E','UTF8']))
ok(run('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'pg.log'),'-o',`-k ${directory} -c listen_addresses=''`,'-w','start']))
ok(sql('create role anon;create role authenticated;create role service_role bypassrls;'))
createMileageFixture(sql,ok)
const server = await createServer({
 configFile:false,envFile:false,root,cacheDir:join(directory,'vite-cache'),
 plugins:[react(),tailwind(),{name:'mileage-fixture',configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(req.url?.split('?')[0]==='/') {req.url='/tests/mileage-preview/index.html';return next()}
   if(req.url!=='/__mileage_test') return next()
   res.setHeader('Content-Type','application/json')
   try {
    if(req.method!=='POST') throw new Error('POST required')
    let raw='';for await(const part of req){raw+=part;if(raw.length>100000) throw new Error('Too much input')}
    const {user,action,data}=JSON.parse(raw)
    if(!/^[1-6]$/.test(String(user))) throw new Error('Fixture user required')
    const quote = value => `'${String(value).replaceAll("'","''")}'`
    if(action==='__route') {
      const input=normalizeMileageRoute(data)
      const route=await calculateRoadRoute(input,{reserve:async()=>{}})
      const id=crypto.randomUUID()
      const result=sql(`insert into mileage_route_quotes(id,company_id,user_id,route_input,distance_miles,route_data) values (${quote(id)},'20000000-0000-0000-0000-000000000001',${quote('00000000-0000-0000-0000-'+String(user).padStart(12,'0'))},${quote(JSON.stringify(input.original))}::jsonb,${route.distance_miles},${quote(JSON.stringify(route.route_data))}::jsonb);`)
      ok(result);res.end(JSON.stringify({id,...route}));return
    }
    const result=sql(`set role authenticated;select login(${Number(user)});select multideck_mileage(${quote(action)},${quote(JSON.stringify(data))}::jsonb);`)
    if(result.status) throw new Error(result.stderr.match(/ERROR:\s+([^\n]+)/)?.[1] || 'Database request failed')
    res.end(result.stdout.trim().split('\n').at(-1))
   } catch(error) {res.statusCode=400;res.end(JSON.stringify({error:error.message}))}
 })}}],
 resolve:{dedupe:['react','react-dom'],alias:[{find:'@/lib/mileage-api',replacement:join(root,'tests/mileage-preview/api.ts')},{find:'@',replacement:join(root,'src')}]},
 define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},
 server:{host:'127.0.0.1',port:Number(process.env.MILEAGE_QA_PORT || 3001),strictPort:true},
})
await server.listen();console.log('Mileage QA: http://127.0.0.1:3001 (real disposable PostgreSQL)')
let closing=false
async function close(){if(closing)return;closing=true;await server.close();run('pg_ctl',['-D',join(directory,'data'),'-m','immediate','-w','stop']);rmSync(directory,{recursive:true,force:true});process.exit(0)}
process.on('SIGINT',close);process.on('SIGTERM',close)
