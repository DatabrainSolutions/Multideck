using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpGroup
{
    public Guid GroupId { get; set; }

    public string GroupName { get; set; } = null!;

    public string? GroupNotes { get; set; }

    public Guid? GroupCreatedBy { get; set; }

    public DateTime? GroupCreatedDate { get; set; }

    public virtual ICollection<CommAiclassification> CommAiclassifications { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommThreadAssignment> CommThreadAssignmentCommAssignFromGroups { get; set; } = new List<CommThreadAssignment>();

    public virtual ICollection<CommThreadAssignment> CommThreadAssignmentCommAssignToGroups { get; set; } = new List<CommThreadAssignment>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignments { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueueMember> WorkflowWorkQueueMembers { get; set; } = new List<WorkflowWorkQueueMember>();

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
