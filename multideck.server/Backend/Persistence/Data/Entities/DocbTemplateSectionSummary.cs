using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbTemplateSectionSummary
{
    public Guid? DocbtId { get; set; }

    public string? DocbtCode { get; set; }

    public string? DocbtName { get; set; }

    public Guid? DocbtvId { get; set; }

    public int? DocbtvVersionNo { get; set; }

    public string? DocbtvStatusCode { get; set; }

    public Guid? DocbtsId { get; set; }

    public int? DocbtsSortOrder { get; set; }

    public string? DocbtsDisplayTitle { get; set; }

    public bool? DocbtsIsRequired { get; set; }

    public bool? DocbtsIsVisibleByDefault { get; set; }

    public bool? DocbtsPageBreakBefore { get; set; }

    public bool? DocbtsPageBreakAfter { get; set; }

    public Guid? DocbsId { get; set; }

    public string? DocbsCode { get; set; }

    public string? DocbsName { get; set; }

    public string? DocbsSectionTypeCode { get; set; }

    public string? SectionTypeName { get; set; }

    public bool? SectionTypeIsRepeating { get; set; }

    public string? DocbsDataScopeCode { get; set; }

    public string? DataScopeName { get; set; }

    public Guid? DocbsDataSourceId { get; set; }

    public string? DataSourceCode { get; set; }

    public string? DataSourceName { get; set; }

    public string? DocbsStatusCode { get; set; }

    public string? SectionStatusName { get; set; }

    public string? DocbtsConfigOverrideJson { get; set; }

    public string? DocbtsConditionJson { get; set; }

    public string? DocbtsBindingJson { get; set; }
}
