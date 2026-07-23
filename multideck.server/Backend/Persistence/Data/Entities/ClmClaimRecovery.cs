using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimRecovery
{
    public Guid ClmrecoveryId { get; set; }

    public Guid ClmrecoveryClaimId { get; set; }

    public string ClmrecoveryStatusCode { get; set; } = null!;

    public Guid? ClmrecoveryTargetOrgId { get; set; }

    public Guid? ClmrecoveryTargetContactId { get; set; }

    public string? ClmrecoveryTargetRoleCode { get; set; }

    public string? ClmrecoveryReference { get; set; }

    public decimal ClmrecoveryClaimedAmount { get; set; }

    public decimal ClmrecoveryExpectedAmount { get; set; }

    public decimal ClmrecoveryRecoveredAmount { get; set; }

    public string ClmrecoveryCurrencyCodeSnapshot { get; set; } = null!;

    public DateTime? ClmrecoveryNoticeSentAt { get; set; }

    public DateOnly? ClmrecoveryDueDate { get; set; }

    public DateTime? ClmrecoveryRecoveredAt { get; set; }

    public string? ClmrecoveryWriteOffReason { get; set; }

    public Guid? ClmrecoveryFinDocumentId { get; set; }

    public Guid? ClmrecoveryWorkflowTaskId { get; set; }

    public string? ClmrecoveryNotes { get; set; }

    public DateTime ClmrecoveryCreatedAt { get; set; }

    public Guid? ClmrecoveryCreatedBy { get; set; }

    public DateTime ClmrecoveryUpdatedAt { get; set; }

    public Guid? ClmrecoveryUpdatedBy { get; set; }

    public virtual ClmClaim ClmrecoveryClaim { get; set; } = null!;

    public virtual CmpUser? ClmrecoveryCreatedByNavigation { get; set; }

    public virtual FinDocument? ClmrecoveryFinDocument { get; set; }

    public virtual SysClmrecoveryStatus ClmrecoveryStatusCodeNavigation { get; set; } = null!;

    public virtual OrgContact? ClmrecoveryTargetContact { get; set; }

    public virtual OrgMaster? ClmrecoveryTargetOrg { get; set; }

    public virtual SysClmclaimPartyRole? ClmrecoveryTargetRoleCodeNavigation { get; set; }

    public virtual CmpUser? ClmrecoveryUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? ClmrecoveryWorkflowTask { get; set; }
}
