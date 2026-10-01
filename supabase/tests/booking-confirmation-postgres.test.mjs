import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const available = spawnSync(join(bin, 'initdb'), ['--version']).status === 0
const migration = readFileSync(new URL('../migrations/20260924133000_booking_confirmation_scope_and_snapshot.sql', import.meta.url), 'utf8')
const partiesMigration = readFileSync(new URL('../migrations/20260928132500_booking_confirmation_parties.sql', import.meta.url), 'utf8')
const equipmentModeMigration = readFileSync(new URL('../migrations/20260929095630_booking_confirmation_equipment_mode.sql', import.meta.url), 'utf8')
const shipmentTypeMigration = readFileSync(new URL('../migrations/20260929130600_booking_confirmation_shipment_type_source.sql', import.meta.url), 'utf8')
const templateChoicesMigration = readFileSync(new URL('../migrations/20260929144212_booking_confirmation_template_choices.sql', import.meta.url), 'utf8')
const detailMigration = readFileSync(new URL('../migrations/20260901100000_booking_detail_editing.sql', import.meta.url), 'utf8')
const issueMigration = readFileSync(new URL('../migrations/20261001145513_booking_document_issue_markings.sql', import.meta.url), 'utf8')
const originalDetailSave = detailMigration.slice(
  detailMigration.indexOf('create or replace function booking_api.save_booking_detail_fields('),
  detailMigration.indexOf('create or replace function booking_api.workspace_extended('),
)

