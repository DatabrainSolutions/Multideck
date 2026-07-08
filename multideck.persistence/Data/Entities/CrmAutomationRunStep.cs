using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationRunStep
{
    public Guid CrmautoRunStepId { get; set; }

    public Guid CrmautoRunStepRunId { get; set; }

    public Guid? CrmautoRunStepPlaybookStepId { get; set; }

    public string CrmautoRunStepActionTypeCode { get; set; } = null!;

    public string CrmautoRunStepStatusCode { get; set; } = null!;

    public int CrmautoRunStepSortOrder { get; set; }

    public DateTime? CrmautoRunStepStartedAt { get; set; }

    public DateTime? CrmautoRunStepCompletedAt { get; set; }

    public string CrmautoRunStepResultJson { get; set; } = null!;

    public string? CrmautoRunStepErrorMessage { get; set; }

    public virtual SysCrmautomationActionType CrmautoRunStepActionTypeCodeNavigation { get; set; } = null!;

    public virtual CrmAutomationPlaybookStep? CrmautoRunStepPlaybookStep { get; set; }

    public virtual CrmAutomationRun CrmautoRunStepRun { get; set; } = null!;

    public virtual SysCrmautomationRunStatus CrmautoRunStepStatusCodeNavigation { get; set; } = null!;
}
