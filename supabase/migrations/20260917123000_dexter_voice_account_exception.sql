begin;

-- Account-specific daily allowance exception, resolved from the verified Auth
-- identity rather than editable profile data or a client-supplied email.
-- Administrative policy only: Dexter chat/watch cannot edit this exception.
-- Existing voice accounting and deterministic usage watch signals stay intact.
create function public._multideck_voice_daily_exempt(p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(
    select 1 from public."cmp_Users" u
    join auth.users a on a.id=u."Auth_User_ID"
    where u."User_ID"=p_user_id
      and u."User_AccessStatus"='active'
      and lower(a.email)='harry@databrain.solutions'
      and a.email_confirmed_at is not null
  );
$$;
revoke all on function public._multideck_voice_daily_exempt(uuid) from public,anon,authenticated;

-- Keep current definitions, including conversation history and spend checks.
do $patch$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('public.multideck_voice_preferences(text)'::regprocedure);
  marker:='  reset_at:=';
  if position(marker in definition)=0 then raise exception 'Voice preferences exception patch no longer matches';end if;
  definition:=replace(definition,marker,
    '  if public._multideck_voice_daily_exempt(ctx.user_id) then used:=0;end if;'||chr(10)||marker);
  definition:=replace(definition,'''dailySeconds'',300,',
    '''dailySeconds'',300,''dailyUnlimited'',public._multideck_voice_daily_exempt(ctx.user_id),');
  execute definition;
  definition:=pg_get_functiondef('public.multideck_voice_reserve(uuid,uuid,uuid,text,boolean)'::regprocedure);
  marker:='  allowed:=least(case when p_preview then 18 else 300 end,';
  if position(marker in definition)=0 then raise exception 'Voice reservation exception patch no longer matches';end if;
  execute replace(definition,marker,
    '  if public._multideck_voice_daily_exempt(p_user_id) then used:=0;end if;'||chr(10)||marker);
end $patch$;
commit;
