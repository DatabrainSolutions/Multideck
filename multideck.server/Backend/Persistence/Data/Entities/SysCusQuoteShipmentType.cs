using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCusQuoteShipmentType
{
    public string CqstCode { get; set; } = null!;

    public string CqstName { get; set; } = null!;

    public string? CqstDescription { get; set; }

    public int CqstSortOrder { get; set; }

    public bool CqstIsActive { get; set; }

    public DateTime CqstCreatedAt { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();
}
