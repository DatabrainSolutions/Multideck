using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteCostOption
{
    public Guid CusQuoteCostOptId { get; set; }

    public Guid CusQuoteCostOptRevId { get; set; }

    public int CusQuoteCostOptSubId { get; set; }

    public Guid CusQuoteCostOptCarrierId { get; set; }

    public string? CusQuoteCostOptDescription { get; set; }

    public int? CusQuoteCostOptTransitDays { get; set; }

    public DateTime? CusQuoteCostOptDepartureDate { get; set; }

    public DateTime? CusQuoteCostOptArrivalDate { get; set; }

    public bool CusQuoteCostOptDirect { get; set; }

    public string? CusQuoteCostOptVia { get; set; }

    public virtual CusQuoteRevision CusQuoteCostOptRev { get; set; } = null!;

    public virtual ICollection<CusQuoteChargesIn> CusQuoteChargesIns { get; set; } = new List<CusQuoteChargesIn>();
}
