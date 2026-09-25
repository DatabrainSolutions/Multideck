import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = process.env.PG_TEST_BIN || spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout.trim()
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

test('unified document register keeps colleague access, history and company denial', () => {
  assert.equal(spawnSync(join(bin, 'initdb'), ['--version']).status, 0, 'PostgreSQL is required')
  const directory = mkdtempSync(join(tmpdir(), 'document-library-'))
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const sql = input => run('psql', ['-X', '-qAt', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input).trim()
  try {
    run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`create role service_role; create role authenticated; create role anon;
      create schema document_api; create schema booking_api; create schema quote_api;
      create table public."cmp_Users"("User_ID" uuid,"Auth_User_ID" uuid,"Company_ID" uuid,"User_AccessStatus" text);
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table public."cmp_LegalEntities"("LegalEntity_ID" uuid,"Company_ID" uuid);
      create table public."cmp_Users_Offices"("User_ID" uuid,"Office_ID" uuid);
      create table public."Org_Master"("Org_id" uuid,"Org_Name" text);
      create table public."Job_Header"("Job_ID" uuid,"Job_OrgOfficeID" uuid,"Job_OfficeID" uuid,"Job_IsDeleted" boolean,"Job_BookingReference" text,"Job_Period" text,"Job_Number" integer,"Job_Customer" uuid);
      create table public."DOCB_RenderJobs"("DOCBRJ_ID" uuid,"DOCBRJ_JobID" uuid,"DOCBRJ_StatusCode" text);
      create table public."DOCB_DocumentTemplates"("DOCBT_ID" uuid,"DOCBT_Name" text);
      create table public."DOCB_GeneratedDocuments"("DOCBGD_ID" uuid,"DOCBGD_RenderJobID" uuid,"DOCBGD_TemplateID" uuid,"DOCBGD_FileName" text,"DOCBGD_CreatedAt" timestamptz,"DOCBGD_VersionNo" integer,"DOCBGD_MimeType" text,"DOCBGD_FileSizeBytes" bigint,"DOCBGD_StorageBucket" text,"DOCBGD_StoragePath" text);
      create table public."DOC_StoredObjects"("DOCStoredObject_ID" uuid,"DOCStoredObject_Container" text,"DOCStoredObject_BlobName" text,"DOCStoredObject_OriginalFileName" text,"DOCStoredObject_MimeType" text,"DOCStoredObject_FileSizeBytes" bigint,"DOCStoredObject_CreatedAt" timestamptz,"DOCStoredObject_StatusCode" text,"DOCStoredObject_DeletedAt" timestamptz,"DOCStoredObject_ConcernCode" text,"DOCStoredObject_AggregateType" text,"DOCStoredObject_AggregateID" uuid);
      create table public."Job_Documents"("JobDoc_ID" uuid,"JobDoc_JobID" uuid,"JobDoc_StoredObjectID" uuid,"JobDoc_Title" text,"JobDoc_DocTypeCodeSnapshot" text,"JobDoc_FileName" text,"JobDoc_CreatedAt" timestamptz,"JobDoc_Status" text,"JobDoc_VersionNo" integer,"JobDoc_FileMimeType" text,"JobDoc_FileSizeBytes" bigint,"JobDoc_IsDeleted" boolean);
      create table public."CusQuote_Header"("CusQuoteHeader_ID" uuid,"CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,"CusQuoteHeader_IsDeleted" boolean,"CusQuoteHeader_CustomerReference" text,"CusQuoteHeader_Number" integer,"CusQuoteHeader_CustomerID" uuid);
      create table public."CusQuote_Versions"("CusQuoteVersion_ID" uuid,"CusQuoteHeader_ID" uuid,"CusQuoteVersion_StatusCode" text,"CusQuoteVersion_Number" integer);
      create table public."FIN_Documents"("FINDoc_ID" uuid,"FINDoc_LegalEntityID" uuid,"FINDoc_TypeCode" text,"FINDoc_StatusCode" text,"FINDoc_Number" text,"FINDoc_PartyOrgID" uuid);
      create table quote_api.customer_response_links(quote_id uuid,quote_version_id uuid,quote_document_id uuid,company_id uuid,delivery_status_code text);
      create table public."Customs_Declarations"("CUST_id" uuid,"CUST_IsDeleted" boolean,"CUST_LocalReferenceNumber" text,"CUST_JobID" uuid,"CUST_Direction" text);
      create table public."Customs_DeclarationDocuments"("CUSTD_ID" uuid,"CUSTD_CustomsID" uuid,"CUSTD_FileName" text,"CUSTD_MRN" text,"CUSTD_ReceivedAt" timestamptz,"CUSTD_ProviderStatus" text,"CUSTD_MimeType" text,"CUSTD_FileSizeBytes" bigint,"CUSTD_StorageBucket" text,"CUSTD_StoragePath" text);
      create table public.test_permission(actor uuid,code text);
      create function document_api.has_permission(actor uuid,code text) returns boolean language sql stable as $$select exists(select 1 from public.test_permission where actor=$1 and code=$2)$$;
      create function booking_api.has_permission(actor uuid,code text) returns boolean language sql stable as $$select exists(select 1 from public.test_permission where actor=$1 and code=$2)$$;
      create function quote_api.has_permission(actor uuid,code text) returns boolean language sql stable as $$select exists(select 1 from public.test_permission where actor=$1 and code=$2)$$;
      create function public.customs_declaration_authorised(actor uuid,declaration_id uuid,require_write boolean,require_draft boolean) returns boolean language sql stable as $$select exists(select 1 from public."Customs_Declarations" d join public."Job_Header" j on j."Job_ID"=d."CUST_JobID" join public."cmp_Users" u on u."Auth_User_ID"=$1 join public."cmp_Offices" o on o."Office_ID"=j."Job_OrgOfficeID" where d."CUST_id"=$2 and o."Company_ID"=u."Company_ID")$$;
      ${readFileSync(new URL('../migrations/20260925110548_unified_document_register.sql', import.meta.url), 'utf8')}
      insert into public."cmp_Users" values ('${id(1)}','${id(101)}','${id(900)}','active'),('${id(2)}','${id(102)}','${id(900)}','active'),('${id(3)}','${id(103)}','${id(901)}','active');
      insert into public."cmp_Offices" values ('${id(20)}','${id(900)}'),('${id(21)}','${id(901)}');
      insert into public."cmp_Users_Offices" values ('${id(1)}','${id(20)}'),('${id(2)}','${id(20)}'),('${id(3)}','${id(21)}');
      insert into public.test_permission select actor,code from (values ('${id(101)}'::uuid),('${id(102)}'::uuid),('${id(103)}'::uuid)) a(actor) cross join (values ('Documents.Read'),('Bookings.Read'),('Quotes.Read'),('Customs.Read'),('Finance.Receivables.View')) c(code);
      insert into public."cmp_LegalEntities" values ('${id(22)}','${id(900)}'),('${id(23)}','${id(901)}');
      insert into public."Org_Master" values ('${id(50)}','Sample Customer');
      insert into public."Job_Header" values ('${id(30)}','${id(20)}',null,false,'BK-30','2026',30,'${id(50)}'),('${id(31)}','${id(21)}',null,false,'BK-31','2026',31,'${id(50)}');
      insert into public."DOCB_DocumentTemplates" values ('${id(40)}','Booking Confirmation');
      insert into public."DOCB_RenderJobs" values ('${id(41)}','${id(30)}','completed'),('${id(42)}','${id(31)}','completed');
      insert into public."DOCB_GeneratedDocuments" values ('${id(43)}','${id(41)}','${id(40)}','booking-v1.pdf',now(),1,'application/pdf',100,'private','job/v1.pdf'),('${id(44)}','${id(41)}','${id(40)}','booking-v2.pdf',now(),2,'application/pdf',100,'private','job/v2.pdf'),('${id(45)}','${id(42)}','${id(40)}','foreign-booking.pdf',now(),1,'application/pdf',100,'private','job/foreign.pdf');
      insert into public."DOC_StoredObjects" values ('${id(60)}','private','booking/packing.pdf','packing.pdf','application/pdf',100,now(),'active',null,'booking','Job_Header','${id(30)}'),('${id(61)}','private','quote/sent.pdf','sent-quote.pdf','application/pdf',100,now(),'active',null,'quote','CusQuote_Header','${id(70)}'),('${id(63)}','private','finance/invoice.pdf','freight-invoice.pdf','application/pdf',100,now(),'active',null,'finance','finance_document','${id(90)}');
      insert into public."Job_Documents" values ('${id(62)}','${id(30)}','${id(60)}','Packing list','packing_list','packing.pdf',now(),'ready',1,'application/pdf',100,false);
      insert into public."CusQuote_Header" values ('${id(70)}','${id(20)}',null,false,'Q-70',70,'${id(50)}');
      insert into public."CusQuote_Versions" values ('${id(71)}','${id(70)}','accepted',1);
      insert into public."FIN_Documents" values ('${id(90)}','${id(22)}','sl_invoice','approved','INV-90','${id(50)}');
      insert into quote_api.customer_response_links values ('${id(70)}','${id(71)}','${id(61)}','${id(900)}','sent');`)
    sql(`insert into public."Customs_Declarations" values ('${id(80)}',false,'CUST-80','${id(30)}','import');
      insert into public."Customs_DeclarationDocuments" values ('${id(81)}','${id(80)}','declaration.pdf','MRN-80',now(),'accepted','application/pdf',100,'private','customs/declaration.pdf');`)

    const colleague = JSON.parse(sql(`select document_api.unified_documents_page('${id(102)}',null,20,0)`))
    assert.equal(colleague.total, 6)
    assert.ok(colleague.rows.some(row => row.file_name === 'booking-v1.pdf'))
    assert.ok(colleague.rows.some(row => row.file_name === 'sent-quote.pdf'))
    assert.ok(colleague.rows.some(row => row.file_name === 'declaration.pdf'))
    assert.ok(colleague.rows.some(row => row.file_name === 'freight-invoice.pdf'))
    assert.ok(!colleague.rows.some(row => row.file_name === 'foreign-booking.pdf'))
    assert.equal(JSON.parse(sql(`select document_api.unified_documents_page('${id(102)}',null,2,1)`)).rows.length, 2)
    assert.equal(JSON.parse(sql(`select document_api.authorize_unified_download('${id(102)}','generated','${id(43)}')`)).path, 'job/v1.pdf')
    assert.equal(JSON.parse(sql(`select document_api.authorize_unified_download('${id(102)}','quote_pdf','${id(61)}')`)).path, 'quote/sent.pdf')
    assert.equal(JSON.parse(sql(`select document_api.authorize_unified_download('${id(102)}','customs_declaration','${id(81)}')`)).path, 'customs/declaration.pdf')
    assert.equal(JSON.parse(sql(`select document_api.authorize_unified_download('${id(102)}','finance_pdf','${id(63)}')`)).path, 'finance/invoice.pdf')
    assert.equal(JSON.parse(sql(`select document_api.unified_documents_page('${id(103)}',null,20,0)`)).total, 1)
    const denied = spawnSync(join(bin, 'psql'), ['-X','-qAt','-h',directory,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], { input: `select document_api.authorize_unified_download('${id(103)}','quote_pdf','${id(61)}');`, encoding: 'utf8' })
    assert.notEqual(denied.status, 0)
    assert.match(denied.stderr, /not authorised/i)
  } finally {
    if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
