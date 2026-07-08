using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmactivityTriggerType
{
    public string CrmactTrigCode { get; set; } = null!;

    public string CrmactTrigName { get; set; } = null!;

    public string? CrmactTrigDescription { get; set; }

    public string? CrmactTrigSourceTable { get; set; }

    public bool CrmactTrigIsCustomerTouch { get; set; }

    public bool CrmactTrigIsActive { get; set; }

    public int CrmactTrigSortOrder { get; set; }

    public DateTime CrmactTrigCreatedAt { get; set; }

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();
}
