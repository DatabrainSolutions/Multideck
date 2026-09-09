import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migration = await readFile(
  new URL("../migrations/20260902131200_booking_document_groups.sql", import.meta.url),
  "utf8",
)
const acceptedQuoteDocuments = await readFile(
  new URL("../migrations/20260904153000_booking_accepted_quote_documents.sql", import.meta.url),
  "utf8",
)

test("booking documents are assembled from tenant-scoped quote and job sources", () => {
  assert.match(migration, /create or replace function booking_api\.workspace_documents/u)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/u)
  assert.match(migration, /booking_api\.has_permission\(caller_auth_user_id, 'Bookings\.Read'\)/u)
  assert.match(migration, /office\."Company_ID" = app_user\."Company_ID"/u)
  assert.match(migration, /quote_office\."Company_ID" = app_user\."Company_ID"/u)
  assert.match(migration, /creator\."Company_ID" = app_user\."Company_ID"/u)
  assert.match(migration, /from public\."Job_Documents" document/u)
  assert.match(migration, /from public\."DOC_StoredObjects" stored/u)
  assert.match(migration, /"DOCStoredObject_ConcernCode" = 'quote'/u)
  assert.match(migration, /"DOCStoredObject_AggregateType" = 'CusQuote_Header'/u)
})

test("booking documents retain quote, job and Customs categories", () => {
  assert.match(migration, /'category', 'quote'/u)
  assert.match(migration, /then 'customs'[\s\S]*else 'job'/u)
  assert.match(migration, /from public\."Customs_Documents" customs_document/u)
  assert.match(migration, /join public\."Customs_Declarations" declaration/u)
  assert.match(migration, /"CUSTD_JobDocumentID" = document\."JobDoc_ID"/u)
  assert.match(migration, /create index if not exists "IX_Customs_Documents_job_document"/u)
  assert.match(migration, /case category when 'quote' then 1 when 'job' then 2 else 3 end/u)
})

test("the current booking feed exposes accepted quote PDFs only", () => {
  assert.match(acceptedQuoteDocuments, /version\."CusQuoteVersion_StatusCode" = 'accepted'/u)
  assert.match(acceptedQuoteDocuments, /link\.delivery_status_code = 'sent'/u)
  assert.match(acceptedQuoteDocuments, /'appliedToBooking'/u)
})

test("the public booking RPCs expose grouped documents without broad database access", () => {
  assert.match(migration, /create or replace function booking_api\.workspace_with_document_groups/u)
  assert.match(migration, /booking_api\.workspace_extended\(caller_auth_user_id, requested_reference\)/u)
  assert.match(migration, /booking_api\.workspace_documents\(caller_auth_user_id, job_id\)/u)
  assert.match(migration, /create or replace function public\.booking_workflow_workspace/u)
  assert.match(migration, /create or replace function public\.booking_workflow_save/u)
  assert.match(migration, /revoke all on function booking_api\.workspace_documents\(uuid, uuid\) from public, anon, authenticated/u)
  assert.match(migration, /grant execute on function public\.booking_workflow_workspace\(uuid, text\) to service_role/u)
  assert.doesNotMatch(migration, /create table/u)
  assert.doesNotMatch(migration, /tenant_id/u)
})
