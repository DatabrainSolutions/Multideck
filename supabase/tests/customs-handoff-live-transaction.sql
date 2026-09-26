-- Internal JE0991147 only. Run with the target tenant verified; always roll back.
-- Historical successful-handover probe: requires a fully ready fixture, including
-- cargo commodity codes/net weights and party countries introduced on 22 September.
-- JE0991147 currently lacks these; use customs-handover-required-live-transaction.sql
-- for rollback-only coverage of the new gate. Do not invent permanent source values.
begin;
do $test$
declare first_result jsonb; retry_result jsonb; declaration_id_value uuid;
begin
  first_result := booking_api.send_to_customs('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b',gen_random_uuid());
  declaration_id_value := (first_result->>'declarationId')::uuid;
  retry_result := booking_api.send_to_customs('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b',gen_random_uuid());
  if retry_result->>'declarationId' is distinct from first_result->>'declarationId'
    or retry_result->>'reused' <> 'true' then raise exception 'Retry duplicated declaration'; end if;
  if not booking_api.customs_access('59bcff90-a1ea-4469-bc64-26430f788a5a',declaration_id_value,false) then raise exception 'Initiator cannot read declaration'; end if;
  if booking_api.customs_access(null,declaration_id_value,false) then raise exception 'Anonymous access allowed'; end if;
  if (select count(*) from public."Customs_Declarations" where "CUST_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and not "CUST_IsDeleted") <> 1 then raise exception 'Declaration count mismatch'; end if;
  if exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=declaration_id_value group by "CommNotif_UserID" having count(*)>1) then raise exception 'Duplicate notification'; end if;
end;
$test$;
rollback;
