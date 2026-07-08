using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsValuationAdjustment
{
    public Guid CdsvId { get; set; }

    public Guid CdsvCdsid { get; set; }

    public Guid? CdsvCdsitemId { get; set; }

    public string CdsvAdjustmentType { get; set; } = null!;

    public decimal? CdsvAmount { get; set; }

    public string? CdsvCurrencyCodeSnapshot { get; set; }

    public string? CdsvDescription { get; set; }

    public DateTime CdsvCreatedAt { get; set; }

    public virtual CdsDeclaration CdsvCds { get; set; } = null!;

    public virtual CdsItem? CdsvCdsitem { get; set; }
}
