using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrminsightStatus
{
    public string CrminsightStatusCode { get; set; } = null!;

    public string CrminsightStatusName { get; set; } = null!;

    public string? CrminsightStatusDescription { get; set; }

    public bool CrminsightStatusIsClosed { get; set; }

    public bool CrminsightStatusIsActive { get; set; }

    public int CrminsightStatusSortOrder { get; set; }

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();
}
