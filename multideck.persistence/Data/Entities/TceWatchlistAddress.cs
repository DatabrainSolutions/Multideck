using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceWatchlistAddress
{
    public Guid TceaddrId { get; set; }

    public Guid TceaddrEntryId { get; set; }

    public string? TceaddrAddressLine1 { get; set; }

    public string? TceaddrAddressLine2 { get; set; }

    public string? TceaddrCity { get; set; }

    public string? TceaddrRegion { get; set; }

    public string? TceaddrPostcode { get; set; }

    public string? TceaddrCountryCode { get; set; }

    public string? TceaddrRawAddress { get; set; }

    public DateTime TceaddrCreatedAt { get; set; }

    public virtual TceWatchlistEntry TceaddrEntry { get; set; } = null!;
}
