using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbSectionGridSummary
{
    public Guid? DocbsId { get; set; }

    public string? DocbsCode { get; set; }

    public string? DocbsName { get; set; }

    public Guid? DocbsvId { get; set; }

    public int? DocbsvVersionNo { get; set; }

    public Guid? DocbslrId { get; set; }

    public int? DocbslrRowNo { get; set; }

    public string? DocbslrRowType { get; set; }

    public Guid? DocbslcId { get; set; }

    public int? DocbslcColumnStart { get; set; }

    public int? DocbslcColumnSpan { get; set; }

    public int? ColumnEnd { get; set; }

    public Guid? DocbslbId { get; set; }

    public string? DocbslbBlockTypeCode { get; set; }

    public string? BlockTypeName { get; set; }

    public int? DocbslbSortOrder { get; set; }

    public string? DocbslbDisplayLabel { get; set; }

    public string? DocbfFieldPath { get; set; }

    public string? FieldLabel { get; set; }

    public string? ClauseCode { get; set; }

    public string? ClauseTitle { get; set; }

    public string? AssetCode { get; set; }

    public string? AssetName { get; set; }

    public string? DocbslbSecurityMarkTypeCode { get; set; }

    public bool? DocbslbIsRequired { get; set; }

    public string? DocbslbBindingJson { get; set; }

    public string? DocbslbStyleJson { get; set; }

    public string? DocbslbConditionJson { get; set; }
}
