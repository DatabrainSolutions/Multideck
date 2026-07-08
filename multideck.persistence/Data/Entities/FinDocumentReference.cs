using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentReference
{
    public Guid FindocRefId { get; set; }

    public Guid FindocRefDocumentId { get; set; }

    public string FindocRefReferenceTypeCode { get; set; } = null!;

    public string FindocRefReferenceValue { get; set; } = null!;

    public string? FindocRefSourceTable { get; set; }

    public Guid? FindocRefSourceId { get; set; }

    public DateTime FindocRefCreatedAt { get; set; }

    public virtual FinDocument FindocRefDocument { get; set; } = null!;
}
