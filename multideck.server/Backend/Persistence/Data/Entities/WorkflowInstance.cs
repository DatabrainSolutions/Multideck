using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowInstance
{
    public Guid WorkflowInstId { get; set; }

    public Guid? WorkflowInstDefinitionId { get; set; }

    public Guid? WorkflowInstDefinitionVersionId { get; set; }

    public string WorkflowInstName { get; set; } = null!;

    public string WorkflowInstStatusCode { get; set; } = null!;

    public string WorkflowInstPrimaryRecordTypeCode { get; set; } = null!;

    public Guid WorkflowInstPrimaryRecordId { get; set; }

    public Guid? WorkflowInstOrgOfficeId { get; set; }

    public Guid? WorkflowInstLegalEntityId { get; set; }

    public Guid? WorkflowInstBrandId { get; set; }

    public Guid? WorkflowInstCustomerOrgId { get; set; }

    public string WorkflowInstPriorityCode { get; set; } = null!;

    public DateTime? WorkflowInstStartedAt { get; set; }

    public DateTime? WorkflowInstDueAt { get; set; }

    public DateTime? WorkflowInstCompletedAt { get; set; }

    public DateTime? WorkflowInstCancelledAt { get; set; }

    public Guid? WorkflowInstCancelledBy { get; set; }

    public string? WorkflowInstCancellationReason { get; set; }

    public Guid? WorkflowInstCurrentStepId { get; set; }

    public string? WorkflowInstSourceTriggerTypeCode { get; set; }

    public Guid? WorkflowInstSourceEventId { get; set; }

    public string WorkflowInstContextJson { get; set; } = null!;

    public DateTime WorkflowInstCreatedAt { get; set; }

    public Guid? WorkflowInstCreatedBy { get; set; }

    public DateTime WorkflowInstUpdatedAt { get; set; }

    public Guid? WorkflowInstUpdatedBy { get; set; }

    public bool WorkflowInstIsDeleted { get; set; }

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowExceptionLink> WorkflowExceptionLinks { get; set; } = new List<WorkflowExceptionLink>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffs { get; set; } = new List<WorkflowHandoff>();

    public virtual CmpBrand? WorkflowInstBrand { get; set; }

    public virtual CmpUser? WorkflowInstCancelledByNavigation { get; set; }

    public virtual CmpUser? WorkflowInstCreatedByNavigation { get; set; }

    public virtual WorkflowStep? WorkflowInstCurrentStep { get; set; }

    public virtual WorkflowDefinition? WorkflowInstDefinition { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowInstDefinitionVersion { get; set; }

    public virtual CmpLegalEntity? WorkflowInstLegalEntity { get; set; }

    public virtual CmpOffice? WorkflowInstOrgOffice { get; set; }

    public virtual SysWorkflowRecordType WorkflowInstPrimaryRecordTypeCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowPriority WorkflowInstPriorityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowTriggerType? WorkflowInstSourceTriggerTypeCodeNavigation { get; set; }

    public virtual SysWorkflowInstanceStatus WorkflowInstStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowInstUpdatedByNavigation { get; set; }

    public virtual ICollection<WorkflowInstanceTarget> WorkflowInstanceTargets { get; set; } = new List<WorkflowInstanceTarget>();

    public virtual ICollection<WorkflowLegacyLink> WorkflowLegacyLinks { get; set; } = new List<WorkflowLegacyLink>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();
}
