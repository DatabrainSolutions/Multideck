using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditEventType
{
    public string AuditEventTypeCode { get; set; } = null!;

    public string AuditEventTypeName { get; set; } = null!;

    public string? AuditEventTypeDescription { get; set; }

    public bool AuditEventTypeIsActive { get; set; }

    public int AuditEventTypeSortOrder { get; set; }

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();
}
