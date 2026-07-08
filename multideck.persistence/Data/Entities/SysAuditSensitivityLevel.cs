using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditSensitivityLevel
{
    public string AuditSensitivityCode { get; set; } = null!;

    public string AuditSensitivityName { get; set; } = null!;

    public string? AuditSensitivityDescription { get; set; }

    public bool AuditSensitivityIsActive { get; set; }

    public int AuditSensitivitySortOrder { get; set; }

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditFieldChange> AuditFieldChanges { get; set; } = new List<AuditFieldChange>();

    public virtual ICollection<AuditTablePolicy> AuditTablePolicies { get; set; } = new List<AuditTablePolicy>();
}
