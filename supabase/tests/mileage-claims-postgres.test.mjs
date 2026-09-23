import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withProductPostgres } from './local-product-postgres.mjs'

import { createMileageFixture } from './mileage-fixture.mjs'

test('mileage lifecycle, real role permissions, personal privacy, CRM visits and payment boundaries', () => withProductPostgres((sql, ok) => {
 createMileageFixture(sql,ok)
 ok(sql(`
 set role authenticated;
 select login(1);
 select test_assert((multideck_mileage('save',(select data from fixture_trip))->>'version')::int=1,'draft saved and returned');
 select test_assert((multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->'trip'->>'amount')::numeric=22,'2026 rate');
 select test_assert(multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->'trip'->>'company_name'='Customer','linked company name is stored from CRM');
 select denied('pay','{"id":"60000000-0000-0000-0000-000000000001","version":1,"reference":"forged"}');
 select denied('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002","account_id":"50000000-0000-0000-0000-000000000002"}');
 select test_assert(multideck_mileage('submit','{"id":"60000000-0000-0000-0000-000000000001","version":1}')->>'status'='ready','approval off routes to finance');
 select denied('submit','{"id":"60000000-0000-0000-0000-000000000001","version":1}');
 select login(2);
 select denied('detail','{"id":"60000000-0000-0000-0000-000000000001"}');
 select test_assert(jsonb_array_length(multideck_mileage('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}'))=1,'colleague can read shared company visit');
 select test_assert(not (multideck_mileage('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}')->0 ? 'amount'),'visit projection hides claim finances');
 select test_assert(not (multideck_mileage('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}')->0 ? 'origin'),'visit projection hides home address');
 select test_assert(jsonb_array_length(query_mileage())=0,'Dexter cannot read colleague expenses');
 select denied('list','{"scope":"finance"}');select denied('settings','{}');
 select login(3);
 select test_assert(jsonb_array_length(query_mileage())=1,'Dexter finance reads the real expense evidence');
 select test_assert((multideck_mileage('list','{"scope":"finance"}')->>'total')::int=1,'finance queue includes submitted claim');
 select denied('pay','{"id":"60000000-0000-0000-0000-000000000001","version":2,"reference":""}');
 select test_assert(multideck_mileage('pay','{"id":"60000000-0000-0000-0000-000000000001","version":2,"reference":"BANK-REF-1"}')->>'status'='paid','finance records payment');
 select denied('pay','{"id":"60000000-0000-0000-0000-000000000001","version":3,"reference":"BANK-REF-2"}');
 select login(4);
 select multideck_mileage('settings','{"version":0,"approval_required":true,"approver_ids":["00000000-0000-0000-0000-000000000002"]}');
 select denied('settings','{"version":1,"approval_required":true,"approver_ids":["00000000-0000-0000-0000-000000000005"]}');
 select login(1);
 select multideck_mileage('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002"}');
 select test_assert(multideck_mileage('submit','{"id":"60000000-0000-0000-0000-000000000002","version":1}')->>'status'='pending','approval enabled');
 select denied('approve','{"id":"60000000-0000-0000-0000-000000000002","version":2}');
 select login(3);select denied('pay','{"id":"60000000-0000-0000-0000-000000000002","version":2,"reference":"BYPASS"}');
 select login(2);select denied('reject','{"id":"60000000-0000-0000-0000-000000000002","version":2,"reason":""}');
 select test_assert(multideck_mileage('reject','{"id":"60000000-0000-0000-0000-000000000002","version":2,"reason":"Check distance"}')->>'status'='rejected','reject needs reason');
 select login(1);
 select multideck_mileage('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002","version":3,"distance_miles":44}');
 select multideck_mileage('submit','{"id":"60000000-0000-0000-0000-000000000002","version":4}');
 select login(4);select multideck_mileage('settings','{"version":1,"approval_required":false,"approver_ids":["00000000-0000-0000-0000-000000000002"]}');
 select test_assert(multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000002"}')->'trip'->>'status'='pending','turning approval off does not bypass existing review');
 select login(2);select test_assert(multideck_mileage('approve','{"id":"60000000-0000-0000-0000-000000000002","version":5}')->>'status'='ready','approver moves to accounts');
 select login(3);
 select test_assert((multideck_mileage('list','{"scope":"finance","sort":"amount","direction":"desc","limit":1}')->'rows'->0->>'distance_miles')::numeric=44,'sort is applied before page limit');
 select test_assert((multideck_mileage('list','{"scope":"finance","sort":"amount","direction":"asc","limit":1}')->'rows'->0->>'distance_miles')::numeric=40,'ascending server sort');
 do $$begin for n in 1..100 loop perform multideck_mileage('reserve_route');end loop;end$$;
 select denied('reserve_route');
 select login(5);select denied('detail','{"id":"60000000-0000-0000-0000-000000000002"}');select denied('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}');
 select denied('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000001","account_id":null}');
 select test_assert((multideck_mileage('list')->>'total')::int=0,'foreign company cannot list');
 select login(99);select denied('context');
 reset role;
 update "cmp_Users" set "User_AccessStatus"='deactivated' where "User_ID"='00000000-0000-0000-0000-000000000001';
 set role authenticated;select login(1);select denied('context');
 select login(2);select test_assert(jsonb_array_length(multideck_mileage('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}'))=2,'historical visits survive creator deactivation');
 reset role;
 select test_assert((select count(*)=1 from "Comm_Notifications" where "CommNotif_Title"='Mileage claim marked as paid' and "CommNotif_UserID"='00000000-0000-0000-0000-000000000001'),'one payment notification');
 select test_assert(not has_table_privilege('authenticated','mileage_trips','UPDATE'),'no forged payment fields');
 select test_assert(not has_table_privilege('authenticated','mileage_route_quotes','INSERT'),'no forged map quote');
 select test_assert(not has_function_privilege('anon','multideck_mileage(text,jsonb)','EXECUTE'),'anonymous denied');
 select test_assert(not has_function_privilege('authenticated','mileage.calculate(mileage_trips,numeric)','EXECUTE'),'internal calculator private');
 `))
}))

