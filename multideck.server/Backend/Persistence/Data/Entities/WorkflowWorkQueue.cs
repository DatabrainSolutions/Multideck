using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowWorkQueue
{
    public Guid WorkflowQueueId { get; set; }

    public string WorkflowQueueCode { get; set; } = null!;

    public string WorkflowQueueName { get; set; } = null!;

    public string WorkflowQueueTypeCode { get; set; } = null!;

    public string? WorkflowQueueDescription { get; set; }

    public Guid? WorkflowQueueOrgOfficeId { get; set; }

    public Guid? WorkflowQueueLegalEntityId { get; set; }

    public Guid? WorkflowQueueBrandId { get; set; }

    public string WorkflowQueueTimeZone { get; set; } = null!;

    public string WorkflowQueueDefaultPriorityCode { get; set; } = null!;

    public Guid? WorkflowQueueManagerUserId { get; set; }

    public bool WorkflowQueueIsActive { get; set; }

    public string WorkflowQueueSettingsJson { get; set; } = null!;

    public DateTime WorkflowQueueCreatedAt { get; set; }

    public Guid? WorkflowQueueCreatedBy { get; set; }

    public DateTime WorkflowQueueUpdatedAt { get; set; }

    public Guid? WorkflowQueueUpdatedBy { get; set; }

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffFromQueues { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffWorkflowHandoffToQueues { get; set; } = new List<WorkflowHandoff>();

    public virtual CmpBrand? WorkflowQueueBrand { get; set; }

    public virtual CmpUser? WorkflowQueueCreatedByNavigation { get; set; }

    public virtual SysWorkflowPriority WorkflowQueueDefaultPriorityCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? WorkflowQueueLegalEntity { get; set; }

    public virtual CmpUser? WorkflowQueueManagerUser { get; set; }

    public virtual CmpOffice? WorkflowQueueOrgOffice { get; set; }

    public virtual SysWorkflowQueueType WorkflowQueueTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowQueueUpdatedByNavigation { get; set; }

    public virtual ICollection<WorkflowStep> WorkflowSteps { get; set; } = new List<WorkflowStep>();

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignments { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowWorkQueueMember> WorkflowWorkQueueMembers { get; set; } = new List<WorkflowWorkQueueMember>();
}
