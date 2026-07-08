using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmquickTaskType
{
    public string CrmquickTaskTypeCode { get; set; } = null!;

    public string CrmquickTaskTypeName { get; set; } = null!;

    public string? CrmquickTaskTypeDescription { get; set; }

    public string? CrmquickTaskTypeDefaultWorkflowTaskTypeCode { get; set; }

    public string CrmquickTaskTypeDefaultPriorityCode { get; set; } = null!;

    public bool CrmquickTaskTypeIsCustomerTouch { get; set; }

    public bool CrmquickTaskTypeIsActive { get; set; }

    public int CrmquickTaskTypeSortOrder { get; set; }

    public virtual ICollection<CrmActivityWorkflowRule> CrmActivityWorkflowRules { get; set; } = new List<CrmActivityWorkflowRule>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual SysWorkflowPriority CrmquickTaskTypeDefaultPriorityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowTaskType? CrmquickTaskTypeDefaultWorkflowTaskTypeCodeNavigation { get; set; }
}