test('manual company names persist without creating a CRM visit link', () => withProductPostgres((sql, ok) => {
 createMileageFixture(sql,ok)
 ok(sql(`
 set role authenticated;select login(1);
 select test_assert(multideck_mileage('save',(select data from fixture_trip)||'{"account_id":null,"company_name":"Walk-in prospect"}')->>'company_name'='Walk-in prospect','manual company name is saved');
 select test_assert(multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->>'companyName'='Walk-in prospect','manual company name is returned in detail');
 select test_assert(jsonb_array_length(multideck_mileage('visits','{"account_id":"50000000-0000-0000-0000-000000000001"}'))=0,'manual company name does not create a CRM visit');
 select denied('save',(select data from fixture_trip)||jsonb_build_object('account_id',null,'company_name',repeat('x',201),'version',1));
 `))
}))

test('date-effective rates, split allowance, opening balance, immutable snapshots and route tampering', () => withProductPostgres((sql, ok) => {
 createMileageFixture(sql,ok)
 ok(sql(`
 set role authenticated;select login(4);
 select multideck_mileage('opening_balance','{"user_id":"00000000-0000-0000-0000-000000000001","tax_year":2026,"miles":9990}');
 select login(1);
 select test_assert((multideck_mileage('preview',(select data from fixture_trip))->>'amount')::numeric=13,'split 10 miles at 55p and 30 at 25p');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"trip_date":"2026-04-05"}')->>'amount')::numeric=18,'before 6 April uses 45p');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"vehicle_type":"motorcycle"}')->>'amount')::numeric=9.6,'motorcycle 24p');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"vehicle_type":"bicycle"}')->>'amount')::numeric=8,'bicycle 20p');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"petrol","engine_cc":1400}')->>'amount')::numeric=5.6,'petrol lower engine boundary');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"petrol","engine_cc":1401}')->>'amount')::numeric=6.8,'petrol upper engine boundary');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"diesel","engine_cc":2001,"trip_date":"2026-06-30"}')->>'amount')::numeric=9.2,'historic advisory rate');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"electric","charging":"home"}')->>'amount')::numeric=2.8,'electric home');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"electric","charging":"public"}')->>'amount')::numeric=6,'electric public');
 select denied('preview',(select data from fixture_trip)||'{"company_car":true,"fuel_type":"diesel","engine_cc":2000,"trip_date":"2025-08-01"}');
 select denied('save',(select data from fixture_trip)||'{"distance_source":"google","route_quote_id":"70000000-0000-0000-0000-000000000001"}');
 select denied('save',(select data from fixture_trip)||'{"distance_miles":-1}');
 select denied('save',(select data from fixture_trip)||'{"distance_reason":""}');
 select denied('save',(select data from fixture_trip)||'{"waypoints":[{"address":"injection"}]}');
 select multideck_mileage('save',(select data from fixture_trip));
 select test_assert((multideck_mileage('submit','{"id":"60000000-0000-0000-0000-000000000001","version":1}')->>'amount')::numeric=13,'submit snapshots split');
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002"}')->>'amount')::numeric=10,'next claim cannot reuse high band');
 select login(4);
 select denied('opening_balance','{"user_id":"00000000-0000-0000-0000-000000000001","tax_year":2026,"miles":0}');
 select multideck_mileage('settings','{"version":0,"approval_required":false,"approver_ids":[],"electric_override_pence":14}');
 select test_assert((multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->'trip'->>'amount')::numeric=13,'settings do not recalculate submitted claim');
 select login(1);
 select test_assert((multideck_mileage('preview',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002","company_car":true,"fuel_type":"electric","charging":"home"}')->'rate_snapshot'->>'label')='Workspace electric-car rate (not an HMRC rate)','electric override honestly labelled');
 reset role;
 insert into public.mileage_route_quotes(id,company_id,user_id,route_input,distance_miles,route_data) values('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','{"origin":"WF10 5YL","destination":"LS1 1UR","waypoints":[],"round_trip":true,"vehicle_type":"car"}',42,'{}');
 set role authenticated;select login(1);
 select test_assert((multideck_mileage('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000002","distance_source":"google","route_quote_id":"70000000-0000-0000-0000-000000000001","distance_miles":9999}')->>'distance_miles')::numeric=42,'server route distance overrides tampered client value');
 select denied('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000003","origin":"Different address","distance_source":"google","route_quote_id":"70000000-0000-0000-0000-000000000001"}');
 select login(2);
 select denied('save',(select data from fixture_trip)||'{"id":"60000000-0000-0000-0000-000000000003","distance_source":"google","route_quote_id":"70000000-0000-0000-0000-000000000001"}');
 `))
}))

