using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciReconciliationIssue
{
    public Guid AcciriId { get; set; }

    public Guid AcciriConnectionId { get; set; }

    public Guid? AcciriExternalRefId { get; set; }

    public string? AcciriLocalTable { get; set; }

    public Guid? AcciriLocalId { get; set; }

    public string AcciriIssueType { get; set; } = null!;

    public string AcciriSeverity { get; set; } = null!;

    public string AcciriStatusCode { get; set; } = null!;

    public string AcciriTitle { get; set; } = null!;

    public string? AcciriDetailText { get; set; }

    public string? AcciriResolutionText { get; set; }

    public DateTime? AcciriResolvedAt { get; set; }

    public Guid? AcciriResolvedBy { get; set; }

    public DateTime AcciriCreatedAt { get; set; }

    public virtual AcciConnection AcciriConnection { get; set; } = null!;

    public virtual AcciExternalRef? AcciriExternalRef { get; set; }

    public virtual CmpUser? AcciriResolvedByNavigation { get; set; }

    public virtual SysAccountingSyncStatus AcciriStatusCodeNavigation { get; set; } = null!;
}
