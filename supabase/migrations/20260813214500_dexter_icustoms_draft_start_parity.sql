-- Keep Dexter's approved create action truthful with the operator workflow:
-- creating a declaration starts an editable iCustoms draft but never submits
-- it to HMRC.

begin;

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Create an operator-owned UK CDS import or export declaration and its editable iCustoms draft from reviewed source data. This does not submit anything to HMRC.',
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'create_customs_declaration';

update public."sys_AIDexterActions"
set
  "AIDexterAction_Description" = 'Edit an exact operator-owned UK CDS import or export declaration recovery record. Submission to HMRC remains a separate approved action.',
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_customs_declaration';

commit;
