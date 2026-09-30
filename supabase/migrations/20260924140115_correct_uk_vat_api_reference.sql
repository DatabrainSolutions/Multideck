begin;

-- HMRC's published MTD VAT API is version 1.0. Preserve any tenant-specific
-- source override; repair only the obsolete URL seeded by the original pack.
update public."FIN_LocalisationPacks"
set "FINLocPack_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0'
where "FINLocPack_Code"='gb-v1'
  and "FINLocPack_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0';

update public."FIN_ComplianceObligations" obligation
set "FINCompliance_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0'
from public."FIN_LocalisationPacks" pack
where obligation."FINCompliance_PackID"=pack."FINLocPack_ID"
  and pack."FINLocPack_Code"='gb-v1'
  and obligation."FINCompliance_Code"='gb-vat-mtd'
  and obligation."FINCompliance_SourceURL"='https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/2.0';

commit;
