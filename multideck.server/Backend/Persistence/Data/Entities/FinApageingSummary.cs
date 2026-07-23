using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinApageingSummary
{
    public Guid? FinageSupplierOrgId { get; set; }

    public string? FinageSupplierName { get; set; }

    public Guid? FindocLegalEntityId { get; set; }

    public Guid? FindocOrgOfficeId { get; set; }

    public string? FindocCurrencyCodeSnapshot { get; set; }

    public int? FinageDocumentCount { get; set; }

    public decimal? FinageTotalOutstanding { get; set; }

    public decimal? FinageCurrent { get; set; }

    public decimal? Finage1to30 { get; set; }

    public decimal? Finage31to60 { get; set; }

    public decimal? Finage61to90 { get; set; }

    public decimal? FinageOver90 { get; set; }
}
