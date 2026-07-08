using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateImportStatus
{
    public string RateimpstCode { get; set; } = null!;

    public string RateimpstName { get; set; } = null!;

    public string? RateimpstDescription { get; set; }

    public bool RateimpstIsFinal { get; set; }

    public int RateimpstSortOrder { get; set; }

    public virtual ICollection<RateImportBatch> RateImportBatches { get; set; } = new List<RateImportBatch>();

    public virtual ICollection<RateImportRow> RateImportRows { get; set; } = new List<RateImportRow>();
}
