using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommAipolicyStatus
{
    public string CommAipolicyStatusCode { get; set; } = null!;

    public string CommAipolicyStatusName { get; set; } = null!;

    public string? CommAipolicyStatusDescription { get; set; }

    public bool CommAipolicyStatusIsFinal { get; set; }

    public int CommAipolicyStatusSortOrder { get; set; }

    public bool CommAipolicyStatusIsActive { get; set; }

    public DateTime CommAipolicyStatusCreatedAt { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();
}
