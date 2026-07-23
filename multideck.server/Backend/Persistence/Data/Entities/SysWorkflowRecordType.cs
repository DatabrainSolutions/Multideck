using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowRecordType
{
    public string WorkflowRecordTypeCode { get; set; } = null!;

    public string WorkflowRecordTypeName { get; set; } = null!;

    public string? WorkflowRecordTypeSourceTable { get; set; }

    public string? WorkflowRecordTypeDescription { get; set; }

    public bool WorkflowRecordTypeIsActive { get; set; }

    public int WorkflowRecordTypeSortOrder { get; set; }

    public virtual ICollection<AuditAccessEvent> AuditAccessEvents { get; set; } = new List<AuditAccessEvent>();

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditExportEvent> AuditExportEvents { get; set; } = new List<AuditExportEvent>();

    public virtual ICollection<AuditTablePolicy> AuditTablePolicies { get; set; } = new List<AuditTablePolicy>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();

    public virtual ICollection<CrmAutomationFieldDefinition> CrmAutomationFieldDefinitions { get; set; } = new List<CrmAutomationFieldDefinition>();

    public virtual ICollection<CrmAutomationPlaybook> CrmAutomationPlaybooks { get; set; } = new List<CrmAutomationPlaybook>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual ICollection<EdiMessageLink> EdiMessageLinks { get; set; } = new List<EdiMessageLink>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<TceAuditEvent> TceAuditEvents { get; set; } = new List<TceAuditEvent>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceChecklist> TceComplianceChecklists { get; set; } = new List<TceComplianceChecklist>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceHsclassification> TceHsclassifications { get; set; } = new List<TceHsclassification>();

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual ICollection<TceRecordLink> TceRecordLinkTcelinkSourceRecordTypeCodeNavigations { get; set; } = new List<TceRecordLink>();

    public virtual ICollection<TceRecordLink> TceRecordLinkTcelinkTargetRecordTypeCodeNavigations { get; set; } = new List<TceRecordLink>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowChecklist> WorkflowChecklists { get; set; } = new List<WorkflowChecklist>();

    public virtual ICollection<WorkflowDefinition> WorkflowDefinitions { get; set; } = new List<WorkflowDefinition>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowExceptionLink> WorkflowExceptionLinks { get; set; } = new List<WorkflowExceptionLink>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffs { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowInstanceTarget> WorkflowInstanceTargets { get; set; } = new List<WorkflowInstanceTarget>();

    public virtual ICollection<WorkflowInstance> WorkflowInstances { get; set; } = new List<WorkflowInstance>();

    public virtual ICollection<WorkflowSlaprofile> WorkflowSlaprofiles { get; set; } = new List<WorkflowSlaprofile>();

    public virtual ICollection<WorkflowSlarule> WorkflowSlarules { get; set; } = new List<WorkflowSlarule>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();

    public virtual ICollection<WorkflowTask> WorkflowTasks { get; set; } = new List<WorkflowTask>();

    public virtual ICollection<WorkflowTrigger> WorkflowTriggers { get; set; } = new List<WorkflowTrigger>();
}
