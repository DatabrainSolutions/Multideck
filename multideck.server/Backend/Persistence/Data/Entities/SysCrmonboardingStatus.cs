using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmonboardingStatus
{
    public string CrmonboardStatusCode { get; set; } = null!;

    public string CrmonboardStatusName { get; set; } = null!;

    public string? CrmonboardStatusDescription { get; set; }

    public bool CrmonboardStatusIsOpen { get; set; }

    public bool CrmonboardStatusIsComplete { get; set; }

    public bool CrmonboardStatusIsActive { get; set; }

    public int CrmonboardStatusSortOrder { get; set; }

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRuns { get; set; } = new List<CrmOnboardingRun>();

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTasks { get; set; } = new List<CrmOnboardingTask>();
}
