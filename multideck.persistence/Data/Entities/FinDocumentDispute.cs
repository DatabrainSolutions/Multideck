using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDocumentDispute
{
    public Guid FindocDispId { get; set; }

    public Guid FindocDispDocumentId { get; set; }

    public string FindocDispStatusCode { get; set; } = null!;

    public string FindocDispReasonCode { get; set; } = null!;

    public decimal FindocDispDisputedAmount { get; set; }

    public decimal FindocDispLocalDisputedAmount { get; set; }

    public DateTime FindocDispOpenedAt { get; set; }

    public Guid? FindocDispOpenedBy { get; set; }

    public DateTime? FindocDispResolvedAt { get; set; }

    public Guid? FindocDispResolvedBy { get; set; }

    public string? FindocDispResolutionNotes { get; set; }

    public virtual FinDocument FindocDispDocument { get; set; } = null!;

    public virtual CmpUser? FindocDispOpenedByNavigation { get; set; }

    public virtual CmpUser? FindocDispResolvedByNavigation { get; set; }
}
