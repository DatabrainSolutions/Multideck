-- Only the existing three-argument private opener may change definition.
-- Snapshot every other application function, not just the canonical save.
insert into quote_api.booking_reference_sequences(company_id,sequence_key,label,pattern,next_number)
values('10000000-0000-4000-8000-000000000001','default','Retained directional rule','J{DIRECTION:1}{NUMBER:7}',900002);
insert into quote_api.reference_reservations(company_id,normalized_reference,reference_value,reference_kind)
values('10000000-0000-4000-8000-000000000001','JI0900001','JI0900001','booking');
create table freight_rehearsal.road_domains_before as select * from public."sys_AIDexterDataDomains";
create table freight_rehearsal.road_actions_before as select * from public."sys_AIDexterActions";
create table freight_rehearsal.road_capabilities_before as select * from public."sys_AIDexterWatchCapabilities";
create table freight_rehearsal.road_dg_before as select * from public."Job_CargoDangerousGoods";
create table freight_rehearsal.road_milestones_before as select * from public."Job_RouteMilestones";
create table freight_rehearsal.road_functions_before as
  select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','booking_api','quote_api','private','document_api') and p.prokind='f'
    and p.oid<>'booking_api.open_booking(uuid,uuid,text)'::regprocedure;
create table freight_rehearsal.direction_opener_before as
  select proacl from pg_proc where oid='booking_api.open_booking(uuid,uuid,text)'::regprocedure;
create table freight_rehearsal.direction_sequences_before as select * from quote_api.booking_reference_sequences;
create table freight_rehearsal.direction_reservations_before as select * from quote_api.reference_reservations;
