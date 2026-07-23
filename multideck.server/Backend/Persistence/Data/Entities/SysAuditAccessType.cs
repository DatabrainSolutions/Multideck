using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditAccessType
{
    public string AuditAccessTypeCode { get; set; } = null!;

    public string AuditAccessTypeName { get; set; } = null!;

    public string? AuditAccessTypeDescription { get; set; }

    public bool AuditAccessTypeIsActive { get; set; }

    public int AuditAccessTypeSortOrder { get; set; }

    public virtual ICollection<AuditAccessEvent> AuditAccessEvents { get; set; } = new List<AuditAccessEvent>();
}
