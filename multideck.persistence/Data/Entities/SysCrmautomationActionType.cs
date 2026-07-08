using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmautomationActionType
{
    public string CrmautoActionTypeCode { get; set; } = null!;

    public string CrmautoActionTypeName { get; set; } = null!;

    public string? CrmautoActionTypeDescription { get; set; }

    public bool CrmautoActionTypeIsWriteBack { get; set; }

    public bool CrmautoActionTypeRequiresReview { get; set; }

    public bool CrmautoActionTypeIsActive { get; set; }

    public int CrmautoActionTypeSortOrder { get; set; }

    public virtual ICollection<CrmAutomationPlaybookStep> CrmAutomationPlaybookSteps { get; set; } = new List<CrmAutomationPlaybookStep>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmAutomationRunStep> CrmAutomationRunSteps { get; set; } = new List<CrmAutomationRunStep>();
}
