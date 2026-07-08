using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAiinsightAction
{
    public Guid FinaiactId { get; set; }

    public Guid FinaiactInsightId { get; set; }

    public string FinaiactActionCode { get; set; } = null!;

    public string FinaiactStatusCode { get; set; } = null!;

    public string FinaiactActionTitle { get; set; } = null!;

    public string? FinaiactActionDescription { get; set; }

    public DateTime? FinaiactDueAt { get; set; }

    public Guid? FinaiactAssignedUserId { get; set; }

    public Guid? FinaiactWorkflowTaskId { get; set; }

    public Guid? FinaiactCommThreadId { get; set; }

    public DateTime? FinaiactCompletedAt { get; set; }

    public Guid? FinaiactCompletedBy { get; set; }

    public virtual SysFinanceCreditControlAction FinaiactActionCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FinaiactAssignedUser { get; set; }

    public virtual CommThread? FinaiactCommThread { get; set; }

    public virtual CmpUser? FinaiactCompletedByNavigation { get; set; }

    public virtual FinAiinsight FinaiactInsight { get; set; } = null!;

    public virtual WorkflowTask? FinaiactWorkflowTask { get; set; }
}
