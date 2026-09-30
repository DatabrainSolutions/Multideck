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
        "DOCBGD_FileSizeBytes" bigint, "DOCBGD_CreatedAt" timestamptz default now());
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
        snapshot:=document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',review->>'reviewToken',true);
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
        insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{}','{}');
        begin perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',review->>'reviewToken',true);
          raise exception 'Stale review accepted'; exception when serialization_failure then null; end;
        perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002',changed->>'reviewToken',true);
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
        update public."Job_Header" set "Job_Status"='draft' where "Job_ID"='60000000-0000-4000-8000-000000000001';
        review:=document_api.booking_confirmation_review('30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
        if (review->>'provisional')::boolean is not true or (review->>'priceAvailable')::boolean is not false then
          raise exception 'Provisional price gate failed'; end if;
        insert into public."DOCB_RenderJobs" values ('c0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001',
          '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rendering','pdf','{"meta":{"private":"do not copy"}}','{}');
        begin perform document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003',review->>'reviewToken',true);
          raise exception 'Provisional customer price was confirmed'; exception when invalid_parameter_value then null; end;
        snapshot:=document_api.prepare_booking_confirmation('30000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003',review->>'reviewToken',false);
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
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
