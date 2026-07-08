using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmRecoveryQueue
{
    public Guid? ClmrecoveryId { get; set; }

    public Guid? ClmrecoveryClaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public string? ClmclaimTitle { get; set; }

    public string? ClmrecoveryStatusCode { get; set; }

    public string? ClmrecoveryStatusName { get; set; }

    public Guid? ClmrecoveryTargetOrgId { get; set; }

    public string? ClmrecoveryTargetOrgName { get; set; }

    public string? ClmrecoveryTargetRoleCode { get; set; }

    public decimal? ClmrecoveryClaimedAmount { get; set; }

    public decimal? ClmrecoveryExpectedAmount { get; set; }

    public decimal? ClmrecoveryRecoveredAmount { get; set; }

    public string? ClmrecoveryCurrencyCodeSnapshot { get; set; }

    public DateTime? ClmrecoveryNoticeSentAt { get; set; }

    public DateOnly? ClmrecoveryDueDate { get; set; }

    public Guid? ClmrecoveryWorkflowTaskId { get; set; }
}
