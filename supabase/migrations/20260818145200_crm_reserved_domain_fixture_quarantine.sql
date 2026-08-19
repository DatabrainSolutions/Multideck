-- Reserved .example domains cannot represent deliverable customer contact data.
-- Preserve the records for audit/history, but remove their account from every
-- operator CRM surface through the existing developmentFixture boundary.
update public."CRM_AccountProfiles" as account
set
  "CRMAccount_MetadataJSON" = coalesce(account."CRMAccount_MetadataJSON", '{}'::jsonb)
    || jsonb_build_object(
      'developmentFixture', true,
      'source', 'reserved_domain_quarantine',
      'quarantineReason', 'reserved_example_contact_domain',
      'quarantinedAt', now()
    ),
  "CRMAccount_UpdatedAt" = now()
where account."CRMAccount_IsDeleted" = false
  and lower(coalesce(account."CRMAccount_MetadataJSON" ->> 'developmentFixture', 'false')) <> 'true'
  and exists (
    select 1
    from public."Org_Contacts" as contact
    join public."OrgContact_Emails" as email
      on email."OrgContact_ID" = contact."OrgContact_ID"
    where contact."Org_ID" = account."CRMAccount_OrgID"
      and lower(btrim(email."OrgContactEmail_Email")) like '%.example'
  );
