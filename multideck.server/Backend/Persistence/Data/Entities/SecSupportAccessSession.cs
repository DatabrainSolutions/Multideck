using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecSupportAccessSession
{
    public Guid SecsupportId { get; set; }

    public string SecsupportReason { get; set; } = null!;

    public string SecsupportStatusCode { get; set; } = null!;

    public Guid? SecsupportRequestedBy { get; set; }

    public Guid? SecsupportApprovedBy { get; set; }

    public DateTime? SecsupportApprovedAt { get; set; }

    public DateTime SecsupportExpiresAt { get; set; }

    public DateTime? SecsupportClosedAt { get; set; }

    public string SecsupportAllowedScopesJson { get; set; } = null!;

    public string? SecsupportAuditNotes { get; set; }

    public DateTime SecsupportCreatedAt { get; set; }

    public virtual CmpUser? SecsupportApprovedByNavigation { get; set; }

    public virtual CmpUser? SecsupportRequestedByNavigation { get; set; }

    public virtual SysSecgrantStatus SecsupportStatusCodeNavigation { get; set; } = null!;
}
