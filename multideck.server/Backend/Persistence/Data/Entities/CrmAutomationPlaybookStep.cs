using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationPlaybookStep
{
    public Guid CrmautoStepId { get; set; }

    public Guid CrmautoStepPlaybookId { get; set; }

    public string CrmautoStepCode { get; set; } = null!;

    public string CrmautoStepName { get; set; } = null!;

    public string CrmautoStepActionTypeCode { get; set; } = null!;

    public int CrmautoStepSortOrder { get; set; }

    public bool CrmautoStepIsRequired { get; set; }

    public string CrmautoStepConfigJson { get; set; } = null!;

    public DateTime CrmautoStepCreatedAt { get; set; }

    public virtual ICollection<CrmAutomationRunStep> CrmAutomationRunSteps { get; set; } = new List<CrmAutomationRunStep>();

    public virtual SysCrmautomationActionType CrmautoStepActionTypeCodeNavigation { get; set; } = null!;

    public virtual CrmAutomationPlaybook CrmautoStepPlaybook { get; set; } = null!;
}
