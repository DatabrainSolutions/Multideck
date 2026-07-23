using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowAutomationRun
{
    public Guid WorkflowAutoId { get; set; }

    public Guid? WorkflowAutoInstanceId { get; set; }

    public Guid? WorkflowAutoTaskId { get; set; }

    public Guid? WorkflowAutoActionId { get; set; }

    public string? WorkflowAutoActionTypeCode { get; set; }

    public string WorkflowAutoStatusCode { get; set; } = null!;

    public string? WorkflowAutoProviderCode { get; set; }

    public Guid? WorkflowAutoAiTaskRunId { get; set; }

    public string WorkflowAutoRequestJson { get; set; } = null!;

    public string WorkflowAutoResponseJson { get; set; } = null!;

    public string? WorkflowAutoErrorMessage { get; set; }

    public DateTime? WorkflowAutoStartedAt { get; set; }

    public DateTime? WorkflowAutoCompletedAt { get; set; }

    public DateTime WorkflowAutoCreatedAt { get; set; }

    public Guid? WorkflowAutoCreatedBy { get; set; }

    public virtual WorkflowAction? WorkflowAutoAction { get; set; }

    public virtual SysWorkflowActionType? WorkflowAutoActionTypeCodeNavigation { get; set; }

    public virtual AiTaskRun? WorkflowAutoAiTaskRun { get; set; }

    public virtual CmpUser? WorkflowAutoCreatedByNavigation { get; set; }

    public virtual WorkflowInstance? WorkflowAutoInstance { get; set; }

    public virtual SysWorkflowTaskStatus WorkflowAutoStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WorkflowAutoTask { get; set; }
}
