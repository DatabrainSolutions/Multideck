using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimTimeline
{
    public Guid? ClmeventId { get; set; }

    public Guid? ClmeventClaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public string? ClmeventEventTypeCode { get; set; }

    public string? ClmeventTypeName { get; set; }

    public string? ClmeventStatusFromCode { get; set; }

    public string? ClmeventStatusToCode { get; set; }

    public string? ClmeventTitle { get; set; }

    public string? ClmeventDetails { get; set; }

    public DateTime? ClmeventEventAt { get; set; }

    public Guid? ClmeventActorUserId { get; set; }

    public Guid? ClmeventCommThreadId { get; set; }

    public Guid? ClmeventCommMessageId { get; set; }

    public Guid? ClmeventWorkflowTaskId { get; set; }
}
