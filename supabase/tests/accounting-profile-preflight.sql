-- Read-only, administrator-run inventory. Does not infer ownership or grant access.
-- Run on the intended tenant before and after installing profile safeguards.
with required_scope as (
 select "FINDoc_PartyOrgID" org_id,"FINDoc_LegalEntityID" entity_id,'financial document' source
 from public."FIN_Documents"
 union
 select m."ACCIPM_OrgID",c."ACCIC_LegalEntityID",'active provider mapping'
 from public."ACCI_PartyMappings" m join public."ACCI_Connections" c on c."ACCIC_ID"=m."ACCIPM_ConnectionID"
 where m."ACCIPM_IsActive"
)
select r.org_id,o."Org_Name",r.entity_id,e."Company_ID",r.source,
 case when p."CRMAccount_OrgID" is null then 'missing profile'
 when p."CRMAccount_IsDeleted" then 'archived profile'
 when p."CRMAccount_CompanyID" is distinct from e."Company_ID" then 'company mismatch'
 else 'legal entity mismatch' end issue
from required_scope r join public."Org_Master" o on o."Org_id"=r.org_id
left join public."cmp_LegalEntities" e on e."LegalEntity_ID"=r.entity_id
left join public."CRM_AccountProfiles" p on p."CRMAccount_OrgID"=r.org_id
where p."CRMAccount_OrgID" is null or p."CRMAccount_IsDeleted"
 or p."CRMAccount_CompanyID" is distinct from e."Company_ID"
 or (p."CRMAccount_LegalEntityID" is not null and p."CRMAccount_LegalEntityID" is distinct from r.entity_id)
order by r.org_id,r.entity_id,r.source;
