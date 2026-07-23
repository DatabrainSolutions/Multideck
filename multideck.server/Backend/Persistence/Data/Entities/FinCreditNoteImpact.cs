using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCreditNoteImpact
{
    public Guid FincnriId { get; set; }

    public Guid FincnriRequestId { get; set; }

    public Guid? FincnriJobId { get; set; }

    public decimal FincnriRevenueImpactAmount { get; set; }

    public decimal FincnriTaxImpactAmount { get; set; }

    public decimal FincnriCommissionImpactAmount { get; set; }

    public decimal FincnriProfitShareImpactAmount { get; set; }

    public decimal FincnriWipaccrualImpactAmount { get; set; }

    public string? FincnriExplanation { get; set; }

    public virtual JobHeader? FincnriJob { get; set; }

    public virtual FinCreditNoteRequest FincnriRequest { get; set; } = null!;
}
