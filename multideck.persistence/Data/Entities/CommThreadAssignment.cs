using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommThreadAssignment
{
    public Guid CommAssignId { get; set; }

    public Guid CommAssignThreadId { get; set; }

    public Guid? CommAssignFromUserId { get; set; }

    public Guid? CommAssignFromGroupId { get; set; }

    public Guid? CommAssignToUserId { get; set; }

    public Guid? CommAssignToGroupId { get; set; }

    public Guid? CommAssignAssignedBy { get; set; }

    public DateTime CommAssignAssignedAt { get; set; }

    public DateTime? CommAssignAcceptedAt { get; set; }

    public string? CommAssignReason { get; set; }

    public string CommAssignMetadataJson { get; set; } = null!;

    public virtual CmpUser? CommAssignAssignedByNavigation { get; set; }

    public virtual CmpGroup? CommAssignFromGroup { get; set; }

    public virtual CmpUser? CommAssignFromUser { get; set; }

    public virtual CommThread CommAssignThread { get; set; } = null!;

    public virtual CmpGroup? CommAssignToGroup { get; set; }

    public virtual CmpUser? CommAssignToUser { get; set; }
}
