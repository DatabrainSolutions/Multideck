begin;
create or replace function public._multideck_dexter_context()
returns table(user_id uuid,company_id uuid)
language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare linked_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in again to use Agent Dexter.' using errcode='42501';end if;
 select count(*) into linked_count from public."cmp_Users" p where p."Auth_User_ID"=auth.uid();
 if linked_count<>1 then raise exception 'Your signed-in account is not linked to this Multideck workspace.' using errcode='42501';end if;
 return query select p."User_ID",p."Company_ID" from public."cmp_Users" p
 where p."Auth_User_ID"=auth.uid() and p."Company_ID" is not null and coalesce(p."User_AccessStatus",'active')='active';
 if not found then raise exception 'Your signed-in account does not have active access to this Multideck workspace.' using errcode='42501';end if;
end $$;
revoke all on function public._multideck_dexter_context() from public,anon,authenticated;
commit;
