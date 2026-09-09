insert into public."sys_CustomsSubmissionStatuses" (
  "CSS_Code",
  "CSS_Name",
  "CSS_Description",
  "CSS_IsFinal",
  "CSS_IsActive",
  "CSS_SortOrder"
)
values (
  'draft',
  'Draft',
  'The declaration is saved in iCustoms but has not been submitted to Customs.',
  false,
  true,
  5
)
on conflict ("CSS_Code") do update set
  "CSS_Name" = excluded."CSS_Name",
  "CSS_Description" = excluded."CSS_Description",
  "CSS_IsFinal" = excluded."CSS_IsFinal",
  "CSS_IsActive" = excluded."CSS_IsActive",
  "CSS_SortOrder" = excluded."CSS_SortOrder";
