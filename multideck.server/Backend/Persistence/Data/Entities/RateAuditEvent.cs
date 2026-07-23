using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateAuditEvent
{
    public Guid RateauditId { get; set; }

    public string RateauditAction { get; set; } = null!;

    public string? RateauditTargetTable { get; set; }

    public Guid? RateauditTargetId { get; set; }

    public Guid? RateauditContractId { get; set; }

    public Guid? RateauditRequestId { get; set; }

    public Guid? RateauditResultId { get; set; }

    public string? RateauditMessage { get; set; }

    public string RateauditMetadataJson { get; set; } = null!;

    public DateTime RateauditCreatedAt { get; set; }

    public Guid? RateauditCreatedBy { get; set; }

    public virtual RateContract? RateauditContract { get; set; }

    public virtual CmpUser? RateauditCreatedByNavigation { get; set; }

    public virtual RateRateRequest? RateauditRequest { get; set; }

    public virtual RateRateResult? RateauditResult { get; set; }
}
