using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateSummary
{
    public Guid? DocbtId { get; set; }

    public string? DocbtCode { get; set; }

    public string? DocbtName { get; set; }

    public Guid? DocbtLibraryDocumentId { get; set; }

    public string? DocbtLibraryDocumentCode { get; set; }

    public string? LibraryDocumentName { get; set; }

    public string? LibraryDocumentCategory { get; set; }

    public Guid? DocbtDocTypeId { get; set; }

    public string? DocTypeCode { get; set; }

    public string? DocTypeName { get; set; }

    public string? DocbtDocTypeCodeSnapshot { get; set; }

    public string? DocbtDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public Guid? DocbtDefaultDataSourceId { get; set; }

    public string? DefaultDataSourceCode { get; set; }

    public string? DefaultDataSourceName { get; set; }

    public string? DocbtStatusCode { get; set; }

    public string? StatusName { get; set; }

    public bool? StatusIsFinal { get; set; }

    public int? DocbtCurrentVersionNo { get; set; }

    public Guid? CurrentTemplateVersionId { get; set; }

    public string? CurrentVersionStatusCode { get; set; }

    public DateTime? CurrentVersionPublishedAt { get; set; }

    public string? DocbtDefaultRenderEngineCode { get; set; }

    public string? DefaultRenderEngineName { get; set; }

    public string? DocbtDefaultOutputFormatCode { get; set; }

    public string? DefaultOutputFormatName { get; set; }

    public string? DefaultOutputMimeType { get; set; }

    public Guid? DocbtThemeId { get; set; }

    public string? ThemeName { get; set; }

    public Guid? DocbtOrgOfficeId { get; set; }

    public string? OrgOfficeCode { get; set; }

    public string? OrgOfficeName { get; set; }

    public Guid? DocbtLegalEntityId { get; set; }

    public string? LegalEntityName { get; set; }

    public string? LegalEntityTradingName { get; set; }

    public Guid? DocbtBrandId { get; set; }

    public string? BrandName { get; set; }

    public string? BrandDisplayName { get; set; }

    public Guid? DocbtCustomerOrgId { get; set; }

    public string? CustomerOrgName { get; set; }

    public string? DocbtLanguageCode { get; set; }

    public string? DocbtDescription { get; set; }

    public bool? DocbtIsSystem { get; set; }

    public bool? DocbtIsUserEditable { get; set; }

    public bool? DocbtIsActive { get; set; }

    public DateTime? DocbtCreatedAt { get; set; }

    public DateTime? DocbtUpdatedAt { get; set; }

    public int? SectionCount { get; set; }

    public int? LibraryPackItemCount { get; set; }

    public DateTime? LastRenderedAt { get; set; }
}
