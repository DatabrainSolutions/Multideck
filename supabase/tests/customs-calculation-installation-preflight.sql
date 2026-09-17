-- Read-only installation inventory. No operational records or credentials.
-- Run against the explicitly selected tenant before and after installation.
-- Presence is not proof of behaviour: also run data-access regression and
-- authorised/denied calculation journeys against the installed service.
select name as object_name, to_regclass(name) is not null as installed
from (values
  ('public."Customs_Declarations"'),
  ('public."Customs_CalculationAudit"'),
  ('public."sys_AIDexterDataDomains"'),
  ('public."AI_DexterWatches"'),
  ('public."AI_DexterWatchSignals"')
) expected(name);

select name as operation_name,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = expected.name
  ) as installed
from (values
  ('customs_declaration_authorised'),
  ('customs_declaration_current_user_authorised'),
  ('customs_append_calculation'),
  ('customs_calculation_immutable'),
  ('multideck_dexter_domain_customs_calculations')
) expected(name);

select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anonymous_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') as browser_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as browser_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as browser_delete,
  has_table_privilege('service_role', c.oid, 'INSERT') as direct_service_insert
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'Customs_CalculationAudit';

select p.oid::regprocedure::text as operation, p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as browser_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('customs_append_calculation', 'multideck_dexter_domain_customs_calculations');
