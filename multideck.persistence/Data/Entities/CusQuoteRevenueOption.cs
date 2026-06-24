using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevenueOption
{
    public Guid CusQuoteRevenueOptId { get; set; }

    public Guid CusQuoteRevId { get; set; }

    public int CusQuoteRevenueOptSubId { get; set; }

    public string CusQuoteRevenueOptDescription { get; set; } = null!;

    public string? CusQuoteRevenueOptNotesforCustomer { get; set; }

    public virtual CusQuoteRevision CusQuoteRev { get; set; } = null!;

    public virtual ICollection<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; } = new List<CusQuoteChargesOut>();
}
