-- Runs after the existing chain and milestone fixtures, only in disposable PG.
insert into public."Job_CargoDangerousGoods" (
  "JobCargoDG_ID","JobCargoDG_JobCargoID","JobCargoDG_UNNumber","JobCargoDG_ProperShippingName",
  "JobCargoDG_Class","JobCargoDG_PackingGroup","JobCargoDG_FlashPoint","JobCargoDG_MarinePollutant",
  "JobCargoDG_LimitedQuantity","JobCargoDG_EmergencyContact","JobCargoDG_Notes","JobCargoDG_CreatedAt")
select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '40000000-0000-4000-8000-000000000002','1234','  Supplied source — preserve  ',
  '3','II','  23 °C  ',marine,limited,'Source contact only','  Original notes  ',
  '2026-09-01T09:00:00.123456Z'
from (values(1,false,false),(2,true,false),(3,false,true),(4,true,true)) records(n,marine,limited);
create table freight_rehearsal.dangerous_goods_before as select * from public."Job_CargoDangerousGoods";
