using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentTaxis
{
    public Guid FindocTaxId { get; set; }

    public Guid FindocTaxDocumentId { get; set; }

    public Guid? FindocTaxTaxCodeId { get; set; }

    public string FindocTaxTaxCodeSnapshot { get; set; } = null!;

    public decimal FindocTaxTaxRatePercent { get; set; }

    public decimal FindocTaxTaxableAmount { get; set; }

    public decimal FindocTaxTaxAmount { get; set; }

    public decimal FindocTaxLocalTaxableAmount { get; set; }

    public decimal FindocTaxLocalTaxAmount { get; set; }

    public virtual FinDocument FindocTaxDocument { get; set; } = null!;

    public virtual FinTaxCode? FindocTaxTaxCode { get; set; }
}
