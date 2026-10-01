import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const bin = process.env.PG_TEST_BIN || spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' }).stdout.trim()
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

test('saving a published template keeps the approved version current until review', () => {
  const directory = mkdtempSync(join(tmpdir(), 'document-review-'))
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
    sql(`create role service_role; create role authenticated; create role anon; create schema document_api;
      grant usage on schema document_api to service_role, authenticated, anon;
      create table public."cmp_Users"("User_ID" uuid,"Auth_User_ID" uuid,"User_AccessStatus" text);
      create table public."DOCB_DocumentTemplates"("DOCBT_ID" uuid,"DOCBT_Code" text,"DOCBT_StatusCode" text,"DOCBT_CurrentVersionNo" integer,"DOCBT_IsActive" boolean,"DOCBT_IsUserEditable" boolean,"DOCBT_DefaultRenderEngineCode" text,"DOCBT_UpdatedAt" timestamptz,"DOCBT_UpdatedBy" uuid);
      create table public."DOCB_TemplateVersions"("DOCBTV_ID" uuid,"DOCBTV_TemplateID" uuid,"DOCBTV_VersionNo" integer,"DOCBTV_StatusCode" text,"DOCBTV_PublishedAt" timestamptz,"DOCBTV_PublishedBy" uuid,"DOCBTV_TemplateSnapshotJSON" jsonb);
      create table public."DOC_StoredObjects"("DOCStoredObject_ID" uuid,"DOCStoredObject_AggregateType" text,"DOCStoredObject_AggregateID" uuid,"DOCStoredObject_Container" text,"DOCStoredObject_BlobName" text,"DOCStoredObject_OriginalFileName" text,"DOCStoredObject_MimeType" text,"DOCStoredObject_StatusCode" text,"DOCStoredObject_DeletedAt" timestamptz);
      create function document_api.has_permission(actor uuid, code text) returns boolean language sql as $$select actor in ('${id(101)}'::uuid,'${id(103)}'::uuid,'${id(104)}'::uuid,'${id(105)}'::uuid) and code='Documents.Manage'$$;
      create function document_api.register_studio_template_version(actor uuid, template_id uuid, provider_id text, version_id text) returns jsonb language plpgsql as $$declare next_version integer; begin
        select coalesce(max("DOCBTV_VersionNo"),0)+1 into next_version from public."DOCB_TemplateVersions" where "DOCBTV_TemplateID"=template_id;
        insert into public."DOCB_TemplateVersions" values ('${id(1000)}',template_id,next_version,'draft',null,null,jsonb_build_object('carbone',jsonb_build_object('versionId',version_id),'source',jsonb_build_object('provider','supabase_storage','path','source/'||next_version)));
        return jsonb_build_object('multideckVersion',next_version,'status','draft'); end$$;
      create function document_api.approve_studio_template_version(actor uuid, template_id uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
      insert into public."cmp_Users" values ('${id(1)}','${id(101)}','active'), ('${id(3)}','${id(103)}','active'), ('${id(4)}','${id(104)}','inactive');
      insert into public."DOCB_DocumentTemplates" values ('${id(10)}','SAMPLE','published',1,true,true,'carbone',now(),'${id(1)}');
      insert into public."DOCB_TemplateVersions" values ('${id(11)}','${id(10)}',1,'published',now(),'${id(1)}','{"carbone":{"versionId":"${'a'.repeat(64)}"}}');
      ${readFileSync(new URL('../migrations/20260925123314_review_document_templates.sql', import.meta.url), 'utf8')}`)
    const saved = JSON.parse(sql(`select document_api.register_studio_template_version('${id(101)}','${id(10)}','123','${'b'.repeat(64)}')`))
    assert.equal(saved.status, 'draft')
    assert.equal(sql(`select "DOCBT_CurrentVersionNo" from public."DOCB_DocumentTemplates" where "DOCBT_ID"='${id(10)}'`), '1')
    assert.equal(sql(`select "DOCBTV_StatusCode" from public."DOCB_TemplateVersions" where "DOCBTV_TemplateID"='${id(10)}' and "DOCBTV_VersionNo"=2`), 'draft')
    sql(`insert into public."DOC_StoredObjects" values ('${id(20)}','document_template_version_source','${id(1000)}','multideck-template-sources','templates/${id(10)}/source/example.docx','example.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','active',null);
      update public."DOCB_TemplateVersions" set "DOCBTV_TemplateSnapshotJSON"=jsonb_set("DOCBTV_TemplateSnapshotJSON",'{source,storedObjectId}','"${id(20)}"') where "DOCBTV_TemplateID"='${id(10)}' and "DOCBTV_VersionNo"=2;
      ${readFileSync(new URL('../migrations/20260925123316_read_document_template_draft.sql', import.meta.url), 'utf8')}`)
    const draft = JSON.parse(sql(`select document_api.studio_template_draft_source('${id(101)}','${id(10)}')`))
    assert.equal(draft.bucket, 'multideck-template-sources')
    assert.equal(draft.multideckVersion, 2)
    assert.equal(draft.fileName, 'example.docx')
    sql(`do $$begin perform document_api.studio_template_draft_source('${id(102)}','${id(10)}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end$$;`)
    const approved = JSON.parse(sql(`select document_api.approve_studio_template_version('${id(101)}','${id(10)}')`))
    assert.equal(approved.status, 'published')
    assert.equal(sql(`select "DOCBT_CurrentVersionNo" from public."DOCB_DocumentTemplates" where "DOCBT_ID"='${id(10)}'`), '2')
    assert.equal(sql(`select document_api.studio_template_draft_source('${id(101)}','${id(10)}') is null`), 't')
    sql(`alter table public."DOCB_DocumentTemplates" add column "DOCBT_Name" text default 'Booking confirmation';`)
    const choices = readFileSync(new URL('../migrations/20260929144212_booking_confirmation_template_choices.sql', import.meta.url), 'utf8')
    sql(choices.slice(choices.indexOf('create or replace function document_api.is_booking_confirmation_template_code'), choices.indexOf('create or replace function document_api.prepare_booking_confirmation')))
    assert.equal(sql(`select document_api.is_booking_confirmation_template_code('JOB_CONFIRMATION_LAYOUT_2')`), 't')
    assert.equal(sql(`select document_api.is_booking_confirmation_template_code('OTHER_TEMPLATE')`), 'f')
    sql(`update public."DOCB_DocumentTemplates" set "DOCBT_Code"='JOB_CONFIRMATION' where "DOCBT_ID"='${id(10)}';
      update public."DOCB_TemplateVersions" set "DOCBTV_TemplateSnapshotJSON"=jsonb_set("DOCBTV_TemplateSnapshotJSON",'{source,storedObjectId}','"${id(20)}"') where "DOCBTV_TemplateID"='${id(10)}' and "DOCBTV_VersionNo"=2;`)
    const publishedSource = JSON.parse(sql(`select document_api.studio_booking_published_source('${id(101)}','${id(10)}')`))
    assert.equal(publishedSource.code, 'JOB_CONFIRMATION')
    assert.equal(publishedSource.bucket, 'multideck-template-sources')
    sql(`do $$begin perform document_api.studio_booking_published_source('${id(102)}','${id(10)}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end$$;`)

    // All published layouts open without operational Job tables or a Job number.
    sql(readFileSync(new URL('../migrations/20261001093644_read_published_template_layout_source.sql', import.meta.url), 'utf8'))
    for (const code of ['JOB_CONFIRMATION', 'FIATA_BOL', 'MAWB', 'MNG_AWB']) {
      sql(`update public."DOCB_DocumentTemplates" set "DOCBT_Code"='${code}' where "DOCBT_ID"='${id(10)}';`)
      const source = JSON.parse(sql(`set role service_role; select document_api.studio_template_layout_source('${id(103)}','${id(10)}')`))
      assert.equal(source.templateCode, code)
      assert.equal(source.status, 'published')
      assert.equal(source.multideckVersion, 2)
      assert.equal(source.bucket, 'multideck-template-sources')
    }
    // A foreign/standard colleague, inactive member, unlinked identity or null
    // actor must not gain access through the privileged Edge Function reader.
    for (const actor of [id(102), id(104), id(105), null]) {
      sql(`do $$begin perform document_api.studio_template_layout_source(${actor ? `'${actor}'` : 'null'},'${id(10)}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end$$;`)
    }
    for (const role of ['anon', 'authenticated']) {
      sql(`set role ${role}; do $$begin perform document_api.studio_template_layout_source('${id(101)}','${id(10)}'); raise exception 'Expected denial'; exception when insufficient_privilege then null; end$$;`)
    }
    // Source integrity fails closed, even when an earlier published source exists.
    sql(`insert into public."DOC_StoredObjects" values ('${id(21)}','document_template_version_source','${id(11)}','multideck-template-sources','old.docx','old.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','active',null);
      update public."DOCB_TemplateVersions" set "DOCBTV_TemplateSnapshotJSON"=jsonb_set("DOCBTV_TemplateSnapshotJSON",'{source}','{"storedObjectId":"${id(21)}"}') where "DOCBTV_ID"='${id(11)}';`)
    for (const invalid of [
      `"DOCStoredObject_Container"='another-tenant-bucket'`,
      `"DOCStoredObject_AggregateID"='${id(11)}'`,
      `"DOCStoredObject_AggregateType"='generated_document'`,
      `"DOCStoredObject_StatusCode"='inactive'`,
      `"DOCStoredObject_DeletedAt"=now()`,
    ]) {
      sql(`begin; update public."DOC_StoredObjects" set ${invalid} where "DOCStoredObject_ID"='${id(20)}';
        do $$begin if document_api.studio_template_layout_source('${id(101)}','${id(10)}') is not null then raise exception 'Expected unavailable source'; end if; end$$; rollback;`)
    }
    for (const unavailable of [`"DOCBT_IsActive"=false`, `"DOCBT_IsUserEditable"=false`, `"DOCBT_StatusCode"='retired'`]) {
      sql(`begin; update public."DOCB_DocumentTemplates" set ${unavailable} where "DOCBT_ID"='${id(10)}';
        do $$begin if document_api.studio_template_layout_source('${id(101)}','${id(10)}') is not null then raise exception 'Expected unavailable template'; end if; end$$; rollback;`)
    }
    sql(`insert into public."DOCB_TemplateVersions" values ('${id(1001)}','${id(10)}',3,'draft',null,null,'{"source":{"storedObjectId":"${id(22)}"}}');
      insert into public."DOC_StoredObjects" values ('${id(22)}','document_template_version_source','${id(1001)}','multideck-template-sources','revision.docx','revision.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','active',null);`)
    const revision = JSON.parse(sql(`select document_api.studio_template_layout_source('${id(101)}','${id(10)}')`))
    assert.equal(revision.status, 'draft')
    assert.equal(revision.multideckVersion, 3)
    assert.equal(sql(`select "DOCBT_CurrentVersionNo" from public."DOCB_DocumentTemplates" where "DOCBT_ID"='${id(10)}'`), '2')
    sql(`update public."DOCB_DocumentTemplates" set "DOCBT_StatusCode"='draft' where "DOCBT_ID"='${id(10)}';`)
    assert.equal(JSON.parse(sql(`select document_api.studio_template_layout_source('${id(101)}','${id(10)}')`)).status, 'draft')
  } finally {
    if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
