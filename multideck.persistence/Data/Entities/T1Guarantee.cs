using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Guarantee
{
    public Guid T1gId { get; set; }

    public Guid T1gT1id { get; set; }

    public string T1gGuaranteeType { get; set; } = null!;

    public string? T1gGuaranteeReference { get; set; }

    public string? T1gAccessCode { get; set; }

    public decimal? T1gAmount { get; set; }

    public string? T1gCurrencyCodeSnapshot { get; set; }

    public DateTime T1gCreatedAt { get; set; }

    public virtual T1Declaration T1gT1 { get; set; } = null!;
}
