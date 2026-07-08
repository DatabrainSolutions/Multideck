using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceWatchlistIdentifier
{
    public Guid TceidentId { get; set; }

    public Guid TceidentEntryId { get; set; }

    public string TceidentTypeCode { get; set; } = null!;

    public string TceidentValue { get; set; } = null!;

    public string? TceidentCountryCode { get; set; }

    public DateOnly? TceidentIssuedAt { get; set; }

    public DateOnly? TceidentExpiresAt { get; set; }

    public DateTime TceidentCreatedAt { get; set; }

    public virtual TceWatchlistEntry TceidentEntry { get; set; } = null!;
}
