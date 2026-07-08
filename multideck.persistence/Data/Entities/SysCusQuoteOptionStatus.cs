using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCusQuoteOptionStatus
{
    public string CqosCode { get; set; } = null!;

    public string CqosName { get; set; } = null!;

    public string? CqosDescription { get; set; }

    public bool CqosIsFinal { get; set; }

    public int CqosSortOrder { get; set; }

    public bool CqosIsActive { get; set; }

    public DateTime CqosCreatedAt { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinks { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();
}
