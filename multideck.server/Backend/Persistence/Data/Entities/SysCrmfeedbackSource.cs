using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmfeedbackSource
{
    public string CrmfeedbackSourceCode { get; set; } = null!;

    public string CrmfeedbackSourceName { get; set; } = null!;

    public string? CrmfeedbackSourceDescription { get; set; }

    public bool CrmfeedbackSourceIsActive { get; set; }

    public int CrmfeedbackSourceSortOrder { get; set; }

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();
}
