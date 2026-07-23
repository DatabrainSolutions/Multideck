using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimEvent
{
    public Guid ClmeventId { get; set; }

    public Guid ClmeventClaimId { get; set; }

    public string ClmeventEventTypeCode { get; set; } = null!;

    public string? ClmeventStatusFromCode { get; set; }

    public string? ClmeventStatusToCode { get; set; }

    public string ClmeventTitle { get; set; } = null!;

    public string? ClmeventDetails { get; set; }

    public DateTime ClmeventEventAt { get; set; }

    public Guid? ClmeventActorUserId { get; set; }

    public Guid? ClmeventCommThreadId { get; set; }

    public Guid? ClmeventCommMessageId { get; set; }

    public Guid? ClmeventWorkflowTaskId { get; set; }

    public string ClmeventMetadataJson { get; set; } = null!;

    public DateTime ClmeventCreatedAt { get; set; }

    public virtual CmpUser? ClmeventActorUser { get; set; }

    public virtual ClmClaim ClmeventClaim { get; set; } = null!;

    public virtual CommMessage? ClmeventCommMessage { get; set; }

    public virtual CommThread? ClmeventCommThread { get; set; }

    public virtual SysClmeventType ClmeventEventTypeCodeNavigation { get; set; } = null!;

    public virtual SysClmclaimStatus? ClmeventStatusFromCodeNavigation { get; set; }

    public virtual SysClmclaimStatus? ClmeventStatusToCodeNavigation { get; set; }

    public virtual WorkflowTask? ClmeventWorkflowTask { get; set; }
}
