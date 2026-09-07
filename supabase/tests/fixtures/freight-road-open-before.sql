-- Supplement current-schema baseline snapshots; the Road wrapper adds no columns.
create table freight_rehearsal.road_domains_before as select * from public."sys_AIDexterDataDomains";
create table freight_rehearsal.road_actions_before as select * from public."sys_AIDexterActions";
create table freight_rehearsal.road_capabilities_before as select * from public."sys_AIDexterWatchCapabilities";
create table freight_rehearsal.road_dg_before as select * from public."Job_CargoDangerousGoods";
create table freight_rehearsal.road_milestones_before as select * from public."Job_RouteMilestones";
create table freight_rehearsal.road_functions_before as
  select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proacl
  from pg_proc where oid in ('booking_api.open_booking(uuid,uuid,text)'::regprocedure,
    'public.booking_workflow_save(uuid,uuid,jsonb)'::regprocedure);
