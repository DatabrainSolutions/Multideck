using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevision
{
    public Guid CusQuoteRevId { get; set; }

    public Guid CusQuoteHeaderId { get; set; }

    public int CusQuoteRevNumber { get; set; }

    public int CusQuoteRevStatus { get; set; }

    public int? CusQuoteRevReason { get; set; }

    public Guid? CusQuoteRevPreferredRev { get; set; }

    public Guid? CusQuoteRevPreferredCost { get; set; }

    public int? CusQuoteRevRevenueCount { get; set; }

    public int? CusQuoteRevCostCount { get; set; }

    public int? CusQuoteRevMode { get; set; }

    public int? CusQuoteRevType { get; set; }

    public Guid? CusQuoteRevOriginCtry { get; set; }

    public Guid? CusQuoteRevDestinationCtry { get; set; }

    public Guid? CusQuoteRevOrigin { get; set; }

    public Guid? CusQuoteRevDestination { get; set; }

    public string? CusQuoteRevOriginXtra { get; set; }

    public string? CusQuoteRevDestinationXtra { get; set; }

    public decimal? CusQuoteRevOuterQty { get; set; }

    public int? CusQuoteRevOuterPack { get; set; }

    public decimal? CusQuoteRevInnerQty { get; set; }

    public string? CusQuoteRevInnerPack { get; set; }

    public decimal? CusQuoteRevGrossKilos { get; set; }

    public decimal? CusQuoteRevCubeM3 { get; set; }

    public string? CusQuoteRevNotes { get; set; }

    public virtual CusQuoteHeader CusQuoteHeader { get; set; } = null!;

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();
}
