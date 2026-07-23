using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsTaxis
{
    public Guid CdstxId { get; set; }

    public Guid CdstxCdsid { get; set; }

    public Guid? CdstxCdsitemId { get; set; }

    public string CdstxTaxTypeCode { get; set; } = null!;

    public decimal? CdstxTaxBaseAmount { get; set; }

    public decimal? CdstxTaxRate { get; set; }

    public decimal? CdstxPayableAmount { get; set; }

    public string? CdstxCurrencyCodeSnapshot { get; set; }

    public string? CdstxMethodOfPaymentCode { get; set; }

    public bool CdstxManualCalculation { get; set; }

    public DateTime CdstxCreatedAt { get; set; }

    public virtual CdsDeclaration CdstxCds { get; set; } = null!;

    public virtual CdsItem? CdstxCdsitem { get; set; }
}
