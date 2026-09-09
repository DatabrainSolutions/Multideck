import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pgliteImport = process.env.PGLITE_IMPORT
const bootstrapPath = new URL("./phone-calls-safety-parity-db-fixture.sql", import.meta.url)
const migrationPath = new URL("../migrations/20260823083757_phone_call_crm_safety_and_dexter_watch_parity.sql", import.meta.url)
const matchInvariantPath = new URL("../migrations/20260823100630_phone_call_match_invariant.sql", import.meta.url)
const reviewableLeadTargetPath = new URL("../migrations/20260823103036_phone_call_reviewable_lead_target.sql", import.meta.url)
const confirmedCrmLinksPath = new URL("../migrations/20260823144119_phone_call_confirmed_crm_links.sql", import.meta.url)
const confirmedMatchStatePath = new URL("../migrations/20260823160931_phone_call_confirmed_match_state_invariant.sql", import.meta.url)

test("phone call safety migration applies and its database lifecycle holds", {
  skip: pgliteImport ? false : "Set PGLITE_IMPORT to a local @electric-sql/pglite ESM module URL",
}, async () => {
  const [{ PGlite }, bootstrap, migration, matchInvariant, reviewableLeadTarget, confirmedCrmLinks, confirmedMatchState] = await Promise.all([
    import(pgliteImport),
    readFile(bootstrapPath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(matchInvariantPath, "utf8"),
    readFile(reviewableLeadTargetPath, "utf8"),
    readFile(confirmedCrmLinksPath, "utf8"),
    readFile(confirmedMatchStatePath, "utf8"),
  ])
  const db = new PGlite()
  await db.exec(bootstrap)
  await db.exec(migration)
  await db.exec(matchInvariant)
  await db.exec(reviewableLeadTarget)
  await db.exec(confirmedCrmLinks)
  await db.exec(confirmedMatchState)

  await db.exec(`
    select set_config('request.jwt.claim.role', 'service_role', false);
    insert into public."cmp_Company" values
      ('00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000002');
    insert into public."cmp_Users" values
      ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'active', true, true),
      ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'active', true, true),
      ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'active', false, false);
    insert into public."Org_Master" values
      ('00000000-0000-0000-0000-000000000021', 'Jenkar customer', '00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000022', 'Other workspace', '00000000-0000-0000-0000-000000000002');
    insert into public."Org_Contacts" values
      ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021');
    insert into public."CRM_Leads" values
      ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', false),
      ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022', false),
      ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021', false);
    insert into public."Comm_CallLogs" (
      "CommCall_ID", "CommCall_CompanyID", "CommCall_FromDisplayNameSnapshot",
      "CommCall_FromNumber", "CommCall_DirectionCode", "CommCall_OutcomeCode",
      "CommCall_StartedAt", "CommCall_TranscriptStatusCode", "CommCall_SourceProviderCode"
    ) values (
      '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001',
      'Alex', '+441234', 'inbound', 'answered', now(), 'complete', '3cx'
    );
    insert into public."CRM_CallReviews" (
      "CRMCallReview_ID", "CRMCallReview_CommCallID", "CRMCallReview_CompanyID",
      "CRMCallReview_AISummary", "CRMCallReview_MeetingNotes", "CRMCallReview_CallReason"
    ) values (
      '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000051',
      '00000000-0000-0000-0000-000000000001', 'Quote request', repeat('m', 4100), 'Revised quote'
    );
  `)

  await db.query(`select public.multideck_phone_call_review_match($1,$2,$3,'link',$4,$5,null,1)`, [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000011",
    "00000000-0000-0000-0000-000000000051",
    "00000000-0000-0000-0000-000000000021",
    "00000000-0000-0000-0000-000000000031",
  ])
  const linked = await db.query(`select "CommCall_MatchedOrgID", "CommCall_MatchedContactID" from public."Comm_CallLogs"`)
  assert.equal(linked.rows[0].CommCall_MatchedOrgID, "00000000-0000-0000-0000-000000000021")
  assert.equal(linked.rows[0].CommCall_MatchedContactID, "00000000-0000-0000-0000-000000000031")
  const confirmedContactLinks = await db.query(`
    select "CRMCallEntity_TargetTable", "CRMCallEntity_TargetID", "CRMCallEntity_IsConfirmed"
    from public."CRM_CallEntityLinks"
    where "CRMCallEntity_CallReviewID" = '00000000-0000-0000-0000-000000000061'
    order by "CRMCallEntity_TargetTable"
  `)
  assert.deepEqual(confirmedContactLinks.rows, [
    {
      CRMCallEntity_TargetTable: "Org_Contacts",
      CRMCallEntity_TargetID: "00000000-0000-0000-0000-000000000031",
      CRMCallEntity_IsConfirmed: true,
    },
    {
      CRMCallEntity_TargetTable: "Org_Master",
      CRMCallEntity_TargetID: "00000000-0000-0000-0000-000000000021",
      CRMCallEntity_IsConfirmed: true,
    },
  ])

  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_match($1,$2,$3,'link',$4,null,$5,null)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000051",
      "00000000-0000-0000-0000-000000000021",
      "00000000-0000-0000-0000-000000000042",
    ]),
    /outside this workspace|not linked to the selected company/,
  )
  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_match($1,$2,$3,'link',null,$4,$5,null)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000051",
      "00000000-0000-0000-0000-000000000031",
      "00000000-0000-0000-0000-000000000041",
    ]),
    /contact or a lead, not both/,
  )
  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_match($1,$2,$3,'unmatched',null,null,null,null)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000012",
      "00000000-0000-0000-0000-000000000051",
    ]),
    /denied/,
  )

  await assert.rejects(
    db.exec(`
      update public."Comm_CallLogs"
      set "CommCall_MatchedLeadID" = '00000000-0000-0000-0000-000000000041'
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
    `),
    /cannot be linked to both a contact and a lead/,
  )
  await db.exec(`
    update public."Comm_CallLogs"
    set "CommCall_MatchedOrgID" = null,
        "CommCall_MatchedContactID" = null,
        "CommCall_MatchedLeadID" = '00000000-0000-0000-0000-000000000041'
    where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
  `)
  const derivedLeadCompany = await db.query(`
    select "CommCall_MatchedOrgID"
    from public."Comm_CallLogs"
    where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
  `)
  assert.equal(
    derivedLeadCompany.rows[0].CommCall_MatchedOrgID,
    "00000000-0000-0000-0000-000000000021",
  )
  await assert.rejects(
    db.exec(`
      update public."Comm_CallLogs"
      set "CommCall_MatchedOrgID" = '00000000-0000-0000-0000-000000000022'
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
    `),
    /do not belong to the same company|outside this workspace/,
  )

  await db.exec(`
    insert into public."CRM_CallActionCandidates" (
      "CRMCallAction_ID", "CRMCallAction_CallReviewID", "CRMCallAction_ActionTypeCode",
      "CRMCallAction_Title", "CRMCallAction_DecisionStatus", "CRMCallAction_ActionPayloadJSON",
      "CRMCallAction_SourceKey"
    ) values
      ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000061', 'link_lead', 'Link original lead', 'pending', '{"leadId":"00000000-0000-0000-0000-000000000041"}', 'review-test-edited'),
      ('00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000061', 'link_lead', 'Link inaccessible lead', 'pending', '{"leadId":"00000000-0000-0000-0000-000000000041"}', 'review-test-denied'),
      ('00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000061', 'create_todo', 'Create follow-up', 'pending', '{}', 'review-test-wrong-type'),
      ('00000000-0000-0000-0000-000000000084', '00000000-0000-0000-0000-000000000061', 'link_lead', 'Dexter edited lead', 'pending', '{"leadId":"00000000-0000-0000-0000-000000000043"}', 'review-test-dexter');
  `)
  const editedLead = await db.query(`
    select public.multideck_phone_call_review_action_v2(
      $1, $2, $3, $4, 'approve', null, null, null, 'Operator selected the exact lead', $5
    ) as result
  `, [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000011",
    "00000000-0000-0000-0000-000000000051",
    "00000000-0000-0000-0000-000000000081",
    "00000000-0000-0000-0000-000000000043",
  ])
  assert.equal(editedLead.rows[0].result.status, "edited")
  assert.equal(editedLead.rows[0].result.leadId, "00000000-0000-0000-0000-000000000043")
  const editedLeadState = await db.query(`
    select call."CommCall_MatchedLeadID", call."CommCall_MatchedOrgID", call."CommCall_MatchMethodCode",
      action."CRMCallAction_ActionPayloadJSON", decision."CRMCallDecision_MetadataJSON"
    from public."Comm_CallLogs" call
    join public."CRM_CallActionCandidates" action on action."CRMCallAction_ID" = '00000000-0000-0000-0000-000000000081'
    join public."CRM_CallReviewDecisions" decision on decision."CRMCallDecision_ActionCandidateID" = action."CRMCallAction_ID"
    where call."CommCall_ID" = '00000000-0000-0000-0000-000000000051'
  `)
  assert.equal(editedLeadState.rows[0].CommCall_MatchedLeadID, "00000000-0000-0000-0000-000000000043")
  assert.equal(editedLeadState.rows[0].CommCall_MatchedOrgID, "00000000-0000-0000-0000-000000000021")
  assert.equal(editedLeadState.rows[0].CommCall_MatchMethodCode, "approved_action_edited")
  assert.equal(editedLeadState.rows[0].CRMCallAction_ActionPayloadJSON.leadId, "00000000-0000-0000-0000-000000000043")
  assert.equal(editedLeadState.rows[0].CRMCallDecision_MetadataJSON.originalLeadId, "00000000-0000-0000-0000-000000000041")
  assert.equal(editedLeadState.rows[0].CRMCallDecision_MetadataJSON.reviewedLeadId, "00000000-0000-0000-0000-000000000043")
  const replayedLead = await db.query(`
    select public.multideck_phone_call_review_action_v2(
      $1, $2, $3, $4, 'approve', null, null, null, null, $5
    ) as result
  `, [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000011",
    "00000000-0000-0000-0000-000000000051",
    "00000000-0000-0000-0000-000000000081",
    "00000000-0000-0000-0000-000000000041",
  ])
  assert.equal(replayedLead.rows[0].result.replayed, true)
  assert.equal(replayedLead.rows[0].result.leadId, "00000000-0000-0000-0000-000000000043")

  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_action_v2($1,$2,$3,$4,'approve',null,null,null,null,$5)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000051",
      "00000000-0000-0000-0000-000000000082",
      "00000000-0000-0000-0000-000000000042",
    ]),
    /selected lead is outside this workspace|CRM links do not belong to the same company/,
  )
  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_action_v2($1,$2,$3,$4,'dismiss',null,null,null,null,null)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000012",
      "00000000-0000-0000-0000-000000000051",
      "00000000-0000-0000-0000-000000000082",
    ]),
    /denied/,
  )
  await assert.rejects(
    db.query(`select public.multideck_phone_call_review_action_v2($1,$2,$3,$4,'approve',null,null,null,null,$5)`, [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000051",
      "00000000-0000-0000-0000-000000000083",
      "00000000-0000-0000-0000-000000000041",
    ]),
    /lead target can only be edited for a lead-link suggestion/i,
  )

  const dexterEditedLead = await db.query(`
    select public.multideck_dexter_action_review_phone_call($1, $2, $3::jsonb) as result
  `, [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000011",
    JSON.stringify({
      call_id: "00000000-0000-0000-0000-000000000051",
      target_id: "00000000-0000-0000-0000-000000000084",
      decision: "approve",
      edited_title: null,
      edited_lead_id: "00000000-0000-0000-0000-000000000041",
      scheduled_date: null,
      priority: null,
      reason: "Dexter preserved the operator-selected target",
    }),
  ])
  assert.equal(dexterEditedLead.rows[0].result.status, "edited")
  assert.equal(dexterEditedLead.rows[0].result.leadId, "00000000-0000-0000-0000-000000000041")
  await db.exec(`
    delete from public."CRM_CallReviewDecisions"
    where "CRMCallDecision_ActionCandidateID" in (
      '00000000-0000-0000-0000-000000000081',
      '00000000-0000-0000-0000-000000000084'
    );
    delete from public."CRM_CallActionCandidates" where "CRMCallAction_SourceKey" like 'review-test-%';
  `)

  await db.exec(`
    insert into public."Comm_CallParticipants" (
      "CommCallParticipant_CompanyID", "CommCallParticipant_CallID", "CommCallParticipant_DisplayName",
      "CommCallParticipant_TypeCode", "CommCallParticipant_JoinedAt"
    ) select '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000051',
      'Person ' || n, 'employee', now() + n * interval '1 second' from generate_series(1,13) n;
    insert into public."Comm_CallTranscriptSegments" (
      "CommCallSeg_CallID", "CommCallSeg_SourceProviderCode", "CommCallSeg_ProviderSegmentID",
      "CommCallSeg_SequenceNo", "CommCallSeg_StartedAt", "CommCallSeg_SpeakerLabel",
      "CommCallSeg_SpeakerType", "CommCallSeg_StateCode", "CommCallSeg_Text"
    ) select '00000000-0000-0000-0000-000000000051', '3cx', n::text, n,
      now() + n * interval '1 second', 'Employee', 'employee', 'complete', repeat('t', 1300)
      from generate_series(1,41) n;
    insert into public."CRM_CallActionCandidates" (
      "CRMCallAction_CallReviewID", "CRMCallAction_ActionTypeCode", "CRMCallAction_Title",
      "CRMCallAction_Description", "CRMCallAction_ConfidenceScore", "CRMCallAction_DecisionStatus",
      "CRMCallAction_SourceKey"
    ) select '00000000-0000-0000-0000-000000000061', 'create_todo', 'Suggestion ' || n,
      'Evidence', 0.8, 'pending', 'source-' || n from generate_series(1,9) n;
    select set_config('app.test_user_id', '00000000-0000-0000-0000-000000000011', false);
    select set_config('app.test_company_id', '00000000-0000-0000-0000-000000000001', false);
  `)
  const dexter = await db.query(`select public.multideck_dexter_domain_phone_calls($1, null, 25) as calls`, [
    "00000000-0000-0000-0000-000000000001",
  ])
  const phoneCall = dexter.rows[0].calls[0]
  assert.equal(phoneCall.participants.length, 12)
  assert.equal(phoneCall.transcriptSegments.length, 40)
  assert.equal(phoneCall.transcriptSegments[0].text.length, 1200)
  assert.equal(phoneCall.pendingSuggestions.length, 8)
  assert.equal(phoneCall.pendingSuggestionCount, 9)
  assert.equal(phoneCall.meetingNotes.length, 4000)
  assert.equal(phoneCall.pendingSuggestions[0].requiresReview, true)

  await assert.rejects(
    db.query(`select public.multideck_dexter_domain_phone_calls($1, null, 10)`, [
      "00000000-0000-0000-0000-000000000002",
    ]),
    /outside this workspace or permission/,
  )

  await db.exec(`
    update public."Comm_CallLogs" set
      "CommCall_MatchedOrgID" = null, "CommCall_MatchedContactID" = null,
      "CommCall_MatchedLeadID" = null,
      "CommCall_MatchStatusCode" = 'unmatched';
    insert into public."AI_DexterWatches" (
      "AIDexterWatch_ID", "AIDexterWatch_CompanyID", "AIDexterWatch_OwnerUserID",
      "AIDexterWatch_CapabilityCode", "AIDexterWatch_StatusCode"
    ) values (
      '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000011', 'phone_calls', 'active'
    );
  `)
  await assert.rejects(
    db.exec(`
      update public."Comm_CallLogs"
      set "CommCall_MatchedOrgID" = '00000000-0000-0000-0000-000000000021'
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
    `),
    /require an operator-reviewed or approved match|CK_Comm_CallLogs_confirmed_match_links/,
  )
  await assert.rejects(
    db.exec(`
      update public."Comm_CallLogs"
      set "CommCall_MatchedOrgID" = '00000000-0000-0000-0000-000000000021',
          "CommCall_MatchStatusCode" = 'matched',
          "CommCall_MatchMethodCode" = 'fuzzy'
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051'
    `),
    /require an operator-reviewed or approved match|CK_Comm_CallLogs_confirmed_match_links/,
  )
  await db.exec(`
    update public."Comm_CallLogs"
    set "CommCall_MatchedOrgID" = '00000000-0000-0000-0000-000000000021',
        "CommCall_MatchStatusCode" = 'matched',
        "CommCall_MatchMethodCode" = 'user_review'
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051';
  `)
  let signals = await db.query(`select * from public."AI_DexterWatchSignals" order by "AIDexterWatchSignal_ID"`)
  assert.equal(signals.rows.length, 1)
  assert.equal(signals.rows[0].AIDexterWatchSignal_OldJSON.companyId, null)
  assert.equal(signals.rows[0].AIDexterWatchSignal_NewJSON.companyName, "Jenkar customer")

  await db.exec(`
    update public."Comm_CallLogs" set "CommCall_MatchedOrgID" = "CommCall_MatchedOrgID"
      where "CommCall_ID" = '00000000-0000-0000-0000-000000000051';
  `)
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 1)

  await db.exec(`
    delete from public."AI_DexterWatchSignals";
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode" = 'paused';
    update public."Comm_CallLogs" set "CommCall_OutcomeCode" = 'missed';
  `)
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 0)

  await db.exec(`
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode" = 'active';
    update public."Comm_CallLogs" set "CommCall_OutcomeCode" = 'answered';
  `)
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 1)

  await db.exec(`
    delete from public."AI_DexterWatchSignals";
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode" = 'paused';
    insert into public."AI_DexterWatches" (
      "AIDexterWatch_ID", "AIDexterWatch_CompanyID", "AIDexterWatch_OwnerUserID",
      "AIDexterWatch_CapabilityCode", "AIDexterWatch_StatusCode"
    ) values (
      '00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000013', 'phone_calls', 'active'
    );
    update public."Comm_CallLogs" set "CommCall_OutcomeCode" = 'missed';
  `)
  const deniedWatch = await db.query(`select "AIDexterWatch_StatusCode" from public."AI_DexterWatches" where "AIDexterWatch_ID" = '00000000-0000-0000-0000-000000000072'`)
  assert.equal(deniedWatch.rows[0].AIDexterWatch_StatusCode, "paused")
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 0)

  await db.exec(`
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode" = 'active'
      where "AIDexterWatch_ID" = '00000000-0000-0000-0000-000000000071';
    insert into public."Comm_CallLogs" (
      "CommCall_ID", "CommCall_CompanyID", "CommCall_StartedAt"
    ) values (
      '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', now()
    );
    delete from public."AI_DexterWatchSignals";
    insert into public."CRM_CallReviews" (
      "CRMCallReview_ID", "CRMCallReview_CommCallID", "CRMCallReview_CompanyID", "CRMCallReview_CallReason"
    ) values (
      '00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000052',
      '00000000-0000-0000-0000-000000000001', 'First reason'
    );
  `)
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 1)
  await db.exec(`update public."CRM_CallReviews" set "CRMCallReview_CallReason" = 'First reason' where "CRMCallReview_ID" = '00000000-0000-0000-0000-000000000062'`)
  signals = await db.query(`select count(*)::integer as count from public."AI_DexterWatchSignals"`)
  assert.equal(signals.rows[0].count, 1)

  await db.exec(`
    insert into public."Comm_CallIngestionEvents" (
      "CommCallEvent_CompanyID", "CommCallEvent_ProviderCode", "CommCallEvent_ExternalEventID",
      "CommCallEvent_StatusCode", "CommCallEvent_RawPayloadJSON", "CommCallEvent_MetadataJSON",
      "CommCallEvent_RetentionUntil", "CommCallEvent_ErrorMessage", "CommCallEvent_NextAttemptAt"
    ) values
      ('00000000-0000-0000-0000-000000000001', 'twilio', 'expired-a', 'retryable', '{"phone":"+441234"}', '{"participant":"Alex"}', now() - interval '1 day', 'PII', now()),
      ('00000000-0000-0000-0000-000000000002', 'twilio', 'expired-b', 'retryable', '{"phone":"+449999"}', '{}', now() - interval '1 day', 'PII', now());
  `)
  const purged = await db.query(`select public.multideck_phone_call_purge_expired_events($1, 100) as count`, [
    "00000000-0000-0000-0000-000000000001",
  ])
  assert.equal(purged.rows[0].count, 1)
  const events = await db.query(`select "CommCallEvent_ExternalEventID", "CommCallEvent_RawPayloadJSON", "CommCallEvent_StatusCode" from public."Comm_CallIngestionEvents" order by "CommCallEvent_ExternalEventID"`)
  assert.deepEqual(events.rows[0].CommCallEvent_RawPayloadJSON, {})
  assert.equal(events.rows[0].CommCallEvent_StatusCode, "terminal")
  assert.deepEqual(events.rows[1].CommCallEvent_RawPayloadJSON, { phone: "+449999" })
})
