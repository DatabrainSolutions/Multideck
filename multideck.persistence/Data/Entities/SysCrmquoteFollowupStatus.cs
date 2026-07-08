using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmquoteFollowupStatus
{
    public string CrmqfstatusCode { get; set; } = null!;

    public string CrmqfstatusName { get; set; } = null!;

    public string? CrmqfstatusDescription { get; set; }

    public bool CrmqfstatusIsOpen { get; set; }

    public bool CrmqfstatusIsWon { get; set; }

    public bool CrmqfstatusIsLost { get; set; }

    public bool CrmqfstatusIsActive { get; set; }

    public int CrmqfstatusSortOrder { get; set; }

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();
}
