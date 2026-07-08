using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceCaseDecision
{
    public Guid TcedecisionId { get; set; }

    public Guid TcedecisionCaseId { get; set; }

    public string TcedecisionDecisionTypeCode { get; set; } = null!;

    public string? TcedecisionStatusToCode { get; set; }

    public string TcedecisionReason { get; set; } = null!;

    public Guid? TcedecisionLicenseId { get; set; }

    public DateTime? TcedecisionValidUntil { get; set; }

    public DateTime TcedecisionDecidedAt { get; set; }

    public Guid? TcedecisionDecidedBy { get; set; }

    public string TcedecisionMetadataJson { get; set; } = null!;

    public virtual TceComplianceCase TcedecisionCase { get; set; } = null!;

    public virtual CmpUser? TcedecisionDecidedByNavigation { get; set; }

    public virtual SysTcedecisionType TcedecisionDecisionTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcecaseStatus? TcedecisionStatusToCodeNavigation { get; set; }
}
