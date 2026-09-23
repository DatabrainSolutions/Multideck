import './register-typescript.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
const { normalizeMileageRoute, normalizePostcode, decodePolyline } = await import('../functions/_shared/mileage-route.ts')

test('route normalization preserves reviewed inputs and handles UK postcodes', () => {
 const route=normalizeMileageRoute({origin:' wf105yl ',destination:'LS11UR',waypoints:['London office'],round_trip:true,vehicle_type:'car'})
 assert.equal(route.origin,'WF10 5YL');assert.equal(route.destination,'LS1 1UR');assert.equal(route.original.origin,'wf105yl')
 assert.equal(normalizePostcode('14 Business Park'),'14 Business Park')
 for(const waypoints of [null,{},Array(11).fill('Leeds'),[''],[false]]) assert.throws(()=>normalizeMileageRoute({...route.original,waypoints}))
 assert.throws(()=>normalizeMileageRoute({...route.original,round_trip:'yes'}))
})
test('encoded route decoding yields usable coordinates and rejects truncated data', () => {
 assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'),[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]])
 assert.throws(()=>decodePolyline('_p~iF~ps|'))
})

const { mileageStops, readOsrmRoute } = await import('../functions/_shared/mileage-provider.ts')
test('return routing appends origin once after all visited locations', () => {
 assert.deepEqual(mileageStops({origin:'Office',waypoints:['First customer','Second customer'],destination:'Last customer',round_trip:true}),['Office','First customer','Second customer','Last customer','Office'])
 assert.deepEqual(mileageStops({origin:'Office',waypoints:['Customer'],destination:'Hotel',round_trip:false}),['Office','Customer','Hotel'])
})
test('routing uses road distance and rejects invalid provider geometry', () => {
 const route={code:'Ok',routes:[{distance:16093.44,duration:900,geometry:{coordinates:[[-1,53],[-1.1,53.1]]}}]}
 assert.equal(readOsrmRoute(route).distance_miles,10)
 assert.deepEqual(readOsrmRoute(route).route_data.points,[[53,-1],[53.1,-1.1]])
 assert.throws(()=>readOsrmRoute({...route,code:'NoRoute'}))
 assert.throws(()=>readOsrmRoute({...route,routes:[{...route.routes[0],distance:-1}]}))
 assert.throws(()=>readOsrmRoute({...route,routes:[{...route.routes[0],geometry:{coordinates:[[NaN,0],[1,2]]}}]}))
})
