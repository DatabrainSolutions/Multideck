begin;
set local lock_timeout='5s';

-- Keep source-Quote discard separate from the most recent manual-charge decision.
-- Otherwise adding fresh manual charges after a discard could resurrect the Quote.
alter table booking_api.provisional_cancellations
  add column source_quote_discarded boolean not null default false;
update booking_api.provisional_cancellations set source_quote_discarded=true where decision='discard';

-- Extend the existing, permission-checked action without changing its finance,
-- office, actor, stale-save or lifecycle safeguards. Fail migration on source drift.
do $$declare definition text;anchor text;replacement text;begin
 definition:=pg_get_functiondef('public.booking_provisional_action(uuid,uuid,text,text,timestamptz,text)'::regprocedure);
 anchor:='saved booking_api.provisional_cancellations%rowtype;charges jsonb;';
 if position(anchor in definition)=0 then raise exception 'Cancellation declarations changed';end if;
 definition:=replace(definition,anchor,'manual_before booking_api.planning_charge_sets%rowtype;manual_after booking_api.planning_charge_sets%rowtype; saved booking_api.provisional_cancellations%rowtype;charges jsonb;');
 anchor:='select * into saved from booking_api.provisional_cancellations where job_id=requested_job_id;';
 if position(anchor in definition)=0 then raise exception 'Cancellation state loading changed';end if;
 definition:=replace(definition,anchor,anchor||' select * into manual_before from booking_api.planning_charge_sets where job_id=requested_job_id;');
 anchor:='charges:=case when saved.decision=''discard'' then ''[]''::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>''{acceptedSnapshot,quote,charges}'',''[]''::jsonb) end;';
 if position(anchor in definition)=0 then raise exception 'Cancellation planning source changed';end if;
 definition:=replace(definition,anchor,'charges:=(case when saved.source_quote_discarded then ''[]''::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>''{acceptedSnapshot,quote,charges}'',''[]''::jsonb) end) || coalesce(manual_before.rows,''[]''::jsonb);');
 anchor:='decision:=case when saved.decision=''discard'' then ''discard'' when jsonb_array_length(charges)>0 then charge_decision else null end;';
 if position(anchor in definition)=0 then raise exception 'Cancellation decision changed';end if;
 definition:=replace(definition,anchor,'decision:=case when jsonb_array_length(charges)>0 then charge_decision else null end;');
 anchor:='''previousCancellation'',to_jsonb(saved))) returning id into history_id;';
 if position(anchor in definition)=0 then raise exception 'Cancellation audit changed';end if;
 definition:=replace(definition,anchor,'''previousCancellation'',to_jsonb(saved),''manualPlanningSet'',to_jsonb(manual_before))) returning id into history_id;');
 anchor:='update public."Job_Header" set "Job_Status"=target';
 if position(anchor in definition)=0 then raise exception 'Cancellation status update changed';end if;
 replacement:=$patch$
 if requested_action='cancel' and decision='discard' then
   update booking_api.provisional_cancellations set source_quote_discarded=true where job_id=requested_job_id;
   if manual_before.job_id is not null and jsonb_array_length(manual_before.rows)>0 then
     update booking_api.planning_charge_sets set rows='[]',revision=revision+1,
       updated_at=clock_timestamp(),updated_by=actor where job_id=requested_job_id returning * into manual_after;
     insert into booking_api.planning_charge_history(job_id,revision,actor_user_id,before_state,after_state)
     values(requested_job_id,manual_after.revision,actor,to_jsonb(manual_before),to_jsonb(manual_after));
   end if;
 end if;
 update public."Job_Header" set "Job_Status"=target
 $patch$;
 definition:=replace(definition,anchor,replacement);
 execute definition;
end $$;

-- The existing state endpoint counts both sources, but not discarded rows.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('public.booking_provisional_state(uuid,uuid)'::regprocedure);
 anchor:='charges:=case when saved.decision=''discard'' then ''[]''::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>''{acceptedSnapshot,quote,charges}'',''[]''::jsonb) end;';
 if position(anchor in definition)=0 then raise exception 'Provisional state charge source changed';end if;
 definition:=replace(definition,anchor,'charges:=(case when saved.source_quote_discarded then ''[]''::jsonb else coalesce(job."Job_SourceSnapshotJSON"#>''{acceptedSnapshot,quote,charges}'',''[]''::jsonb) end) || coalesce((select rows from booking_api.planning_charge_sets where job_id=requested_job_id),''[]''::jsonb);');
 execute definition;
 definition:=pg_get_functiondef('booking_api.release_provisional_quote_charges()'::regprocedure);
 anchor:='pc.decision=''discard''';
 if position(anchor in definition)=0 then raise exception 'Quote release discard guard changed';end if;
 execute replace(definition,anchor,'pc.source_quote_discarded');
end $$;

-- A planning edit must invalidate an already-open cancellation confirmation.
-- Locking the Booking in save/action serialises those requests consistently.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('booking_api.save_planning_charge_foundation(uuid,uuid,bigint,text,jsonb)'::regprocedure);
 anchor:='insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)';
 if position(anchor in definition)=0 then raise exception 'Planning save event changed';end if;
 execute replace(definition,anchor,'update public."Job_Header" set "Job_UpdatedAt"=clock_timestamp(),"Job_UpdatedBy"=actor where "Job_ID"=requested_job_id; '||anchor);
end $$;

-- Allow only the existing reviewed cancellation/reopening transaction. Progression
-- is still held until exactly-once manual charge transfer is implemented.
create or replace function booking_api.guard_unreleased_planning_charges() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from booking_api.planning_charge_sets where job_id=old."Job_ID" and jsonb_array_length(rows)>0) then
   if new."Job_IsDeleted" is distinct from old."Job_IsDeleted" then
     raise exception 'Planning charges must be handled before removing this Booking.' using errcode='22023';
   end if;
   if new."Job_Status" is distinct from old."Job_Status" and not exists(
     select 1 from booking_api.provisional_cancellations where job_id=old."Job_ID"
       and transition_tx=txid_current() and transition_status=new."Job_Status"
       and ((lower(old."Job_Status") in ('draft','provisional') and new."Job_Status"='cancelled')
         or (old."Job_ProvisionalCancelled" and new."Job_Status"='draft'))
   ) then
     raise exception 'Manual planning charge progression is not enabled yet.' using errcode='22023';
   end if;
 end if;
 return new;
end $$;
revoke all on function booking_api.guard_unreleased_planning_charges() from public,anon,authenticated,service_role;

-- Still no grant for planning reads/writes and no frontend/Edge capability enabled.
-- Dexter manual planning-charge reads/writes/watches remain explicitly unsupported.
commit;
