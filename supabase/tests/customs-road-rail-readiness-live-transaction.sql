-- Internal JE0991148 only. No successful handover, declaration, email or provider call.
-- All scenario changes roll back. Run against the approved development project only.
begin;
set local statement_timeout = '20s';
set local lock_timeout = '2s';
do $test$
declare
  actor constant uuid := '59bcff90-a1ea-4469-bc64-26430f788a5a';
  job constant uuid := 'fad7fe4c-1c4c-4a2f-a155-95306856b6bd';
  mode text;
  direction text;
  result jsonb;
  rejected boolean;
begin
  if not exists (select 1 from public."Job_Routing" where "Job_ID" = job) then
    raise exception 'Internal fixture route missing';
  end if;
  foreach mode in array array['road','rail'] loop
    update public."Job_Routing" set
      "JobRoute_MasterTransportReference" = null,
      "JobRoute_TrailerNumber" = null,
      "JobRoute_VehicleRegistration" = case when mode = 'road' then 'INTERNAL-ROAD-TEST' end,
      "JobRoute_RailService" = case when mode = 'rail' then 'INTERNAL-RAIL-TEST' end
    where "Job_ID" = job;
    foreach direction in array array['import','export','domestic','cross_trade'] loop
      update public."Job_Header" set "Job_TransportModeSummary" = mode,
        "Job_OriginUNLocode" = case when direction in ('export','domestic') then 'GBLHR' else 'FRCDG' end,
        "Job_DestinationUNLocode" = case when direction in ('import','domestic') then 'GBLHR' else 'DEHAM' end,
        "Job_Direction" = direction where "Job_ID" = job;
      result := booking_api.customs_readiness(actor, job);
      if (result->>'eligible')::boolean is distinct from (direction in ('import','export')) then
        raise exception 'Eligibility mismatch: % %', mode, direction;
      end if;
      if result#>>'{evidence,transportReference}' is distinct from
        (case when mode = 'road' then 'INTERNAL-ROAD-TEST' else 'INTERNAL-RAIL-TEST' end) then
        raise exception 'Reference mismatch: % %', mode, direction;
      end if;
      if direction = 'export' and not (result->>'ready')::boolean then
        raise exception 'Complete export fixture not ready: %', result;
      end if;
      if direction in ('domestic','cross_trade') then
        rejected := false;
        begin
          perform booking_api.send_to_customs(actor, job, gen_random_uuid());
        exception when sqlstate '22023' then
          if sqlerrm not like '%not eligible%' then raise; end if;
          rejected := true;
        end;
        if not rejected then raise exception 'Ineligible handover was not rejected'; end if;
      end if;
    end loop;
    update public."Job_Header" set "Job_Direction" = 'export',
      "Job_OriginUNLocode" = 'GBLHR', "Job_DestinationUNLocode" = 'DEHAM' where "Job_ID" = job;
    update public."Job_Routing" set "JobRoute_VehicleRegistration" = null,
      "JobRoute_RailService" = null where "Job_ID" = job;
    result := booking_api.customs_readiness(actor, job);
    if (result->>'ready')::boolean or not exists (
      select 1 from jsonb_array_elements(result->'missing') item
      where item->>'key' = 'transport_reference'
    ) then raise exception 'Missing % reference did not block readiness', mode; end if;
  end loop;
end;
$test$;
rollback;
select 'PASS: 8 mode/direction scenarios, 4 rejected handovers, 2 missing-reference checks; rolled back' as result;
