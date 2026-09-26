begin;

-- Multideck-owned starter charge identities. They are deliberately distinct
-- from customer/imported codes and carry no guessed tax, price or provider
-- settings. Legal-entity nominal mappings remain a separate reviewed step.
insert into public."RATE_ChargeCodes" (
  "RATECharge_Code", "RATECharge_Name", "RATECharge_Description",
  "RATECharge_CategoryCode", "RATECharge_DefaultApplicabilityCode",
  "RATECharge_IsFreight", "RATECharge_IsSurcharge", "RATECharge_IsPassThrough",
  "RATECharge_IsActive", "RATECharge_ScopeConfigured", "RATECharge_MetadataJSON"
)
select v.code, v.name, v.description, v.category, 'both',
  v.category='freight', false, false, true, false,
  jsonb_build_object('multideck',jsonb_build_object(
    'standard',true,'version',1,'nominalFamily',v.family))
from (values
  ('MD-FREIGHT','Freight','Main carriage by air, sea or road.','freight','FREIGHT'),
  ('MD-AGENCY','Agency service','Origin or destination agency service.','other','AGENCY'),
  ('MD-PORT','Port and terminal','Port, terminal or airport service.','terminal','PORT'),
  ('MD-DOCUMENTATION','Documentation','Shipping and trade documentation service.','documentation','DOCUMENT'),
  ('MD-WAREHOUSE','Warehouse service','Warehouse storage or handling service.','warehouse','WAREHOUSE'),
  ('MD-TRANSPORT','Transport service','Pickup, delivery or inland transport service.','haulage','TRANSPORT'),
  ('MD-OTHER','Other service','Other operational service with a reviewed description.','other','OTHER')
) as v(code,name,description,category,family)
on conflict ("RATECharge_Code") do nothing;

commit;
