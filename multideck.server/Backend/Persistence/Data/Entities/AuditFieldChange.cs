using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditFieldChange
{
    public Guid AuditFieldChangeId { get; set; }

    public Guid AuditFieldChangeEventId { get; set; }

    public string AuditFieldChangeColumnName { get; set; } = null!;

    public string? AuditFieldChangeDataType { get; set; }

    public string? AuditFieldChangeOldValueJson { get; set; }

    public string? AuditFieldChangeNewValueJson { get; set; }

    public string? AuditFieldChangeOldValueHash { get; set; }

    public string? AuditFieldChangeNewValueHash { get; set; }

    public bool AuditFieldChangeIsRedacted { get; set; }

    public bool AuditFieldChangeIsSensitive { get; set; }

    public string AuditFieldChangeSensitivityCode { get; set; } = null!;

    public DateTime AuditFieldChangeCreatedAt { get; set; }

    public virtual AuditEvent AuditFieldChangeEvent { get; set; } = null!;

    public virtual SysAuditSensitivityLevel AuditFieldChangeSensitivityCodeNavigation { get; set; } = null!;
}
