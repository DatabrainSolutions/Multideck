-- Approved internal JE0991148 development fixture only. Always roll back.
-- Fresh creation consumes declaration sequence numbers even after rollback.
-- Existing test declaration visibility is changed only inside each subtransaction.
begin;
set local statement_timeout = '25s';
set local lock_timeout = '2s';
do $test$
declare
  actor constant uuid := '59bcff90-a1ea-4469-bc64-26430f788a5a';
  job constant uuid := 'fad7fe4c-1c4c-4a2f-a155-95306856b6bd';
  mode text; direction text; reference text; first_result jsonb; retry_result jsonb;
  declaration uuid; payload jsonb; readiness jsonb; request_key uuid;
begin
  if not exists(select 1 from public."Job_Header" where "Job_ID"=job
    and "Job_BookingReference"='JE0991148') then raise exception 'Wrong fixture'; end if;
  foreach mode in array array['road','rail'] loop
    foreach direction in array array['import','export'] loop
      begin
        -- Temporarily hide ONLY this internal fixture's drafts to exercise creation.
        update public."Customs_Declarations" set "CUST_IsDeleted"=true where "CUST_JobID"=job;
        update public."Job_Header" set "Job_TransportModeSummary"=mode,
          "Job_OriginUNLocode"=case when direction='export' then 'GBFXT' else 'FRPAR' end,
          "Job_DestinationUNLocode"=case when direction='import' then 'GBFXT' else 'FRPAR' end
        where "Job_ID"=job;
        update public."Job_Parties" set "JobParty_IdentifierType"='eori',
          "JobParty_IdentifierValueSnapshot"='GB123456789000'
        where "JobParty_JobID"=job and lower("JobParty_Role") in ('importer','consignee');
        reference := 'INTERNAL-' || upper(mode) || '-TEST';
        update public."Job_Routing" set "JobRoute_MasterTransportReference"=null,
          "JobRoute_TrailerNumber"=null,
          "JobRoute_VehicleRegistration"=case when mode='road' then reference end,
          "JobRoute_RailService"=case when mode='rail' then reference end
        where "Job_ID"=job;
        readiness := booking_api.customs_readiness(actor,job);
        if not (readiness->>'ready')::boolean then raise exception 'Fixture not ready: %',readiness; end if;
        request_key := gen_random_uuid();
        first_result := booking_api.send_to_customs(actor,job,request_key);
        declaration := (first_result->>'declarationId')::uuid;
        if first_result->>'reused'<>'false' or first_result->>'canOpen'<>'true' then
          raise exception 'Fresh accessible declaration not created: %',first_result; end if;
        select "CUST_GenericPayloadJSON" into strict payload from public."Customs_Declarations"
          where "CUST_id"=declaration and "CUST_Status"='draft' and "CUST_Direction"=direction;
        if payload->>'borderMode' is distinct from (case when mode='road' then '3' else '2' end)
          or payload->>'borderIdentificationNumber' is distinct from reference
          or payload->>(case when direction='import' then 'arrivalIdentificationNumber' else 'departureIdentificationNumber' end) is distinct from reference
          or payload ? (case when direction='import' then 'departureIdentificationNumber' else 'arrivalIdentificationNumber' end)
        then raise exception 'Transport mapping failed: % % %',mode,direction,payload; end if;
        if payload->>'prefillReviewRequired'<>'true' or payload->>'bookingHandoffUiVersion'<>'2'
          or jsonb_array_length(payload->'items')<>(select count(*) from public."Job_Cargo" where "JobCargo_JobID"=job and not "JobCargo_IsDeleted")
        then raise exception 'Review/cargo mapping failed'; end if;
        if not exists(select 1 from public."Customs_Documents" where "CUSTD_CustomsID"=declaration
          and "CUSTD_DocumentCode"='commercial_invoice'
          and "CUSTD_JobDocumentID"=(readiness#>>'{evidence,commercialInvoiceDocumentId}')::uuid)
        then raise exception 'Invoice link missing'; end if;
        if exists(select 1 from public."Customs_Items" i join public."Job_Cargo" c on c."JobCargo_ID"=i."CUSTI_JobCargoID"
          where i."CUSTI_CustomsID"=declaration and (i."CUSTI_CommodityCode" is distinct from c."JobCargo_HSCode"
          or i."CUSTI_NetMass" is distinct from c."JobCargo_NettKilos" or i."CUSTI_GrossMass" is distinct from c."JobCargo_GrossKilos"))
        then raise exception 'Cargo values changed during handover'; end if;
        retry_result := booking_api.send_to_customs(actor,job,request_key);
        if retry_result->>'declarationId' is distinct from declaration::text or retry_result->>'reused'<>'true'
          then raise exception 'Retry duplicated declaration'; end if;
        retry_result := booking_api.send_to_customs(actor,job,gen_random_uuid());
        if retry_result->>'declarationId' is distinct from declaration::text or retry_result->>'reused'<>'true'
          then raise exception 'Second click duplicated declaration'; end if;
        if booking_api.customs_access(null,declaration,false) then raise exception 'Anonymous access allowed'; end if;
        if exists(select 1 from public."Comm_Notifications" where "CommNotif_TargetID"=declaration
          group by "CommNotif_UserID" having count(*)>1) then raise exception 'Duplicate notification'; end if;
        raise exception using errcode='PZ001',message='Scenario passed; undo fixture changes';
      exception when sqlstate 'PZ001' then null;
      end;
    end loop;
  end loop;
end;
$test$;
rollback;
select 'PASS: four fresh Road/Rail Import/Export handovers, cargo/invoice mapping and retries; rolled back' as result;
