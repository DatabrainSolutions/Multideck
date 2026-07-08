using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlAuditLog
{
    public Guid BlauId { get; set; }

    public Guid? BlauBlId { get; set; }

    public string BlauEventType { get; set; } = null!;

    public string BlauEventSummary { get; set; } = null!;

    public string BlauEventPayload { get; set; } = null!;

    public DateTime BlauCreatedAt { get; set; }

    public Guid? BlauCreatedBy { get; set; }

    public virtual BlHeader? BlauBl { get; set; }
}
