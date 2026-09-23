-- Internal JE0991147 only. All source changes and new drafts are rolled back.
begin;
do $test$
declare r jsonb; d uuid; p jsonb; original_snapshot jsonb; saved record;
begin
 update public."Job_Cargo" set "JobCargo_HSCode"='123456', "JobCargo_NettKilos"=100 where "JobCargo_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and not "JobCargo_IsDeleted";
 update public."Job_Parties" set "JobParty_CountryCodeSnapshot"='GB' where "JobParty_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b' and lower("JobParty_Role") in ('exporter','shipper','consignor','importer','consignee');
 update public."Customs_Declarations" set "CUST_IsDeleted"=true where "CUST_JobID"='4fd48d17-03db-496e-a562-aeacb748fc4b';
 r := booking_api.send_to_customs('59bcff90-a1ea-4469-bc64-26430f788a5a','4fd48d17-03db-496e-a562-aeacb748fc4b',gen_random_uuid());
 d := (r->>'declarationId')::uuid;
 select "CUST_GenericPayloadJSON", "CUST_SourceSnapshot" into p,original_snapshot from public."Customs_Declarations" where "CUST_id"=d;
 if p->>'exporter'<>'Demo Organisation 035' or p->>'exporterEori'<>'GB123456789000' or p->>'importer'<>'Demo Organisation 009' or p->>'importerEori' is null or p->>'consignee'<>'Demo Organisation 009' then raise exception 'Party mapping failed'; end if;
 p := p || jsonb_build_object('exporter','Reviewed company','exporterEori','GB987654321000','importer','Reviewed importer','importerEori','','declarant','Test declarant','declarantEori','GB111111111000','totalPackages','450','totalGrossMass','15000','totalAmount','60000');
 perform booking_api.save_job_customs_draft('59bcff90-a1ea-4469-bc64-26430f788a5a',d,p);
 select * into saved from public."Customs_Declarations" where "CUST_id"=d;
 if saved."CUST_ExporterIdentifierSnapshot" is distinct from 'GB987654321000' or saved."CUST_ImporterIdentifierSnapshot" is not null or saved."CUST_DeclarantIdentifierSnapshot" is distinct from 'GB111111111000' then raise exception 'Save identifiers failed'; end if;
 if saved."CUST_SourceSnapshot" is distinct from original_snapshot then raise exception 'Source history changed'; end if;
 if saved."CUST_TotalPackages" is distinct from 450 or saved."CUST_InvoiceAmount" is distinct from 60000::numeric then raise exception 'Numeric readback failed'; end if;
 p := (p - 'exporterEori') || jsonb_build_object('exporter','GB123456789000');
 perform booking_api.save_job_customs_draft('59bcff90-a1ea-4469-bc64-26430f788a5a',d,p);
 if (select "CUST_ExporterIdentifierSnapshot" from public."Customs_Declarations" where "CUST_id"=d) is distinct from 'GB123456789000' then raise exception 'Old client compatibility failed'; end if;
 begin
 perform booking_api.save_job_customs_draft(null,d,p);
 raise exception 'Anonymous save allowed';
 exception when insufficient_privilege then null; end;
end;
$test$;
rollback;
