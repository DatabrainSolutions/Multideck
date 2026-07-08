using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentStatusHistory
{
    public Guid FindocStatusId { get; set; }

    public Guid FindocStatusDocumentId { get; set; }

    public string? FindocStatusFromStatusCode { get; set; }

    public string FindocStatusToStatusCode { get; set; } = null!;

    public DateTime FindocStatusChangedAt { get; set; }

    public Guid? FindocStatusChangedBy { get; set; }

    public string? FindocStatusReason { get; set; }

    public string FindocStatusMetadataJson { get; set; } = null!;

    public virtual CmpUser? FindocStatusChangedByNavigation { get; set; }

    public virtual FinDocument FindocStatusDocument { get; set; } = null!;

    public virtual SysFinanceDocumentStatus FindocStatusToStatusCodeNavigation { get; set; } = null!;
}
