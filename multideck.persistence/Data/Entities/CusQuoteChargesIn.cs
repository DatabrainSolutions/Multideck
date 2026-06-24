using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteChargesIn
{
    public Guid CusQuoteChargesInId { get; set; }

    public Guid CusQuoteCostOptId { get; set; }

    public int CusQuoteChargesInCostId { get; set; }

    public Guid? CusQuoteChargesInFrom { get; set; }

    public Guid? CusQuoteChargesInChargeCode { get; set; }

    public string? CusQuoteChargesInDescription { get; set; }

    public string? CusQuoteChargesInIntNotes { get; set; }

    public int? CusQuoteChargesInFromCurr { get; set; }

    public decimal? CusQuoteChargesInsFromRoe { get; set; }

    public decimal? CusQuoteChargesInExpectedCostCurr { get; set; }

    public decimal? CusQuoteChargesInExpectedCostLocal { get; set; }

    public virtual CusQuoteCostOption CusQuoteCostOpt { get; set; } = null!;
}
