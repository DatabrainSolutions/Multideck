using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryPackItemSummary
{
    public Guid? DocblpId { get; set; }

    public string? DocblpCode { get; set; }

    public string? DocblpName { get; set; }

    public Guid? DocblpiId { get; set; }

    public Guid? DocblpiLibraryDocumentId { get; set; }

    public string? DocblpiDocumentCode { get; set; }

    public string? DocblpiDocumentName { get; set; }

    public string? LibraryDocumentName { get; set; }

    public string? LibraryDocumentCategory { get; set; }

    public string? DocblpiDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public Guid? DocblpiTemplateId { get; set; }

    public string? TemplateCode { get; set; }

    public string? TemplateName { get; set; }

    public Guid? DocblpiDocTypeId { get; set; }

    public string? DocTypeCode { get; set; }

    public string? DocTypeName { get; set; }

    public string? DocblpiDefaultOutputFormatCode { get; set; }

    public string? DefaultOutputFormatName { get; set; }

    public string? DefaultOutputMimeType { get; set; }

    public bool? DocblpiIsRequired { get; set; }

    public bool? DocblpiIsGeneratedByDefault { get; set; }

    public int? DocblpiSortOrder { get; set; }

    public string? DocblpiModeCodesJson { get; set; }

    public string? DocblpiDirectionCodesJson { get; set; }

    public string? DocblpiConditionJson { get; set; }

    public string? DocblpiMetadataJson { get; set; }
}
