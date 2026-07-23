using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbFieldCatalogSummary
{
    public Guid? DocbdsId { get; set; }

    public string? DocbdsCode { get; set; }

    public string? DocbdsName { get; set; }

    public string? DocbdsDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public string? DocbdsSourceTable { get; set; }

    public string? DocbdsSourceView { get; set; }

    public bool? DocbdsIsSystem { get; set; }

    public bool? DocbdsIsActive { get; set; }

    public Guid? DocbfId { get; set; }

    public string? DocbfFieldPath { get; set; }

    public string? DocbfLabel { get; set; }

    public string? DocbfDataType { get; set; }

    public string? DocbfDescription { get; set; }

    public bool? DocbfIsRepeating { get; set; }

    public bool? DocbfIsRequired { get; set; }

    public bool? DocbfIsSensitive { get; set; }

    public string? DocbfFormatHint { get; set; }

    public string? DocbfSampleValue { get; set; }

    public int? DocbfSortOrder { get; set; }

    public bool? DocbfIsActive { get; set; }
}
