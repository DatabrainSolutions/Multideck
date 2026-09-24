// Deterministic examples exclusively in the disposable preview database.
// Workflow transitions use the production RPCs; event timestamps are aged only here
// so stage measurement can be visually checked without waiting several weeks.
export function seedCrmSalesPreview(sql, ok) {
 ok(sql(`
 select login(1);
 select multideck_crm_update_deal(fid(1),deal_version(1),jsonb_build_object('expectedCloseDate',(current_date-5)::text,'customerNeed','Reliable weekly departures and a clear escalation contact.','valueProposition','A scheduled collection window with a named operations contact.'));
 select multideck_crm_update_deal(fid(1),deal_version(1),jsonb_build_object('expectedCloseDate',(current_date+5)::text));
 select multideck_crm_move_deal_stage(fid(1),fid(200),fid(211));
 select multideck_crm_set_deal_next_action(fid(1),deal_version(1),jsonb_build_object('title','Confirm the weekly volumes with Jamie','type','call','ownerId','00000000-0000-0000-0000-000000000001','dueAt',now()+interval '1 day'));
 select multideck_crm_lose_deal(fid(2),deal_version(2),jsonb_build_object('reasonCode','price','details','Customer chose a lower-priced option for this shipment. Review the service difference before the next tender.','competitor','Existing carrier','pipelineStageId',fid(213)));
 select multideck_crm_win_deal(fid(3),fid(212),'Schedule and service agreed.');
 select multideck_crm_update_deal(fid(4),deal_version(4),jsonb_build_object('expectedCloseDate',(current_date-3)::text,'ownerId','00000000-0000-0000-0000-000000000002'));
 update "CRM_DealEvents" set occurred_at = occurred_at - interval '18 days' where deal_id=fid(1);
 update "CRM_DealEvents" set occurred_at = occurred_at - interval '9 days' where deal_id=fid(4);
 `))
 // Real table/trigger fixture records, followed by native workflow transitions.
 // Historical timestamps are explicit QA-only observations; no API output is mocked.
 const names = [
  'Nordic retail replenishment', 'Rotterdam consolidation', 'Aerospace spares programme',
  'Medical equipment imports', 'Birmingham cross-dock lane', 'Dublin distribution contract',
  'Seasonal garden furniture', 'Automotive parts collection', 'Hamburg groupage service',
  'Packaging materials renewal', 'Consumer electronics tender', 'Textile imports programme',
  'Food packaging transport', 'Paris retail deliveries', 'Industrial pumps shipment',
  'Exhibition equipment move', 'Stockholm spare parts', 'Pharmaceutical cold chain',
  'Italian ceramics contract', 'Benelux distribution review', 'US machinery imports',
  'Manchester export programme', 'Polish furniture imports', 'Renewable energy components',
 ]
 ok(sql(`
  insert into "CRM_Pipelines"("CRMPipeline_ID","Company_ID","CRMPipeline_Name") values(fid(299),'20000000-0000-0000-0000-000000000001','Partner referrals');
  insert into "CRM_PipelineStages"("CRMPipelineStage_ID","CRMPipeline_ID","Company_ID","CRMPipelineStage_Name","CRMPipelineStage_SortOrder","CRMPipelineStage_ProbabilityPct","CRMPipelineStage_IsConversion") values(fid(215),fid(200),'20000000-0000-0000-0000-000000000001','Negotiation',3,80,false);
 `))
 names.forEach((name, index) => {
  const n = index + 10
  const owner = n % 2 + 1
  const age = index < 18 ? (index % 8) * 7 + index % 3 : (index - 18) * 5 + 3
  const stage = [210, 211, 215][index % 3]
  const note = [
   'The customer valued a named operations contact and proactive shipment updates; the lowest rate was not their only priority.',
   'The customer asked for lower collection charges before committing. The competing offer excluded the weekend service.',
   'The proposed weekly collection window matched the customer warehouse schedule. They asked us to confirm the departure day.',
   'The customer needed guaranteed space during peak weeks and asked us to confirm capacity before signing.',
  ][index % 4]
  const lossNote = [
   'The customer chose a cheaper rate. They could not justify the additional charge for proactive shipment updates.',
   'The customer needed a Tuesday collection. Our available Friday service did not match their warehouse schedule.',
   'The customer required guaranteed peak-season space. Our offer could not confirm capacity for every sailing.',
  ][Math.floor(index / 3) % 3]
  ok(sql(`
   select login(1);
   insert into "CRM_Opportunities"("CRMOppty_ID","CRMOppty_OrgID","CRMOppty_OwnerUserID","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_ExpectedCloseDate","CRMOppty_ExpectedValueAmount","CRMOppty_CurrencyCode","CRMOppty_CreatedBy","CRMOppty_UpdatedBy")
   values(fid(${n}),fid(100),'00000000-0000-0000-0000-00000000000${owner}','${name}',fid(200),fid(210),current_date+${(index % 7) * 3},${5000 + index * 900},'${index % 4 === 0 ? 'EUR' : 'GBP'}','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
   select multideck_crm_set_deal_next_action(fid(${n}),deal_version(${n}),jsonb_build_object('title','Review the service requirement with the customer','type','call','ownerId','00000000-0000-0000-0000-00000000000${owner}','dueAt',now()));
   select multideck_crm_complete_deal_next_action(fid(${n}),deal_version(${n}),(select id from "CRM_DealActions" where deal_id=fid(${n}) and status='open'),'${note.replaceAll("'", "''")}');
   update "CRM_DealActions" set completed_at=completed_at-make_interval(days=>${age}),created_at=created_at-make_interval(days=>${age + 1}) where deal_id=fid(${n}) and status='completed';
   ${stage !== 210 ? `select multideck_crm_move_deal_stage(fid(${n}),fid(200),fid(${stage}));` : ''}
   ${index < 18 ? index % 3 === 0
    ? `select multideck_crm_lose_deal(fid(${n}),deal_version(${n}),jsonb_build_object('reasonCode','${['price','timing','service_fit'][Math.floor(index / 3) % 3]}','details','${lossNote.replaceAll("'", "''")}','pipelineStageId',fid(213)));`
    : `select multideck_crm_win_deal(fid(${n}),fid(212),'Service, scope and rate agreed with the customer.');`
    : `select multideck_crm_update_deal(fid(${n}),deal_version(${n}),jsonb_build_object('expectedCloseDate',(current_date+${(index - 18) * 4 + 8})::text));
       ${index % 3 !== 0 ? `select multideck_crm_set_deal_next_action(fid(${n}),deal_version(${n}),jsonb_build_object('title','${index % 2 ? 'Confirm the collection schedule' : 'Review the revised proposal'}','type','${index % 2 ? 'call' : 'quote'}','ownerId','00000000-0000-0000-0000-00000000000${owner}','dueAt',now()+interval '${index % 2 ? -2 : 2} days'));` : ''}`}
   update "CRM_DealEvents" set occurred_at=occurred_at-make_interval(days=>${age}+case when kind='created' then 12 when after_data->>'outcome'='open' and before_data->>'stageId' is distinct from after_data->>'stageId' then 5 else 0 end) where deal_id=fid(${n});
  `))
 })
}
