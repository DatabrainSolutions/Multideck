using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceComplianceHold
{
    public Guid TceholdId { get; set; }

    public string TceholdStatusCode { get; set; } = null!;

    public string TceholdActionTypeCode { get; set; } = null!;

    public Guid? TceholdCaseId { get; set; }

    public Guid? TceholdRunId { get; set; }

    public Guid? TceholdJobId { get; set; }

    public string? TceholdSourceRecordTypeCode { get; set; }

    public string? TceholdSourceTable { get; set; }

    public Guid? TceholdSourceId { get; set; }

    public string TceholdReason { get; set; } = null!;

    public bool TceholdIsBlocking { get; set; }

    public DateTime TceholdHeldAt { get; set; }

    public Guid? TceholdHeldBy { get; set; }

    public DateTime? TceholdReleasedAt { get; set; }

    public Guid? TceholdReleasedBy { get; set; }

    public string? TceholdReleaseReason { get; set; }

    public Guid? TceholdWorkflowTaskId { get; set; }

    public string TceholdMetadataJson { get; set; } = null!;

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual SysTceactionType TceholdActionTypeCodeNavigation { get; set; } = null!;

    public virtual TceComplianceCase? TceholdCase { get; set; }

    public virtual CmpUser? TceholdHeldByNavigation { get; set; }

    public virtual JobHeader? TceholdJob { get; set; }

    public virtual CmpUser? TceholdReleasedByNavigation { get; set; }

    public virtual TceScreeningRun? TceholdRun { get; set; }

    public virtual SysWorkflowRecordType? TceholdSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTceholdStatus TceholdStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? TceholdWorkflowTask { get; set; }

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();
}
