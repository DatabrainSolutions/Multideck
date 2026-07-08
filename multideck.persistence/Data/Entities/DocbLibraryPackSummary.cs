using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryPackSummary
{
    public Guid? DocblpId { get; set; }

    public string? DocblpCode { get; set; }

    public string? DocblpName { get; set; }

    public string? DocblpDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public string? DocblpStatusCode { get; set; }

    public string? StatusName { get; set; }

    public Guid? DocblpOrgOfficeId { get; set; }

    public string? OrgOfficeCode { get; set; }

    public string? OrgOfficeName { get; set; }

    public Guid? DocblpLegalEntityId { get; set; }

    public string? LegalEntityName { get; set; }

    public Guid? DocblpBrandId { get; set; }

    public string? BrandName { get; set; }

    public string? BrandDisplayName { get; set; }

    public Guid? DocblpCustomerOrgId { get; set; }

    public string? CustomerOrgName { get; set; }

    public string? DocblpLanguageCode { get; set; }

    public string? DocblpDescription { get; set; }

    public string? DocblpModeCodesJson { get; set; }

    public string? DocblpDirectionCodesJson { get; set; }

    public string? DocblpCountryCodesJson { get; set; }

    public bool? DocblpIsSystem { get; set; }

    public bool? DocblpIsUserEditable { get; set; }

    public bool? DocblpIsActive { get; set; }

    public DateTime? DocblpCreatedAt { get; set; }

    public DateTime? DocblpUpdatedAt { get; set; }

    public int? ItemCount { get; set; }

    public int? RequiredItemCount { get; set; }

    public int? GeneratedByDefaultCount { get; set; }
}
