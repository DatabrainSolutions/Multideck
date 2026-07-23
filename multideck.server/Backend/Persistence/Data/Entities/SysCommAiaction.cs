using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommAiaction
{
    public string CommAiactionCode { get; set; } = null!;

    public string CommAiactionName { get; set; } = null!;

    public string? CommAiactionDescription { get; set; }

    public int CommAiactionSortOrder { get; set; }

    public bool CommAiactionIsActive { get; set; }

    public DateTime CommAiactionCreatedAt { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();
}
