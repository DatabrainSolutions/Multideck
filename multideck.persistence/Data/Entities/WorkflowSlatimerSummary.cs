using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlatimerSummary
{
    public Guid? WorkflowSlatimerId { get; set; }

    public Guid? WorkflowSlatimerInstanceId { get; set; }

    public Guid? WorkflowSlatimerTaskId { get; set; }

    public Guid? WorkflowSlatimerApprovalId { get; set; }

    public string? WorkflowSlatimerRecordTypeCode { get; set; }

    public Guid? WorkflowSlatimerRecordId { get; set; }

    public string? WorkflowSlatimerStatusCode { get; set; }

    public DateTime? WorkflowSlatimerStartAt { get; set; }

    public DateTime? WorkflowSlatimerWarningAt { get; set; }

    public DateTime? WorkflowSlatimerDueAt { get; set; }

    public DateTime? WorkflowSlatimerCompletedAt { get; set; }

    public DateTime? WorkflowSlatimerBreachedAt { get; set; }

    public DateTime? WorkflowSlatimerPausedAt { get; set; }

    public int? WorkflowSlatimerPausedSeconds { get; set; }

    public string? WorkflowSlaprofileCode { get; set; }

    public string? WorkflowSlaprofileName { get; set; }

    public string? WorkflowSlaruleCode { get; set; }

    public string? WorkflowSlaruleName { get; set; }

    public long? WorkflowSlatimerSecondsRemaining { get; set; }

    public int? WorkflowSlatimerBreachCount { get; set; }

    public int? WorkflowSlatimerOpenPauseCount { get; set; }
}