test('confirmation is atomic, retry-safe and binds private photos and reviewed amount', () => withProductPostgres((sql,ok)=>{
 createMileageFixture(sql,ok)
 ok(sql(`
 insert into mileage_evidence(id,trip_id,company_id,user_id,kind,object_path,mime_type) values
 ('80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','before','private/before','image/jpeg'),
 ('80000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','after','foreign/after','image/jpeg');
 set role authenticated;select login(1);
 select denied('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000001","reviewed_approval":false,"reviewed_amount":1}');
 select test_assert((multideck_mileage('list')->>'total')::int=0,'failed amount review rolls back trip creation');
 select denied('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000001","reviewed_approval":false,"reviewed_amount":22,"evidence_ids":["80000000-0000-0000-0000-000000000002"]}');
 select test_assert(multideck_mileage('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000001","reviewed_approval":false,"reviewed_amount":22,"evidence_ids":["80000000-0000-0000-0000-000000000001"]}')->>'status'='ready','confirm creates and submits');
 select test_assert(multideck_mileage('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000001","reviewed_approval":false,"reviewed_amount":22}')->>'version'='2','retry returns existing submission');
 select test_assert(jsonb_array_length(multideck_mileage('evidence','{"id":"60000000-0000-0000-0000-000000000001"}'))=1,'owner reads attached photo');
 select login(2);select denied('evidence','{"id":"60000000-0000-0000-0000-000000000001"}');
 select login(3);select test_assert(jsonb_array_length(multideck_mileage('evidence','{"id":"60000000-0000-0000-0000-000000000001"}'))=1,'finance reads submitted evidence');
 select login(5);select denied('evidence','{"id":"60000000-0000-0000-0000-000000000001"}');
 reset role;
 select test_assert((select count(*)=1 from mileage_trips),'one trip after retry');
 select test_assert((select count(*)=1 from mileage_events where action='submit'),'one submission event after retry');
 select test_assert(not has_table_privilege('authenticated','mileage_evidence','SELECT'),'private evidence cannot be listed directly');
 `))
}))


test('review confirmation retains route evidence on override and honours optional approval', () => withProductPostgres((sql,ok)=>{
 createMileageFixture(sql,ok)
 ok(sql(`
 insert into mileage_route_quotes(id,company_id,user_id,route_input,distance_miles,route_data) values
 ('70000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','{"origin":"WF10 5YL","destination":"LS1 1UR","waypoints":[],"round_trip":true,"vehicle_type":"car"}',42,'{"provider":"OpenStreetMap / OSRM","points":[[53,-1],[53.1,-1.1]]}');
 set role authenticated;select login(4);
 select multideck_mileage('settings','{"version":0,"approval_required":true,"approver_ids":["00000000-0000-0000-0000-000000000002"]}');
 select login(1);
 select denied('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000003","reviewed_approval":false,"reviewed_amount":22}');
 select test_assert((multideck_mileage('list')->>'total')::int=0,'changed approval settings roll back confirmation');
 select test_assert(multideck_mileage('confirm',(select data from fixture_trip)||'{"submission_key":"90000000-0000-0000-0000-000000000003","reviewed_approval":true,"reviewed_amount":22,"distance_source":"manual","route_quote_id":"70000000-0000-0000-0000-000000000003"}')->>'status'='pending','confirmation respects enabled approval');
 select test_assert((multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->'trip'->>'distance_miles')::numeric=40,'manual distance is retained');
 select test_assert(multideck_mileage('detail','{"id":"60000000-0000-0000-0000-000000000001"}')->'trip'->'route_data'->>'provider'='OpenStreetMap / OSRM','route evidence is retained alongside override');
 select login(3);select denied('pay','{"id":"60000000-0000-0000-0000-000000000001","version":2,"reference":"BYPASS"}');
 `))
}))
