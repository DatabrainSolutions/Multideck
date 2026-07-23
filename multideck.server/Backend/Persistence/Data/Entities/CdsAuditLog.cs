using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsAuditLog
{
    public Guid CdsauId { get; set; }

    public Guid? CdsauCdsid { get; set; }

    public string CdsauAction { get; set; } = null!;

    public string? CdsauTableName { get; set; }

    public Guid? CdsauRecordId { get; set; }

    public Guid? CdsauChangedBy { get; set; }

    public DateTime CdsauChangedAt { get; set; }

    public string? CdsauOldValues { get; set; }

    public string? CdsauNewValues { get; set; }

    public string? CdsauSource { get; set; }

    public string? CdsauNotes { get; set; }

    public virtual CdsDeclaration? CdsauCds { get; set; }
}
