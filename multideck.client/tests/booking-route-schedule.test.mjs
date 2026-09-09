import assert from 'node:assert/strict'
import test from 'node:test'
import { routeScheduleParts, changeRouteScheduleDate, changeRouteScheduleTime } from '../src/lib/booking-route-schedule.ts'

test('schedule is explicitly UTC and retains sub-second evidence across date edits',()=>{
  const source='2026-09-18T00:30:45.123456+05:30'
  assert.deepEqual(routeScheduleParts(source),{date:'2026-09-17',time:'19:00:45',timestamp:'2026-09-17T19:00:45.123456Z',invalid:false})
  assert.equal(changeRouteScheduleDate(source,'2026-09-20'),'2026-09-20T19:00:45.123456Z')
  assert.equal(changeRouteScheduleTime(source,'19:00:45'),source)
  assert.equal(changeRouteScheduleTime(source,'20:15'),'2026-09-17T20:15:00Z')
  assert.equal(changeRouteScheduleDate('2026-10-25T01:30:00+01:00','2026-10-26'),'2026-10-26T00:30:00Z')
})
test('blank/date-only schedules never acquire an assumed local time',()=>{
  assert.equal(routeScheduleParts(null).date,'')
  assert.equal(changeRouteScheduleDate(null,'2026-09-18'),'2026-09-18')
  assert.equal(changeRouteScheduleTime('2026-09-18','08:45'),'2026-09-18T08:45:00Z')
  assert.equal(changeRouteScheduleTime('2026-09-18T08:45:00Z',''),'2026-09-18')
  assert.equal(changeRouteScheduleDate('2026-09-18T08:45:00Z',''),'')
  assert.throws(()=>changeRouteScheduleTime(null,'08:45'),/Choose a planned date/)
})
test('invalid saved evidence is visible for review, not silently interpreted or overwritten',()=>{
  for(const source of ['bad','2026-02-30','2026-02-30T10:00:00Z','2026-09-18T24:00:00Z','2026-09-18T08:45:00']) {
    assert.equal(routeScheduleParts(source).invalid,true,source)
    assert.equal(routeScheduleParts(source).timestamp,source)
    assert.throws(()=>changeRouteScheduleDate(source,'2026-09-20'),/Review the saved timestamp/)
    assert.equal(changeRouteScheduleDate(source,''),'')
  }
  assert.throws(()=>changeRouteScheduleDate(null,'2026-02-30'),/valid planned date/)
  for(const time of ['25:00','12:99','10:00:60','local time']) assert.throws(()=>changeRouteScheduleTime('2026-09-18',time),/valid UTC time/)
})
