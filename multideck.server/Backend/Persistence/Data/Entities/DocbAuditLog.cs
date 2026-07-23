using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocbAuditLog
{
    public Guid DocbaId { get; set; }

    public string DocbaEntityTable { get; set; } = null!;

    public Guid DocbaEntityId { get; set; }

    public string DocbaAction { get; set; } = null!;

    public string? DocbaFromStatusCode { get; set; }

    public string? DocbaToStatusCode { get; set; }

    public string? DocbaMessage { get; set; }

    public string DocbaChangeJson { get; set; } = null!;

    public DateTime DocbaCreatedAt { get; set; }

    public Guid? DocbaCreatedBy { get; set; }

    public virtual CmpUser? DocbaCreatedByNavigation { get; set; }
}
