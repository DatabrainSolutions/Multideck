using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateSourceType
{
    public string RatesrcCode { get; set; } = null!;

    public string RatesrcName { get; set; } = null!;

    public string? RatesrcDescription { get; set; }

    public bool RatesrcIsExternal { get; set; }

    public int RatesrcSortOrder { get; set; }

    public virtual ICollection<RateContractVersion> RateContractVersions { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateImportBatch> RateImportBatches { get; set; } = new List<RateImportBatch>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateSpotQuote> RateSpotQuotes { get; set; } = new List<RateSpotQuote>();
}
