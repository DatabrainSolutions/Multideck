using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateImportRow
{
    public Guid RateimportRowId { get; set; }

    public Guid RateimportRowImportId { get; set; }

    public int RateimportRowRowNumber { get; set; }

    public string RateimportRowStatusCode { get; set; } = null!;

    public string? RateimportRowTargetTable { get; set; }

    public Guid? RateimportRowTargetId { get; set; }

    public string RateimportRowRawJson { get; set; } = null!;

    public string RateimportRowNormalisedJson { get; set; } = null!;

    public string RateimportRowErrorJson { get; set; } = null!;

    public DateTime RateimportRowCreatedAt { get; set; }

    public virtual RateImportBatch RateimportRowImport { get; set; } = null!;

    public virtual SysRateImportStatus RateimportRowStatusCodeNavigation { get; set; } = null!;
}
