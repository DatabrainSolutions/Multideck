begin;
set local lock_timeout='5s';
do $$ declare definition text; old text; begin
  definition:=pg_get_functiondef('report_api.source_rows(uuid,text)'::regprocedure);
  old:=definition;
  definition:=replace(definition,'''/finance/receivables/''||d."FINDoc_ID"','''/finance/receivables/documents/''||d."FINDoc_ID"');
  -- The disposable contract suite replaces this source function with fixed rows.
  if definition<>old then execute definition;end if;
end $$;

do $patch$ declare definition text; marker text; addition text; begin
  definition:=pg_get_functiondef('public.reporting_workspace(text,jsonb)'::regprocedure);
  marker:='''schedules'',(select';
  if strpos(definition,marker)=0 then raise exception 'Reporting list marker changed';end if;
  definition:=replace(definition,marker,$add$'archivedReports',(select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc),'[]') from report_api.reports r where r.owner_id=u."User_ID" and r.company_id=u."Company_ID" and r.archived_at is not null),
    'schedules',(select$add$);
  marker:='elsif action=''archive'' then';
  if strpos(definition,marker)=0 then raise exception 'Reporting archive marker changed';end if;
  addition:=$add$elsif action='restore' then
    select * into r from report_api.reports where id=(payload->>'id')::uuid for update;
    if not found or r.owner_id<>u."User_ID" or r.company_id<>u."Company_ID" then raise exception 'Only the report owner can restore it.' using errcode='42501';end if;
    r.archived_at:=null;
    if not report_api.can_read(auth.uid(),r) then raise exception 'Your data access has changed. Restore the required access before restoring this report.' using errcode='42501';end if;
    update report_api.reports set archived_at=null,updated_at=now() where id=r.id returning * into r;
    insert into report_api.audit(company_id,actor_id,report_id,action) values(u."Company_ID",u."User_ID",r.id,'restore');
    return to_jsonb(r);
  elsif action='archive' then$add$;
  execute replace(definition,marker,addition);
end $patch$;
commit;
