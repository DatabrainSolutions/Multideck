using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbLibraryDocumentSummary
{
    public Guid? DocbldId { get; set; }

    public string? DocbldCode { get; set; }

    public string? DocbldName { get; set; }

    public string? DocbldCategory { get; set; }

    public string? DocbldDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public Guid? DocbldDocTypeId { get; set; }

    public string? DocTypeCode { get; set; }

    public string? DocTypeName { get; set; }

    public string? DocbldDefaultRenderEngineCode { get; set; }

    public string? DefaultRenderEngineName { get; set; }

    public string? DocbldDefaultOutputFormatCode { get; set; }

    public string? DefaultOutputFormatName { get; set; }

    public string? DefaultOutputMimeType { get; set; }

    public string? DocbldStatusCode { get; set; }

    public string? StatusName { get; set; }

    public string? DocbldPurpose { get; set; }

    public string? DocbldSourceTablesJson { get; set; }

    public string? DocbldStandardSectionCodesJson { get; set; }

    public string? DocbldSupportedModeCodesJson { get; set; }

    public string? DocbldSupportedDirectionCodesJson { get; set; }

    public string? DocbldCountryCodesJson { get; set; }

    public bool? DocbldIsLegalDocument { get; set; }

    public bool? DocbldRequiresJobDocumentLink { get; set; }

    public string? DocbldRetentionCategory { get; set; }

    public bool? DocbldIsSystem { get; set; }

    public bool? DocbldIsUserEditable { get; set; }

    public bool? DocbldIsActive { get; set; }

    public DateTime? DocbldCreatedAt { get; set; }

    public DateTime? DocbldUpdatedAt { get; set; }

    public int? TemplateCount { get; set; }

    public int? PackItemCount { get; set; }
}
