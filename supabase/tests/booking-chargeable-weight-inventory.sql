-- Read-only preflight. Counts only: no customers, descriptions or raw values.
-- Run before introducing typed Booking cargo weights; never cast unchecked JSON.
with legacy_values as (
  select 'shipment'::text as scope, "Job_EditableDetailsJSON"->'chargeableWeightKg' as value,
    "Job_EditableDetailsJSON" ? 'chargeableWeightKg' as supplied
  from public."Job_Header"
  union all
  select 'cargo', "JobCargo_CargoJSON"->'chargeableWeightKg',
    "JobCargo_CargoJSON" ? 'chargeableWeightKg'
  from public."Job_Cargo"
), classified as (
  select scope, case
    when not coalesce(supplied,false) then 'absent'
    when value='null'::jsonb then 'explicit_null'
    when jsonb_typeof(value) not in ('number','string') then 'non_scalar'
    when btrim(value#>>'{}')='' then 'blank'
    when length(value#>>'{}')>64 then 'oversized'
    when btrim(value#>>'{}') !~ '^[0-9]+([.][0-9]+)?$' then 'non_decimal'
    else 'decimal_candidate_requires_range_check'
  end as category
  from legacy_values
)
select scope,category,count(*) as rows from classified group by scope,category order by scope,category;
