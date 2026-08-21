-- Historical declarations released before the tenant webhook was configured
-- cannot be replayed by the published iCustoms API. Allow a genuine iCustoms
-- portal PDF to be retained as an explicitly labelled recovery document rather
-- than misrepresenting it as a provider-delivered webhook event.

alter table public."Customs_DeclarationDocuments"
  drop constraint if exists "CK_Customs_DeclarationDocuments_source",
  add constraint "CK_Customs_DeclarationDocuments_source"
    check (
      "CUSTD_SourceCode" in (
        'multideck_carbone',
        'icustoms_webhook',
        'icustoms_provider_recovery'
      )
    );

comment on column public."Customs_DeclarationDocuments"."CUSTD_SourceCode" is
  'Immutable document provenance. icustoms_provider_recovery is reserved for a genuine provider PDF recovered for a declaration released before webhook registration; it must never be presented as a webhook delivery.';
