using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceReleaseGate
{
    public Guid TcegateId { get; set; }

    public string TcegateStatusCode { get; set; } = null!;

    public string TcegateGateCode { get; set; } = null!;

    public string TcegateName { get; set; } = null!;

    public Guid? TcegateJobId { get; set; }

    public Guid? TcegateChecklistId { get; set; }

    public Guid? TcegateCheckItemId { get; set; }

    public Guid? TcegateHoldId { get; set; }

    public Guid? TcegateWorkflowTaskId { get; set; }

    public string? TcegateSourceRecordTypeCode { get; set; }

    public string? TcegateSourceTable { get; set; }

    public Guid? TcegateSourceId { get; set; }

    public string TcegateActionCode { get; set; } = null!;

    public bool TcegateIsBlocking { get; set; }

    public DateTime? TcegateRequiredClearanceAt { get; set; }

    public string? TcegateBlockReason { get; set; }

    public DateTime? TcegateClearedAt { get; set; }

    public Guid? TcegateClearedBy { get; set; }

    public string TcegateMetadataJson { get; set; } = null!;

    public DateTime TcegateCreatedAt { get; set; }

    public Guid? TcegateCreatedBy { get; set; }

    public DateTime TcegateUpdatedAt { get; set; }

    public Guid? TcegateUpdatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual TceComplianceCheckItem? TcegateCheckItem { get; set; }

    public virtual TceComplianceChecklist? TcegateChecklist { get; set; }

    public virtual CmpUser? TcegateClearedByNavigation { get; set; }

    public virtual CmpUser? TcegateCreatedByNavigation { get; set; }

    public virtual TceComplianceHold? TcegateHold { get; set; }

    public virtual JobHeader? TcegateJob { get; set; }

    public virtual SysWorkflowRecordType? TcegateSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTcecheckStatus TcegateStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcegateUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? TcegateWorkflowTask { get; set; }

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();
}
