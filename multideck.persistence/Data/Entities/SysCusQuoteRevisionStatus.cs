using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCusQuoteRevisionStatus
{
    public string CqrsCode { get; set; } = null!;

    public string CqrsName { get; set; } = null!;

    public string? CqrsDescription { get; set; }

    public bool CqrsIsFinal { get; set; }

    public int CqrsSortOrder { get; set; }

    public bool CqrsIsActive { get; set; }

    public DateTime CqrsCreatedAt { get; set; }

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();
}
