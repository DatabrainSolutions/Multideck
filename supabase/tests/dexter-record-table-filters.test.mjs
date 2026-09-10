import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/agent-dexter/record-tables.ts',import.meta.url),'utf8'))
const {createRecordTable}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
test('active booking examples exclude drafts and closed jobs while retaining open jobs with tracking exceptions',()=>{
 const rows=[{recordId:'open',bookingReference:'Open',jobStatus:'open',status:'Exception'},
 {recordId:'booked',bookingReference:'Booked',jobStatus:'booked',status:'Booked'},
 {recordId:'draft',bookingReference:'Draft',jobStatus:'draft',status:'Draft'},
 {recordId:'closed',bookingReference:'Closed',jobStatus:'open',status:'Closed'},
 {recordId:'unknown',bookingReference:'Missing status'}]
 const records=new Map([['bookings',new Map(rows.map(row=>[row.recordId,row]))]])
 const args={domain:'bookings',title:'Active jobs',fields:['status'],filters:[{field:'jobStatus',operator:'in',values:['open','booked']},{field:'status',operator:'not_in',values:['Closed']}]}
 assert.equal(createRecordTable({...args,record_ids:['open','booked']},records).table.rows.length,2)
 for(const id of ['draft','closed','unknown'])assert.match(createRecordTable({...args,record_ids:['open',id]},records).error,/do not match/)
 assert.match(createRecordTable({...args,record_ids:['open'],filters:[{field:'privateColumn',operator:'in',values:['secret']}]},records).error,/available/)
 assert.equal(createRecordTable({...args,record_ids:['draft'],filters:null},records).table.rows[0].id,'draft')
})
