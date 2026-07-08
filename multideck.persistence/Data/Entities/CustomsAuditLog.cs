using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CustomsAuditLog
{
    public Guid CustauId { get; set; }

    public Guid? CustauCustomsId { get; set; }

    public string CustauAction { get; set; } = null!;

    public string? CustauTableName { get; set; }

    public Guid? CustauRecordId { get; set; }

    public Guid? CustauChangedBy { get; set; }

    public DateTime CustauChangedAt { get; set; }

    public string? CustauOldValues { get; set; }

    public string? CustauNewValues { get; set; }

    public string? CustauSource { get; set; }

    public string? CustauNotes { get; set; }

    public virtual CustomsDeclaration? CustauCustoms { get; set; }
}
