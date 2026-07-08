using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcelistType
{
    public string TcelistTypeCode { get; set; } = null!;

    public string TcelistTypeName { get; set; } = null!;

    public string? TcelistTypeDescription { get; set; }

    public bool TcelistTypeIsBlockingCandidate { get; set; }

    public bool TcelistTypeIsActive { get; set; }

    public int TcelistTypeSortOrder { get; set; }

    public virtual ICollection<TceDataSource> TceDataSources { get; set; } = new List<TceDataSource>();

    public virtual ICollection<TceInternalWatchlist> TceInternalWatchlists { get; set; } = new List<TceInternalWatchlist>();

    public virtual ICollection<TceScreeningMatch> TceScreeningMatches { get; set; } = new List<TceScreeningMatch>();

    public virtual ICollection<TceWatchlistEntry> TceWatchlistEntries { get; set; } = new List<TceWatchlistEntry>();
}
