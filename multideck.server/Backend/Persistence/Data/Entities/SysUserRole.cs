using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysUserRole
{
    public Guid SysUserRoleId { get; set; }

    public string SysUserRoleName { get; set; } = null!;

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual ICollection<AiConversationParticipant> AiConversationParticipants { get; set; } = new List<AiConversationParticipant>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<WorkflowApprovalDecision> WorkflowApprovalDecisions { get; set; } = new List<WorkflowApprovalDecision>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignments { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueueMember> WorkflowWorkQueueMembers { get; set; } = new List<WorkflowWorkQueueMember>();

    public virtual ICollection<SysPermission> SysPermissions { get; set; } = new List<SysPermission>();

    public virtual ICollection<CmpUser> Users { get; set; } = new List<CmpUser>();
}