test('Booking PDF review freezes customer prices, excludes private data, and retains versions', { skip: !available }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'multideck-booking-confirmation-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const sql = input => run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input)
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema booking_api; create schema document_api;
      create table public."cmp_Users" ("User_ID" uuid, "Company_ID" uuid, "Auth_User_ID" uuid, "User_AccessStatus" text,
        "User_Firstname" text, "User_Lastname" text);
      create table public."cmp_Offices" ("Office_ID" uuid, "Company_ID" uuid, "Office_IsActive" boolean);
      create table public."cmp_Users_Offices" ("User_ID" uuid, "Office_ID" uuid);
      create table public."Org_Master" ("Org_id" uuid, "Org_Name" text);
      create table public."Job_Header" ("Job_ID" uuid, "Job_OrgOfficeID" uuid, "Job_OfficeID" uuid,
        "Job_Status" text, "Job_Direction" text, "Job_TransportModeSummary" text,
        "Job_IncotermsCode" text, "Job_IncotermsLocation" text,
        "Job_Customer" uuid, "Job_IsDeleted" boolean default false,
        "Job_EditableDetailsJSON" jsonb default '{}'::jsonb, "Job_SourceSnapshotJSON" jsonb,
        "Job_BookingReference" text,
        "Job_SourceQuoteVersionID" uuid, "Job_CollectionAddress" text, "Job_DeliveryAddress" text,
        "Job_CustomerReference" text, "Job_ReadyDate" date, "Job_RequiredDeliveryDate" date,
        "Job_UpdatedAt" timestamptz, "Job_UpdatedBy" uuid);
      create table public."Job_Cargo" ("JobCargo_ID" uuid, "JobCargo_JobID" uuid, "JobCargo_LineNo" integer,
        "JobCargo_IsDeleted" boolean default false, "JobCargo_Description" text, "JobCargo_CargoJSON" jsonb,
        "JobCargo_MarksNumbers" text, "JobCargo_PackageQty" numeric, "JobCargo_PackageTypeCodeSnapshot" text,
        "JobCargo_GrossKilos" numeric, "JobCargo_VolumeCBM" numeric);
      create table public."Job_Parties" ("JobParty_ID" uuid, "JobParty_JobID" uuid, "JobParty_Role" text,
        "JobParty_NameSnapshot" text, "JobParty_AddressSnapshot" text,
        "JobParty_IsPrimary" boolean, "JobParty_Sequence" integer);
      create table public."Job_Routing" ("JobRoute_ID" uuid, "Job_ID" uuid, "JobRoute_OrderNo" integer,
        "JobRoute_ModeCode" text, "JobRoute_OriginNameSnapshot" text, "JobRoute_OriginUNLocode" text,
        "JobRoute_DestinationNameSnapshot" text, "JobRoute_DestinationUNLocode" text,
        "JobRoute_PlannedPickupAt" timestamptz, "JobRoute_PlannedDepartureAt" timestamptz,
        "JobRoute_PlannedArrivalAt" timestamptz, "JobRoute_PlannedDeliveryAt" timestamptz,
        "JobRoute_Carrier" uuid, "JobRoute_CarrierBookingReference" text,
        "JobRoute_MasterTransportReference" text, "JobRoute_HouseTransportReference" text,
        "JobRoute_ServiceLevel" text, "JobRoute_TransportMeansName" text,
        "JobRoute_FlightNumber" text, "JobRoute_Vessel" text, "JobRoute_VoyageNumber" text,
        "JobRoute_VehicleRegistration" text, "JobRoute_TrailerNumber" text,
        "JobRoute_RailService" text, "JobRoute_RouteJSON" jsonb);
      create table public."Job_Containers" ("JobContainers_ID" uuid, "Job_ID" uuid,
        "JobContainer_EquipmentKind" text, "JobContainer_Number" text,
        "JobContainer_TypeCodeSnapshot" text, "JobContainer_CreatedAt" timestamptz default now(),
        "JobContainer_IsDeleted" boolean default false);
      create table public."Job_Costing_Lines" ("JobCostingLine_ID" uuid, "Job_ID" uuid, "JobCostingLine_Number" integer,
        "JobCostingLine_Description" text, "JobCostingLine_RevenueAmountCurrency" numeric,
        "JobCostingLine_CostAmountCurrency" numeric, "JobCostingLine_DomainCode" text,
        "JobCostingLine_ShowToCustomer" boolean, "JobCostingLine_SourceTable" text,
        "JobCostingLine_SourceMetadataJSON" jsonb);
      create table public."DOCB_DocumentTemplates" ("DOCBT_ID" uuid, "DOCBT_Code" text, "DOCBT_Name" text default 'Booking information');
      create table public."DOCB_RenderJobs" ("DOCBRJ_ID" uuid, "DOCBRJ_TemplateID" uuid,
        "DOCBRJ_JobID" uuid, "DOCBRJ_CreatedBy" uuid, "DOCBRJ_StatusCode" text,
        "DOCBRJ_OutputFormatCode" text, "DOCBRJ_InputSnapshotJSON" jsonb,
        "DOCBRJ_RenderSettingsJSON" jsonb);
      create table public."DOCB_GeneratedDocuments" ("DOCBGD_ID" uuid, "DOCBGD_RenderJobID" uuid,
        "DOCBGD_TemplateID" uuid, "DOCBGD_TemplateVersionID" uuid,
        "DOCBGD_VersionNo" integer, "DOCBGD_IsCurrentVersion" boolean,
        "DOCBGD_FileName" text, "DOCBGD_MimeType" text,
        "DOCBGD_FileSizeBytes" bigint, "DOCBGD_CreatedAt" timestamptz default now(), "DOCBGD_MetadataJSON" jsonb);
      create function booking_api.has_permission(uuid,text) returns boolean language sql as $$ select $1 is not null $$;
      create function document_api.has_permission(uuid,text) returns boolean language sql as $$ select $1 is not null $$;
      create function booking_api.workspace_documents(uuid,uuid) returns jsonb language sql as $$ select '[]'::jsonb $$;
      create function document_api.complete_job_render(uuid,uuid,uuid,text,text,text,text,bigint,text) returns jsonb
        language plpgsql as $$ begin insert into public."DOCB_GeneratedDocuments"("DOCBGD_ID","DOCBGD_RenderJobID",
          "DOCBGD_TemplateID","DOCBGD_TemplateVersionID","DOCBGD_VersionNo","DOCBGD_IsCurrentVersion",
          "DOCBGD_FileName","DOCBGD_MimeType","DOCBGD_FileSizeBytes")
          select $3,$2,r."DOCBRJ_TemplateID",'f0000000-0000-4000-8000-000000000001',1,true,$6,$7,$8
          from public."DOCB_RenderJobs" r where r."DOCBRJ_ID"=$2;
          update public."DOCB_RenderJobs" set "DOCBRJ_StatusCode"='completed' where "DOCBRJ_ID"=$2;
          return jsonb_build_object('generatedDocumentId',$3); end $$;
    `)
    sql(originalDetailSave)
    sql(migration)
    sql(partiesMigration)
    sql(equipmentModeMigration)
    sql(shipmentTypeMigration)
    sql(templateChoicesMigration.slice(templateChoicesMigration.indexOf('create or replace function document_api.is_booking_confirmation_template_code'), templateChoicesMigration.indexOf('-- A manager may copy')))
    sql(templateChoicesMigration.slice(templateChoicesMigration.indexOf('create or replace function document_api.prepare_booking_confirmation')))
    sql(issueMigration)
    const result = sql(`
      insert into public."cmp_Users" values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','active','Lee','Wright'),
        ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','active','Other','Tenant'),
        ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','active','Unlinked','Colleague');
      insert into public."cmp_Offices" values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true);
      insert into public."cmp_Users_Offices" values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
      insert into public."Org_Master" values ('50000000-0000-4000-8000-000000000001','Demo Customer');
      insert into public."Job_Header" ("Job_ID","Job_OrgOfficeID","Job_OfficeID","Job_Status","Job_Customer",
        "Job_IsDeleted","Job_EditableDetailsJSON","Job_SourceSnapshotJSON","Job_BookingReference","Job_SourceQuoteVersionID",
        "Job_CollectionAddress","Job_DeliveryAddress","Job_CustomerReference","Job_ReadyDate","Job_RequiredDeliveryDate")
      values ('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,
        'open','50000000-0000-4000-8000-000000000001',false,
        '{"scopeCollection":true,"scopeMainTransport":true,"scopeDelivery":false,"collectionRemarks":"Open 8 to 5","specialInstructions":"Use gate 2"}',
        '{"acceptedSnapshot":{"quote":{"shipmentType":"AIR"}}}',
        'JE-TEST','70000000-0000-4000-8000-000000000001','Factory','Customer onward journey',
        'PO-1','2026-09-24','2026-09-30');
      update public."Job_Header" set "Job_TransportModeSummary"='AIR',
        "Job_IncotermsCode"='FCA', "Job_IncotermsLocation"='London'
        where "Job_ID"='60000000-0000-4000-8000-000000000001';
      insert into public."Job_Cargo" values ('80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,false,
        'Widgets','{"marksAndNumbers":"BOX-1"}',null,2,'Cartons',100,1);
      update public."Job_Header" set "Job_Direction"='export' where "Job_ID"='60000000-0000-4000-8000-000000000001';
      insert into public."Job_Parties" values
        ('81000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','consignor','Demo Shipper','Factory Road',true,1),
        ('81000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','consignee','Demo Receiver','Harbour Street',true,1);
      insert into public."Job_Routing" ("JobRoute_ID","Job_ID","JobRoute_OrderNo","JobRoute_ModeCode",
        "JobRoute_OriginNameSnapshot","JobRoute_OriginUNLocode","JobRoute_DestinationNameSnapshot",
        "JobRoute_DestinationUNLocode","JobRoute_PlannedDepartureAt","JobRoute_PlannedArrivalAt",
        "JobRoute_CarrierBookingReference","JobRoute_MasterTransportReference",
        "JobRoute_HouseTransportReference","JobRoute_FlightNumber","JobRoute_RouteJSON")
      values ('90000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,
        'air','London','GBLHR','New York','USJFK','2026-09-24T12:00:00Z','2026-09-25T12:00:00Z',
        'REF','123-45678901','HAWB-001','FL1','{"carrierNotes":"Private rate and carrier note"}');
      insert into public."Job_Containers" ("JobContainers_ID","Job_ID","JobContainer_EquipmentKind",
        "JobContainer_Number","JobContainer_TypeCodeSnapshot") values
        ('91000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','uld','AKE12345EX','AKE'),
        ('91000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','container','STALE-SEA','40HC');
      insert into public."Job_Costing_Lines" values
        ('a0000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1,'Accepted Quote freight',150,100,'freight',true,'quote',
          '{"quoteCharge":{"sellCurrency":"GBP"}}'),
        ('a0000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',2,'Added after conversion',50,25,'freight',true,null,
          '{"bookingCharge":{"sellCurrency":"GBP"}}'),
        ('a0000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001',3,'Private cost',100,100,'freight',false,null,
          '{"bookingCharge":{"sellCurrency":"GBP"}}');
      insert into public."DOCB_DocumentTemplates" ("DOCBT_ID","DOCBT_Code") values ('b0000000-0000-4000-8000-000000000001','JOB_CONFIRMATION');
      insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{}','{}');
      do $check$ declare review jsonb; snapshot jsonb; changed jsonb; listing jsonb; begin
        perform booking_api.save_booking_detail_fields('30000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001',
          '{"editableDetails":{"scopeCollection":true,"scopeMainTransport":true,"scopeDelivery":false,
            "collectionRemarks":"Open 8 to 5","specialInstructions":"Use gate 2","customerReference":"PO-1"}}');
        if (select "Job_EditableDetailsJSON"#>>'{collectionRemarks}' from public."Job_Header"
          where "Job_ID"='60000000-0000-4000-8000-000000000001') <> 'Open 8 to 5' then
          raise exception 'Scope save did not persist'; end if;
        perform booking_api.save_booking_detail_fields('30000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001', '{"editableDetails":{"jobReference":"JOB-TEST"}}');
        if (select "Job_EditableDetailsJSON"#>>'{scopeCollection}' from public."Job_Header"
          where "Job_ID"='60000000-0000-4000-8000-000000000001') <> 'true' then
          raise exception 'Scope was lost on a later Booking save'; end if;
        begin perform booking_api.save_booking_detail_fields('30000000-0000-4000-8000-000000000002',
          '60000000-0000-4000-8000-000000000001', '{"editableDetails":{"scopeDelivery":true}}');
          raise exception 'Foreign tenant save allowed'; exception when insufficient_privilege then null; end;
        review:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if review#>>'{chargeTotals,0,amount}'<>'200' or jsonb_array_length(review->'chargeLines')<>2
          or review->'delivery'<>'null'::jsonb or review#>>'{cargo,0,marksAndNumbers}'<>'BOX-1'
          or review->>'customerReference'<>'PO-1' or review#>>'{collection,plannedAt}'<>'2026-09-24'
          or review#>>'{collection,plannedAtLabel}'<>'24 Sep 2026'
          or review->>'direction'<>'Export'
          or review->>'mode'<>'Air' or review->>'shipmentType'<>'AIR'
          or review->>'incoterm'<>'FCA London'
          or review#>>'{mainTransport,0,details}' not like '%MAWB: 123-45678901%'
          or review#>>'{mainTransport,0,details}' not like '%HAWB: HAWB-001%'
          or review#>>'{equipment,0,number}'<>'AKE12345EX'
          or jsonb_array_length(review->'equipment')<>1
          or review#>>'{shipper,name}'<>'Demo Shipper'
          or review#>>'{consignee,address}'<>'Harbour Street' then
          raise exception 'Review failed customer pricing, scope or marks'; end if;
        if review::text like '%Private rate%' or review::text like '%Private cost%'
          or review::text like '%Customer onward%' or review::text like '%CostAmount%' then
          raise exception 'Review included private information'; end if;
        update public."Job_Routing" set "JobRoute_ModeCode"='sea', "JobRoute_Vessel"='Example Star',
          "JobRoute_VoyageNumber"='42E', "JobRoute_FlightNumber"='STALE-FLIGHT'
          where "JobRoute_ID"='90000000-0000-4000-8000-000000000001';
        changed:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if changed#>>'{mainTransport,0,details}' not like '%Vessel: Example Star%'
          or changed#>>'{mainTransport,0,details}' like '%STALE-FLIGHT%'
          or changed#>>'{equipment,1,number}'<>'STALE-SEA'
          or jsonb_array_length(changed->'equipment')<>2 then
          raise exception 'Sea mapping included stale air fields'; end if;
        update public."Job_Routing" set "JobRoute_ModeCode"='road', "JobRoute_VehicleRegistration"='EX12 ABC',
          "JobRoute_TrailerNumber"='TR-45' where "JobRoute_ID"='90000000-0000-4000-8000-000000000001';
        changed:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if changed#>>'{mainTransport,0,details}' not like '%Vehicle: EX12 ABC%'
          or changed#>>'{mainTransport,0,details}' like '%Vessel: Example Star%' then
          raise exception 'Road mapping included stale sea fields'; end if;
        update public."Job_Routing" set "JobRoute_ModeCode"='rail', "JobRoute_RailService"='EX-R1'
          where "JobRoute_ID"='90000000-0000-4000-8000-000000000001';
        changed:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if changed#>>'{mainTransport,0,details}' not like '%Rail service: EX-R1%'
          or changed#>>'{mainTransport,0,details}' like '%Vehicle: EX12 ABC%' then
          raise exception 'Rail mapping included stale road fields'; end if;
        update public."Job_Routing" set "JobRoute_ModeCode"='air', "JobRoute_FlightNumber"='FL1'
          where "JobRoute_ID"='90000000-0000-4000-8000-000000000001';
        begin perform document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
          raise exception 'Foreign tenant read allowed'; exception when insufficient_privilege then null; end;
        begin perform document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001');
          raise exception 'Unlinked colleague read allowed'; exception when insufficient_privilege then null; end;
        begin perform document_api.booking_document_issue_options('30000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
          raise exception 'Foreign tenant read issue options'; exception when insufficient_privilege then null; end;
        snapshot:=document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',review->>'reviewToken',true);
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','draft');
          raise exception 'Foreign tenant selected issue status'; exception when insufficient_privilege then null; end;
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','draft');
          raise exception 'Another user selected issue status'; exception when insufficient_privilege then null; end;
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','original');
          raise exception 'Legal Original allowed'; exception when invalid_parameter_value then null; end;
        perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','draft');
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','final');
          raise exception 'Frozen issue selection changed'; exception when invalid_parameter_value then null; end;
        if snapshot#>>'{bookingConfirmation,chargeTotals,0,amount}'<>'200'
          or snapshot#>>'{bookingConfirmation,shipper,name}'<>'Demo Shipper'
          or snapshot->'meta'<> '{"schemaVersion":2}'::jsonb then
          raise exception 'Snapshot total or safe metadata incorrect'; end if;
        update public."Job_Costing_Lines" set "JobCostingLine_RevenueAmountCurrency"=75
          where "JobCostingLine_ID"='a0000000-0000-4000-8000-000000000002';
        changed:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if changed#>>'{chargeTotals,0,amount}'<>'225' or changed->>'reviewToken'=review->>'reviewToken' then
          raise exception 'Changed customer price not reflected'; end if;
        if (select "DOCBRJ_InputSnapshotJSON"#>>'{bookingConfirmation,chargeTotals,0,amount}' from public."DOCB_RenderJobs"
          where "DOCBRJ_ID"='c0000000-0000-4000-8000-000000000001')<>'200' then raise exception 'Old snapshot changed'; end if;
        perform document_api.complete_job_render('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000001','private','path1','v1.pdf','application/pdf',10,'sha');
        if (select "DOCBGD_MetadataJSON"#>>'{documentIssue,status}' from public."DOCB_GeneratedDocuments" where "DOCBGD_ID"='d0000000-0000-4000-8000-000000000001') is distinct from 'draft' then
          raise exception 'Saved file lost its Draft status'; end if;
        insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{}','{}');
        begin perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',review->>'reviewToken',true);
          raise exception 'Stale review accepted'; exception when serialization_failure then null; end;
        perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',changed->>'reviewToken',true);
        update public."Job_Costing_Lines" set "JobCostingLine_RevenueAmountCurrency"=76
          where "JobCostingLine_ID"='a0000000-0000-4000-8000-000000000002';
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','final');
          raise exception 'Changed Booking accepted at issue step'; exception when serialization_failure then null; end;
        update public."Job_Costing_Lines" set "JobCostingLine_RevenueAmountCurrency"=75
          where "JobCostingLine_ID"='a0000000-0000-4000-8000-000000000002';
        perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','final');
        perform document_api.complete_job_render('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',
          'd0000000-0000-4000-8000-000000000002','private','path2','v2.pdf','application/pdf',10,'sha');
        if (select count(*) from public."DOCB_GeneratedDocuments" where "DOCBGD_VersionNo" in (1,2) and "DOCBGD_IsCurrentVersion")<>2 then
          raise exception 'Document versions were not retained'; end if;
        insert into public."DOCB_DocumentTemplates" ("DOCBT_ID","DOCBT_Code","DOCBT_Name") values
          ('b0000000-0000-4000-8000-000000000002','JOB_CONFIRMATION_LAYOUT_2','Booking confirmation · layout 2');
        insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000002',
          '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{}','{}');
        perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004',changed->>'reviewToken',false);
        perform document_api.complete_job_render('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004',
          'd0000000-0000-4000-8000-000000000004','private','path4','layout2.pdf','application/pdf',10,'sha');
        if (select "DOCBGD_VersionNo" from public."DOCB_GeneratedDocuments" where "DOCBGD_ID"='d0000000-0000-4000-8000-000000000004')<>3 then
          raise exception 'Booking variant did not join the same document version sequence'; end if;
        listing:=booking_api.workspace_documents('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if jsonb_array_length(listing)<>3 or listing#>>'{0,metadata,templateCode}'<>'JOB_CONFIRMATION_LAYOUT_2' then
          raise exception 'Documents listing lost a Booking layout or version'; end if;
        if (select count(*) from jsonb_array_elements(listing) item where item->>'documentIssueStatus' in ('draft','final'))<>2 then
          raise exception 'Issue status missing or historical unmarked file relabelled'; end if;
        if has_function_privilege('authenticated','document_api.apply_booking_document_issue(uuid,uuid,text)','EXECUTE')
          or has_function_privilege('anon','document_api.booking_document_issue_options(uuid,uuid)','EXECUTE') then
          raise exception 'Browser role can bypass secure document service'; end if;
        update public."Job_Header" set "Job_Status"='draft' where "Job_ID"='60000000-0000-4000-8000-000000000001';
        review:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if (review->>'provisional')::boolean is not true or (review->>'priceAvailable')::boolean is not false then
          raise exception 'Provisional price gate failed'; end if;
        insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{"meta":{"private":"do not copy"}}','{}');
        begin perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003',review->>'reviewToken',true);
          raise exception 'Provisional customer price was confirmed'; exception when invalid_parameter_value then null; end;
        snapshot:=document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003',review->>'reviewToken',false);
        begin perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','final');
          raise exception 'Provisional Final document allowed'; exception when invalid_parameter_value then null; end;
        perform document_api.apply_booking_document_issue('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','draft');
        if snapshot#>>'{bookingConfirmation,priceStatus}'<>'Price to be confirmed'
          or jsonb_array_length(snapshot#>'{bookingConfirmation,chargeLines}')<>0
          or snapshot::text like '%Private rate%' or snapshot::text like '%do not copy%' then
          raise exception 'Unconfirmed PDF leaked price or private data'; end if;
        update public."Job_Header" set "Job_Status"='open' where "Job_ID"='60000000-0000-4000-8000-000000000001';
        insert into public."Job_Costing_Lines" values
          ('a0000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001',4,
            'European delivery',30,10,'freight',true,null,'{"bookingCharge":{"sellCurrency":"EUR"}}');
        review:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if jsonb_array_length(review->'chargeTotals')<>2
          or review#>>'{chargeTotals,0,currency}'<>'EUR' or review#>>'{chargeTotals,0,amount}'<>'30'
          or review#>>'{chargeTotals,1,currency}'<>'GBP' or review#>>'{chargeTotals,1,amount}'<>'225' then
          raise exception 'Mixed-currency charges were combined incorrectly'; end if;
      end $check$;
      select 'passed';
    `)
    assert.match(result, /passed/)
    // Extend the real PostgreSQL fixture only after the established Booking
    // confirmation lifecycle has passed. Do not replace its original coverage.
    sql(`
      create schema quote_api;
      create function quote_api.cargo_handling(text) returns jsonb language sql as $$ select coalesce(nullif($1,'')::jsonb,'{}'::jsonb) $$;
      create table public."cmp_Company" ("Company_ID" uuid, "Company_Name" text);
      create table public."sys_RefUNLOCO" ("RL_Code" text,"RL_IATA" text,"RL_IsActive" boolean,"RL_HasAirport" boolean);
      insert into public."sys_RefUNLOCO" values ('GBLHR','LHR',true,true),('USJFK','JFK',true,true);
      insert into public."cmp_Company" values ('20000000-0000-4000-8000-000000000001','Example Freight Ltd');
      alter table public."Job_Parties" add column "JobParty_CountryCodeSnapshot" text;
      alter table public."Job_Routing" add column "JobRoute_IsMainCarriage" boolean default true;
      alter table public."Job_Cargo" add column "JobCargo_Commodity" text, add column "JobCargo_HSCode" text,
        add column "JobCargo_IsHazardous" boolean default false, add column "JobCargo_ChargeableWeightKg" numeric;
      alter table public."Job_Containers" add column "JobContainer_JSON" jsonb default '{}',
        add column "JobContainer_GrossKilos" numeric, add column "JobContainer_VGMKilos" numeric;
      create table booking_api.cargo_equipment_allocations(id uuid,job_id uuid,cargo_id uuid,container_id uuid,route_id uuid,
        package_quantity numeric,gross_weight_kg numeric,volume_cbm numeric,created_at timestamptz default now(),is_deleted boolean default false);
      alter table public."DOCB_DocumentTemplates" add column "DOCBT_StatusCode" text default 'published', add column "DOCBT_IsActive" boolean default true;
      create table public."DOCB_TemplateVersions"("DOCBTV_ID" uuid,"DOCBTV_StatusCode" text,"DOCBTV_TemplateSnapshotJSON" jsonb);
      alter table public."DOCB_RenderJobs" add column "DOCBRJ_TemplateVersionID" uuid;
      insert into public."DOCB_DocumentTemplates"("DOCBT_ID","DOCBT_Code","DOCBT_Name") values
        ('b1000000-0000-4000-8000-000000000001','FIATA_BOL_REFERENCE','FIATA Draft');
      insert into public."DOCB_TemplateVersions" values ('f1000000-0000-4000-8000-000000000001','published','{"source":{"sha256":"reviewed-hash"}}');
      insert into public."DOCB_RenderJobs"("DOCBRJ_ID","DOCBRJ_TemplateID","DOCBRJ_JobID","DOCBRJ_CreatedBy",
        "DOCBRJ_StatusCode","DOCBRJ_OutputFormatCode","DOCBRJ_InputSnapshotJSON","DOCBRJ_RenderSettingsJSON","DOCBRJ_TemplateVersionID") values
        ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001','rendering','pdf','{"meta":{"correlationId":"safe-audit-id"}}','{}','f1000000-0000-4000-8000-000000000001');
      update public."Job_Routing" set "JobRoute_ModeCode"='sea' where "Job_ID"='60000000-0000-4000-8000-000000000001';
      insert into public."Job_Containers"("JobContainers_ID","Job_ID","JobContainer_EquipmentKind","JobContainer_TypeCodeSnapshot") values
        ('91000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','container','40GP');
      insert into booking_api.cargo_equipment_allocations(id,job_id,cargo_id,container_id,package_quantity) values
        ('92000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002',1),
        ('92000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003',1);
    `)
    sql(readFileSync(new URL('../migrations/20261001161514_transport_document_draft_mapping.sql', import.meta.url), 'utf8'))
    const transportResult = sql(`
      do $transport$ declare source jsonb; snapshot jsonb;
        mapped jsonb:='{"job":{"reference":"JE-TEST"},"meta":{"transportMappingVersion":1},"documentIssue":{"status":"draft","isLegalOriginal":false},"transport":{"cargo":[{"description":"Fictional parts"}]}}';
      begin
        source:=document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if source#>>'{routing,0,origin,iataCode}'<>'LHR' or source#>>'{routing,0,destination,iataCode}'<>'JFK' then
          raise exception 'Explicit airport reference was not mapped'; end if;
        insert into public."sys_RefUNLOCO" values ('GBLHR','XYZ',true,true);
        source:=document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if source#>'{routing,0,origin,iataCode}'<>'null'::jsonb then raise exception 'Ambiguous airport code guessed'; end if;
        delete from public."sys_RefUNLOCO" where "RL_IATA"='XYZ';
        source:=document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if jsonb_array_length(source->'equipment')<>3 or jsonb_array_length(source->'allocations')<>2
          or source#>>'{allocations,1,packageQuantity}'<>'1' or source#>'{allocations,1,grossWeight}'<>'null'::jsonb
          or source::text like '%Private rate%' or source::text like '%Private cost%' then
          raise exception 'Projection lost unnumbered equipment/splits or included private data'; end if;
        begin perform document_api.transport_document_source('30000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
          raise exception 'Foreign company source allowed'; exception when insufficient_privilege then null; end;
        begin perform document_api.transport_document_source('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001');
          raise exception 'Unlinked colleague source allowed'; exception when insufficient_privilege then null; end;
        insert into public."cmp_Users_Offices" values ('10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001');
        perform document_api.transport_document_source('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001');
        begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
          raise exception 'Another employee froze the creator render'; exception when insufficient_privilege then null; end;
        begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','wrong-hash',mapped);
          raise exception 'Wrong source allowed'; exception when invalid_parameter_value then null; end;
        begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',jsonb_set(mapped,'{documentIssue,status}','"original"'));
          raise exception 'Original allowed'; exception when invalid_parameter_value then null; end;
        update public."Job_Cargo" set "JobCargo_Description"='Changed goods' where "JobCargo_ID"='80000000-0000-4000-8000-000000000001';
        begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
          raise exception 'Stale review allowed'; exception when serialization_failure then null; end;
        source:=document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        snapshot:=document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
        if snapshot#>>'{meta,correlationId}'<>'safe-audit-id' or snapshot#>>'{documentIssue,status}'<>'draft' then
          raise exception 'Draft freeze lost audit metadata'; end if;
        begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
          raise exception 'Frozen Draft changed'; exception when invalid_parameter_value then null; end;
        update public."cmp_Users" set "User_AccessStatus"='disabled' where "Auth_User_ID"='30000000-0000-4000-8000-000000000001';
        begin perform document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
          raise exception 'Revoked actor source allowed'; exception when insufficient_privilege then null; end;
        update public."cmp_Users" set "User_AccessStatus"='active' where "Auth_User_ID"='30000000-0000-4000-8000-000000000001';
        perform document_api.complete_job_render('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
          'd1000000-0000-4000-8000-000000000001','private','draft-path','transport-DRAFT.pdf','application/pdf',10,'sha');
        if (select count(*) from jsonb_array_elements(booking_api.workspace_documents('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001')) item where item->>'typeCode'='transport_draft')<>1 then
          raise exception 'Standard colleague cannot see the saved transport Draft'; end if;
        if has_function_privilege('authenticated','document_api.freeze_transport_document_draft(uuid,uuid,text,text,jsonb)','EXECUTE')
          or has_function_privilege('anon','document_api.transport_document_source(uuid,uuid)','EXECUTE') then raise exception 'Browser can bypass transport service'; end if;
      end $transport$;
      select 'transport passed';
    `)
    assert.match(transportResult, /transport passed/)

    // Use the newer deployed freeze function with the real authorised source
    // above. The House migration's template seeding is outside this fixture.
    const houseMigration = readFileSync(new URL('../migrations/20261001185549_house_transport_review_layouts.sql', import.meta.url), 'utf8')
    sql(houseMigration.slice(houseMigration.indexOf('create or replace function document_api.freeze_transport_document_draft('), houseMigration.lastIndexOf('commit;')))
    for (const [code, mode] of [['HBL', 'sea'], ['HAWB', 'air']]) {
      const houseResult = sql(`
        update public."DOCB_DocumentTemplates" set "DOCBT_Code"='${code}' where "DOCBT_ID"='b1000000-0000-4000-8000-000000000001';
        update public."Job_Routing" set "JobRoute_ModeCode"='${mode}' where "Job_ID"='60000000-0000-4000-8000-000000000001';
        update public."DOCB_RenderJobs" set "DOCBRJ_StatusCode"='rendering',"DOCBRJ_RenderSettingsJSON"='{}',"DOCBRJ_InputSnapshotJSON"='{"meta":{"correlationId":"house-audit"}}'
          where "DOCBRJ_ID"='c1000000-0000-4000-8000-000000000001';
        do $house$ declare source jsonb; mapped jsonb; snapshot jsonb;
        begin
          source:=document_api.transport_document_source('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
          mapped:=jsonb_build_object('job',jsonb_build_object('reference',source#>>'{job,bookingReference}'),
            'meta',jsonb_build_object('transportMappingVersion',1,'transportDocumentCode','${code}','sourceJobId',source->>'jobId','sourceRouteId',source#>>'{routing,0,id}'),
            'issuer',jsonb_build_object('name','Fictional issuer'),
            'documentIssue',jsonb_build_object('status','draft','isLegalOriginal',false));
          begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',jsonb_set(mapped,'{meta,sourceJobId}','"00000000-0000-4000-8000-000000000999"'));
            raise exception 'Wrong House shipment allowed'; exception when invalid_parameter_value then null; end;
          begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',jsonb_set(mapped,'{meta,sourceRouteId}','"00000000-0000-4000-8000-000000000999"'));
            raise exception 'Wrong House route allowed'; exception when invalid_parameter_value then null; end;
          begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',jsonb_set(mapped,'{meta,transportDocumentCode}','"OTHER"'));
            raise exception 'Wrong House layout allowed'; exception when invalid_parameter_value then null; end;
          begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',jsonb_set(mapped,'{documentIssue,status}','"original"'));
            raise exception 'House Original allowed'; exception when invalid_parameter_value then null; end;
          snapshot:=document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
          if snapshot#>>'{meta,correlationId}'<>'house-audit' or snapshot#>>'{issuer,name}'<>'Fictional issuer'
            or snapshot#>>'{documentIssue,status}'<>'draft' or snapshot#>>'{meta,transportDocumentCode}'<>'${code}' then
            raise exception 'House frozen identity lost'; end if;
          begin perform document_api.freeze_transport_document_draft('30000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',source->>'reviewToken','reviewed-hash',mapped);
            raise exception 'House snapshot overwritten'; exception when invalid_parameter_value then null; end;
        end $house$;
        select 'house passed';
      `)
      assert.match(houseResult, /house passed/)
    }
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
